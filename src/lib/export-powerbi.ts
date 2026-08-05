/* Power BI export.
 *
 * A .pbix cannot honestly be written in a browser: its data model is a
 * proprietary compressed store, not a documented format. What Microsoft does
 * publish is PBIP — the same report and semantic model expressed as plain text
 * files in a folder. That is what this writes, so the export opens in Power BI
 * Desktop as a live report you keep working in rather than a picture of one.
 *
 * A `manual/` folder rides along with the Power Query script, the DAX measures,
 * and the theme as separate files. If the PBIP preview toggle is off, or the
 * installed Desktop is older than the format, none of the work is lost: paste
 * the M, paste the measures, import the theme.
 *
 * Pure string generation, so every file can be asserted on in a test. */

import type { BiDashboard, BiVisual } from "./bi-model";
import type { ZipEntry } from "./zip";
import type { ChartType } from "./chart-recommend";
import type { Aggregation } from "./chart-recommend";
import { CHART_PALETTE } from "./chart-palette";

/** The Power BI visual each Nexora chart type maps onto. */
export const POWERBI_VISUAL: Record<ChartType, string> = {
  bar: "clusteredColumnChart",
  line: "lineChart",
  area: "areaChart",
  pie: "pieChart",
  doughnut: "donutChart",
  scatter: "scatterChart",
  histogram: "clusteredColumnChart",
  heatmap: "matrix",
};

/** Power BI's aggregation function codes, used inside a visual's query. */
const AGG_CODE: Record<Aggregation, number> = {
  sum: 0,
  avg: 1,
  min: 2,
  max: 3,
  count: 5,
};

/** The projection buckets a Power BI visual reads its fields from. Keyed by the
 *  Power BI visual name, since that is what decides the shelf names. */
function projectionRoles(visualType: string): { category: string; value: string; series?: string } {
  if (visualType === "pieChart" || visualType === "donutChart") {
    return { category: "Category", value: "Y" };
  }
  if (visualType === "scatterChart") return { category: "X", value: "Y" };
  if (visualType === "matrix") return { category: "Rows", value: "Values", series: "Columns" };
  return { category: "Category", value: "Y", series: "Series" };
}

const SOURCE = "d";

interface QuerySelect {
  ref: string;
  json: Record<string, unknown>;
}

/** The column and aggregation selects one visual needs. */
function visualSelects(visual: BiVisual, table: string): QuerySelect[] {
  const selects: QuerySelect[] = [];

  const column = (property: string): QuerySelect => ({
    ref: `${table}.${property}`,
    json: {
      Column: { Expression: { SourceRef: { Source: SOURCE } }, Property: property },
      Name: `${table}.${property}`,
    },
  });

  if (visual.x) selects.push(column(visual.x));
  if (visual.series) selects.push(column(visual.series));

  if (visual.y && visual.agg !== "count") {
    const fn = AGG_CODE[visual.agg];
    const ref = `${visual.agg === "sum" ? "Sum" : visual.agg === "avg" ? "Avg" : visual.agg === "min" ? "Min" : "Max"}(${table}.${visual.y})`;
    selects.push({
      ref,
      json: {
        Aggregation: {
          Expression: {
            Column: { Expression: { SourceRef: { Source: SOURCE } }, Property: visual.y },
          },
          Function: fn,
        },
        Name: ref,
      },
    });
  } else {
    // Counting rows works off any column, and the first one always exists.
    const target = visual.y ?? visual.x;
    if (target) {
      const ref = `CountNonNull(${table}.${target})`;
      selects.push({
        ref,
        json: {
          Aggregation: {
            Expression: {
              Column: { Expression: { SourceRef: { Source: SOURCE } }, Property: target },
            },
            Function: AGG_CODE.count,
          },
          Name: ref,
        },
      });
    }
  }

  return selects;
}

/** One visual container. Power BI stores each container's definition as a JSON
 *  string inside the layout JSON, which is why config is stringified twice. */
function visualContainer(visual: BiVisual, table: string): Record<string, unknown> {
  const roles = projectionRoles(POWERBI_VISUAL[visual.type]);
  const selects = visualSelects(visual, table);

  const projections: Record<string, { queryRef: string }[]> = {};
  const categoryRefs: { queryRef: string }[] = [];
  const valueRefs: { queryRef: string }[] = [];
  const seriesRefs: { queryRef: string }[] = [];

  for (const select of selects) {
    if (select.ref === `${table}.${visual.x}`) categoryRefs.push({ queryRef: select.ref });
    else if (visual.series && select.ref === `${table}.${visual.series}`)
      seriesRefs.push({ queryRef: select.ref });
    else valueRefs.push({ queryRef: select.ref });
  }

  if (categoryRefs.length > 0) projections[roles.category] = categoryRefs;
  if (valueRefs.length > 0) projections[roles.value] = valueRefs;
  if (seriesRefs.length > 0 && roles.series) projections[roles.series] = seriesRefs;

  const config = {
    name: visual.id,
    layouts: [
      {
        id: 0,
        position: {
          x: visual.layout.x,
          y: visual.layout.y,
          width: visual.layout.width,
          height: visual.layout.height,
          z: 0,
        },
      },
    ],
    singleVisual: {
      visualType: POWERBI_VISUAL[visual.type],
      projections,
      prototypeQuery: {
        Version: 2,
        From: [{ Name: SOURCE, Entity: table, Type: 0 }],
        Select: selects.map((s) => s.json),
      },
      drillFilterOtherVisuals: true,
      vcObjects: {
        title: [
          {
            properties: {
              text: { expr: { Literal: { Value: `'${visual.title.replace(/'/g, "")}'` } } },
              show: { expr: { Literal: { Value: "true" } } },
            },
          },
        ],
      },
    },
  };

  return {
    x: visual.layout.x,
    y: visual.layout.y,
    z: 0,
    width: visual.layout.width,
    height: visual.layout.height,
    config: JSON.stringify(config),
    filters: "[]",
  };
}

/** A slicer container, so the filters on screen arrive as real slicers. */
function slicerContainer(
  slicer: BiDashboard["slicers"][number],
  table: string
): Record<string, unknown> {
  const ref = `${table}.${slicer.column}`;
  const config = {
    name: `slicer_${slicer.column}`,
    layouts: [
      {
        id: 0,
        position: { ...slicer.layout, z: 0 },
      },
    ],
    singleVisual: {
      visualType: "slicer",
      projections: { Values: [{ queryRef: ref }] },
      prototypeQuery: {
        Version: 2,
        From: [{ Name: SOURCE, Entity: table, Type: 0 }],
        Select: [
          {
            Column: { Expression: { SourceRef: { Source: SOURCE } }, Property: slicer.column },
            Name: ref,
          },
        ],
      },
      vcObjects: {
        title: [
          {
            properties: {
              text: { expr: { Literal: { Value: `'${slicer.caption.replace(/'/g, "")}'` } } },
              show: { expr: { Literal: { Value: "true" } } },
            },
          },
        ],
      },
    },
  };

  return {
    ...slicer.layout,
    z: 0,
    config: JSON.stringify(config),
    filters: "[]",
  };
}

/** The TMSL data type each neutral type maps onto. */
const TMSL_TYPE: Record<string, string> = {
  string: "string",
  number: "double",
  date: "dateTime",
  boolean: "boolean",
};

/** The Power Query type each neutral type maps onto. */
const M_TYPE: Record<string, string> = {
  string: "type text",
  number: "type number",
  date: "type date",
  boolean: "type logical",
};

/** The Power Query script that loads the bundled CSV. Written as its own
 *  function because it is also the manual fallback: paste it into Power Query
 *  and the model builds itself. */
export function buildPowerQuery(dash: BiDashboard, csvPath = "data/dataset.csv"): string {
  const typed = dash.fields
    .map((f) => `{"${f.name}", ${M_TYPE[f.dataType] ?? "type text"}}`)
    .join(", ");

  return [
    "// Generated by Nexora. Point CsvPath at the bundled CSV, then refresh.",
    "let",
    `    CsvPath = "${csvPath}",`,
    "    Source = Csv.Document(File.Contents(CsvPath), [Delimiter = \",\", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),",
    "    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),",
    `    Typed = Table.TransformColumnTypes(Promoted, {${typed}})`,
    "in",
    "    Typed",
  ].join("\n");
}

/** The semantic model: tables, typed columns, and the DAX measures. */
export function buildModelBim(dash: BiDashboard): string {
  const model = {
    name: dash.name,
    compatibilityLevel: 1567,
    model: {
      culture: "en-US",
      dataAccessOptions: { legacyRedirects: true, returnErrorValuesAsNull: true },
      defaultPowerBIDataSourceVersion: "powerBI_V3",
      sourceQueryCulture: "en-US",
      tables: [
        {
          name: dash.tableName,
          columns: dash.fields.map((field) => ({
            name: field.name,
            dataType: TMSL_TYPE[field.dataType] ?? "string",
            sourceColumn: field.name,
            summarizeBy: field.role === "measure" ? "sum" : "none",
            annotations: [
              { name: "SummarizationSetBy", value: "Automatic" },
              ...(field.dataType === "date"
                ? [{ name: "UnderlyingDateTimeDataType", value: "Date" }]
                : []),
            ],
          })),
          measures: dash.measures
            // The row count is a table expression, not a column aggregation.
            .map((measure) => ({
              name: measure.name,
              expression: measure.dax.split(" = ").slice(1).join(" = "),
              formatString: measure.agg === "avg" ? "#,0.00" : "#,0",
            })),
          partitions: [
            {
              name: dash.tableName,
              mode: "import",
              source: { type: "m", expression: buildPowerQuery(dash).split("\n") },
            },
          ],
          annotations: [{ name: "PBI_ResultType", value: "Table" }],
        },
      ],
      annotations: [
        { name: "PBI_QueryOrder", value: JSON.stringify([dash.tableName]) },
        { name: "__PBI_TimeIntelligenceEnabled", value: "0" },
        { name: "Nexora_GeneratedAt", value: dash.generatedAt },
      ],
    },
  };

  return JSON.stringify(model, null, 2);
}

/** The report layout: one page carrying the slicers and every visual. */
export function buildReportJson(dash: BiDashboard): string {
  const containers = [
    ...dash.slicers.map((slicer) => slicerContainer(slicer, dash.tableName)),
    ...dash.visuals.map((visual) => visualContainer(visual, dash.tableName)),
  ];

  const report = {
    id: 0,
    resourcePackages: [
      {
        resourcePackage: {
          disabled: false,
          items: [{ name: "Nexora", path: "BaseThemes/theme.json", type: 202 }],
          name: "SharedResources",
          type: 2,
        },
      },
    ],
    sections: [
      {
        id: 0,
        name: "NexoraPage",
        displayName: dash.datasetName,
        filters: "[]",
        ordinal: 0,
        width: 1280,
        height: 720,
        config: JSON.stringify({
          visibility: 0,
          defaultLayout: { displayOption: 1 },
        }),
        visualContainers: containers,
      },
    ],
    config: JSON.stringify({
      version: "5.43",
      themeCollection: { baseTheme: { name: "Nexora", version: "5.43", type: 2 } },
      activeSectionIndex: 0,
      defaultDrillFilterOtherVisuals: true,
      settings: { useStylableVisualContainerHeader: true },
    }),
    layoutOptimization: 0,
  };

  return JSON.stringify(report, null, 2);
}

/** A Power BI theme carrying Nexora's palette, so the exported report is not a
 *  default-blue stranger. */
export function buildTheme(name: string): string {
  return JSON.stringify(
    {
      name: `${name} (Nexora)`,
      dataColors: CHART_PALETTE,
      background: "#101315",
      foreground: "#F1F2ED",
      tableAccent: CHART_PALETTE[0],
      visualStyles: {
        "*": {
          "*": {
            background: [{ color: { solid: { color: "#161A1C" } } }],
            border: [{ show: true, color: { solid: { color: "#242A2C" } }, radius: 10 }],
            title: [{ fontColor: { solid: { color: "#F1F2ED" } }, fontSize: 11 }],
            labels: [{ color: { solid: { color: "#B7BFBA" } } }],
          },
        },
      },
    },
    null,
    2
  );
}

/** The DAX measures as a paste-ready file. */
export function buildDaxFile(dash: BiDashboard): string {
  return [
    `// Measures for ${dash.datasetName}`,
    "// Paste each line into Power BI Desktop: Modeling ▸ New measure.",
    "",
    ...dash.measures.map((m) => m.dax),
    "",
  ].join("\n");
}

function buildReadme(dash: BiDashboard): string {
  return [
    `# ${dash.datasetName} — Power BI export`,
    "",
    `Generated by Nexora on ${dash.generatedAt.slice(0, 10)} from ${dash.rowCount.toLocaleString("en-US")} row(s).`,
    dash.filtered ? "\n> This export carries only the rows left by the dashboard filters.\n" : "",
    "## Option A — open the project",
    "",
    `1. Unzip this folder somewhere permanent.`,
    `2. In Power BI Desktop, turn on **File ▸ Options ▸ Preview features ▸ Power BI Project (.pbip) save format**, then restart.`,
    `3. Open \`${dash.name}.pbip\`.`,
    `4. The model points at \`data/dataset.csv\` by a relative path. If Power BI cannot find it, open Power Query and set \`CsvPath\` to the absolute path of that file, then **Refresh**.`,
    "",
    "What comes across: the table and its column types, the measures, the page layout, every visual with its fields and aggregation, and the slicers.",
    "",
    "## Option B — rebuild from the parts",
    "",
    "If the .pbip format is unavailable in your version, everything is in `manual/`:",
    "",
    "- `queries.m` — paste into **Home ▸ Transform data ▸ Advanced Editor** to load and type the data.",
    "- `measures.dax` — one measure per line, paste into **Modeling ▸ New measure**.",
    "- `theme.json` — **View ▸ Themes ▸ Browse for themes**.",
    "- `visuals.md` — the chart list, so you can lay the page out the same way.",
    "",
    "## Data",
    "",
    "`data/dataset.csv` is the cleaned table exactly as Nexora had it, UTF-8, comma-separated.",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildVisualsDoc(dash: BiDashboard): string {
  const lines = [
    `# Visuals in ${dash.datasetName}`,
    "",
    "| Visual | Power BI type | Axis | Values | Legend |",
    "| --- | --- | --- | --- | --- |",
    ...dash.visuals.map(
      (v) =>
        `| ${v.title} | ${POWERBI_VISUAL[v.type]} | ${v.x ?? "—"} | ${v.y ? `${v.agg} of ${v.y}` : "count of rows"} | ${v.series ?? "—"} |`
    ),
  ];

  if (dash.slicers.length > 0) {
    lines.push("", "## Slicers", "");
    for (const slicer of dash.slicers) {
      const selected = slicer.selected.length > 0 ? ` (selected: ${slicer.selected.join(", ")})` : "";
      lines.push(`- ${slicer.caption} — ${slicer.values.length} value(s)${selected}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

/** Every file the Power BI export ships, ready to zip. */
export function buildPowerBiFiles(dash: BiDashboard): ZipEntry[] {
  const root = dash.name;

  const entries: ZipEntry[] = [
    {
      path: `${root}.pbip`,
      data: JSON.stringify(
        {
          $schema: "https://developer.microsoft.com/json-schemas/fabric/item/pbip/definitionProperties/1.0.0/schema.json",
          version: "1.0",
          artifacts: [{ report: { path: `${root}.Report` } }],
          settings: { enableAutoRecovery: true },
        },
        null,
        2
      ),
    },
    {
      path: `${root}.Dataset/definition.pbism`,
      data: JSON.stringify({ version: "4.0", settings: {} }, null, 2),
    },
    { path: `${root}.Dataset/model.bim`, data: buildModelBim(dash) },
    {
      path: `${root}.Dataset/.platform`,
      data: JSON.stringify(
        {
          $schema: "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
          metadata: { type: "SemanticModel", displayName: root },
          config: { version: "2.0", logicalId: "00000000-0000-0000-0000-000000000000" },
        },
        null,
        2
      ),
    },
    {
      path: `${root}.Report/definition.pbir`,
      data: JSON.stringify(
        { version: "4.0", datasetReference: { byPath: { path: `../${root}.Dataset` } } },
        null,
        2
      ),
    },
    { path: `${root}.Report/report.json`, data: buildReportJson(dash) },
    {
      path: `${root}.Report/StaticResources/SharedResources/BaseThemes/theme.json`,
      data: buildTheme(dash.datasetName),
    },
    { path: "manual/queries.m", data: buildPowerQuery(dash) },
    { path: "manual/measures.dax", data: buildDaxFile(dash) },
    { path: "manual/theme.json", data: buildTheme(dash.datasetName) },
    { path: "manual/visuals.md", data: buildVisualsDoc(dash) },
    { path: "README.md", data: buildReadme(dash) },
  ];

  if (dash.csv) {
    entries.push({ path: "data/dataset.csv", data: dash.csv });
  }

  return entries;
}
