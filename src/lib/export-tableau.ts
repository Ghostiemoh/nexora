/* Tableau export.
 *
 * A .twb is documented XML and a .twbx is that XML zipped next to its data, so
 * unlike Power BI this one can be written exactly as Tableau stores it. The
 * workbook carries the datasource with typed columns, a calculated field per
 * measure, one worksheet per visual, and a dashboard that arranges them.
 *
 * Tableau is stricter about its own schema than Power BI is, so a `manual/`
 * folder ships alongside: a .tds datasource (a much smaller, very stable
 * format), the calculations as text, and the CSV. If a Tableau version rejects
 * the workbook, connecting the .tds and dropping the fields is a two-minute job
 * rather than a rebuild.
 *
 * Pure string generation, so every file can be asserted on in a test. */

import type { BiDashboard, BiField, BiVisual } from "./bi-model";
import type { ZipEntry } from "./zip";
import type { ChartType } from "./chart-recommend";
import { CHART_PALETTE } from "./chart-palette";

/** Tableau's datatype names. */
const TABLEAU_TYPE: Record<string, string> = {
  string: "string",
  number: "real",
  date: "date",
  boolean: "boolean",
};

/** Continuous or discrete, which is what drives how Tableau draws a field. */
const TABLEAU_ROLE: Record<string, { role: string; type: string }> = {
  string: { role: "dimension", type: "nominal" },
  date: { role: "dimension", type: "ordinal" },
  boolean: { role: "dimension", type: "nominal" },
  number: { role: "measure", type: "quantitative" },
};

/** The mark type each Nexora chart becomes on a Tableau worksheet. */
export const TABLEAU_MARK: Record<ChartType, string> = {
  bar: "Bar",
  line: "Line",
  area: "Area",
  pie: "Pie",
  doughnut: "Pie",
  scatter: "Circle",
  histogram: "Bar",
  heatmap: "Square",
};

export function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Tableau brackets every field name; an embedded bracket has to be doubled. */
export function tableauField(name: string): string {
  return `[${name.replace(/]/g, "]]")}]`;
}

/** A worksheet name Tableau will accept, unique within the workbook. */
export function worksheetName(visual: BiVisual, index: number): string {
  const cleaned = visual.title.replace(/[<>&"']/g, "").trim().slice(0, 40);
  return cleaned.length > 0 ? `${index + 1}. ${cleaned}` : `Sheet ${index + 1}`;
}

function columnXml(field: BiField): string {
  const role = TABLEAU_ROLE[field.dataType] ?? TABLEAU_ROLE.string;
  return (
    `        <column caption="${escapeXmlAttr(field.caption)}" datatype="${TABLEAU_TYPE[field.dataType] ?? "string"}" ` +
    `name="${escapeXmlAttr(tableauField(field.name))}" role="${role.role}" type="${role.type}" />`
  );
}

/** A calculated field per measure, so the aggregations travel with the workbook
 *  rather than being something the reader has to remember to recreate. */
function calculationXml(name: string, formula: string, index: number): string {
  const id = `[Calculation_${index}]`;
  return [
    `        <column caption="${escapeXmlAttr(name)}" datatype="real" name="${id}" role="measure" type="quantitative">`,
    `          <calculation class="tableau" formula="${escapeXmlAttr(formula)}" />`,
    `        </column>`,
  ].join("\n");
}

function datasourceXml(dash: BiDashboard, csvName: string, indent: string): string {
  const lines: string[] = [
    `${indent}<datasource caption="${escapeXmlAttr(dash.datasetName)}" inline="true" name="nexora.data" version="18.1">`,
    `${indent}  <connection class="federated">`,
    `${indent}    <named-connections>`,
    `${indent}      <named-connection caption="${escapeXmlAttr(csvName)}" name="textscan.nexora">`,
    `${indent}        <connection class="textscan" directory="Data" filename="${escapeXmlAttr(csvName)}" password="" server="" />`,
    `${indent}      </named-connection>`,
    `${indent}    </named-connections>`,
    `${indent}    <relation connection="textscan.nexora" name="${escapeXmlAttr(csvName)}" table="[${escapeXmlAttr(csvName.replace(/\./g, "#"))}]" type="table" />`,
    `${indent}  </connection>`,
    ...dash.fields.map(columnXml),
    ...dash.measures.map((m, i) => calculationXml(m.name, m.tableau, i + 1)),
    `${indent}</datasource>`,
  ];
  return lines.join("\n");
}

/** One worksheet. The shelves are filled from the visual's own fields, so a
 *  chart that was a breakdown on screen is a breakdown in Tableau. */
function worksheetXml(dash: BiDashboard, visual: BiVisual, index: number): string {
  const name = worksheetName(visual, index);
  const measure = dash.measures.find(
    (m) => m.column === (visual.y ?? "*") && m.agg === visual.agg
  );
  const measureIndex = measure ? dash.measures.indexOf(measure) + 1 : 1;

  const columnShelf = visual.x ? tableauField(visual.x) : "";
  const rowShelf = `[Calculation_${measureIndex}]`;
  const colorShelf = visual.series ? tableauField(visual.series) : null;

  return [
    `    <worksheet name="${escapeXmlAttr(name)}">`,
    `      <table>`,
    `        <view>`,
    `          <datasources>`,
    `            <datasource caption="${escapeXmlAttr(dash.datasetName)}" name="nexora.data" />`,
    `          </datasources>`,
    `          <datasource-dependencies datasource="nexora.data">`,
    ...dash.fields
      .filter((f) => f.name === visual.x || f.name === visual.series || f.name === visual.y)
      .map(columnXml),
    measure ? calculationXml(measure.name, measure.tableau, measureIndex) : "",
    `          </datasource-dependencies>`,
    colorShelf
      ? `          <shelf-sorts><shelf-sort-v2 dimension-to-sort="[nexora.data].${escapeXmlAttr(colorShelf)}" direction="DESC" /></shelf-sorts>`
      : "",
    `        </view>`,
    `        <style />`,
    `        <panes>`,
    `          <pane id="1" selection-relaxation-option="selection-relaxation-allow">`,
    `            <view><breakdown value="auto" /></view>`,
    `            <mark class="${TABLEAU_MARK[visual.type]}" />`,
    colorShelf
      ? `            <encodings><color column="[nexora.data].${escapeXmlAttr(colorShelf)}" /></encodings>`
      : "",
    `          </pane>`,
    `        </panes>`,
    `        <rows>[nexora.data].${escapeXmlAttr(rowShelf)}</rows>`,
    columnShelf ? `        <cols>[nexora.data].${escapeXmlAttr(columnShelf)}</cols>` : `        <cols />`,
    `      </table>`,
    `      <simple-id uuid="{nexora-sheet-${index + 1}}" />`,
    `    </worksheet>`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** The dashboard: a zone per worksheet, positioned on Tableau's 100 000-unit
 *  grid, mirroring where each panel sat on screen. */
function dashboardXml(dash: BiDashboard): string {
  const gridWidth = 1280;
  const gridHeight = Math.max(
    720,
    ...dash.visuals.map((v) => v.layout.y + v.layout.height + 24)
  );
  const scaleX = (value: number) => Math.round((value / gridWidth) * 100_000);
  const scaleY = (value: number) => Math.round((value / gridHeight) * 100_000);

  const zones = dash.visuals.map((visual, i) => {
    const name = worksheetName(visual, i);
    return [
      `          <zone h="${scaleY(visual.layout.height)}" id="${i + 4}" name="${escapeXmlAttr(name)}" ` +
        `w="${scaleX(visual.layout.width)}" x="${scaleX(visual.layout.x)}" y="${scaleY(visual.layout.y)}">`,
      `            <zone-style>`,
      `              <format attr="border-color" value="#242a2c" />`,
      `              <format attr="border-style" value="solid" />`,
      `              <format attr="border-width" value="1" />`,
      `              <format attr="margin" value="4" />`,
      `            </zone-style>`,
      `          </zone>`,
    ].join("\n");
  });

  const filterZones = dash.slicers.map((slicer, i) => {
    return (
      `          <zone h="8000" id="${i + 400}" param="[nexora.data].${escapeXmlAttr(tableauField(slicer.column))}" ` +
      `type-v2="filter" w="${scaleX(slicer.layout.width)}" x="${scaleX(slicer.layout.x)}" y="${scaleY(slicer.layout.y)}" />`
    );
  });

  return [
    `    <dashboard name="${escapeXmlAttr(dash.datasetName)}">`,
    `      <style />`,
    `      <size maxheight="${gridHeight}" maxwidth="${gridWidth}" minheight="${gridHeight}" minwidth="${gridWidth}" />`,
    `      <zones>`,
    `        <zone h="100000" id="1" type-v2="layout-basic" w="100000" x="0" y="0">`,
    ...filterZones,
    ...zones,
    `          <zone-style>`,
    `            <format attr="border-color" value="#242a2c" />`,
    `            <format attr="background-color" value="#101315" />`,
    `          </zone-style>`,
    `        </zone>`,
    `      </zones>`,
    `      <simple-id uuid="{nexora-dashboard}" />`,
    `    </dashboard>`,
  ].join("\n");
}

/** The full workbook. */
export function buildTwb(dash: BiDashboard, csvName = "dataset.csv"): string {
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<!-- Generated by Nexora on ${dash.generatedAt.slice(0, 10)} -->`,
    `<workbook original-version="18.1" source-build="2023.1" source-platform="win" version="18.1" xmlns:user="http://www.tableausoftware.com/xml/user">`,
    `  <preferences>`,
    `    <preference name="ui.encoding.shelf.height" value="24" />`,
    `    <color-palette name="Nexora" type="regular">`,
    ...CHART_PALETTE.map((color) => `      <color>${color}</color>`),
    `    </color-palette>`,
    `  </preferences>`,
    `  <datasources>`,
    datasourceXml(dash, csvName, "    "),
    `  </datasources>`,
    `  <worksheets>`,
    ...dash.visuals.map((visual, i) => worksheetXml(dash, visual, i)),
    `  </worksheets>`,
    `  <dashboards>`,
    dashboardXml(dash),
    `  </dashboards>`,
    `</workbook>`,
  ].join("\n");
}

/** The standalone datasource: connection, typed fields, and calculations. The
 *  reliable fallback when a workbook will not open. */
export function buildTds(dash: BiDashboard, csvName = "dataset.csv"): string {
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<datasource formatted-name="${escapeXmlAttr(dash.datasetName)}" inline="true" source-platform="win" version="18.1" xmlns:user="http://www.tableausoftware.com/xml/user">`,
    `  <connection class="textscan" directory="Data" filename="${escapeXmlAttr(csvName)}" password="" server="" />`,
    ...dash.fields.map(columnXml),
    ...dash.measures.map((m, i) => calculationXml(m.name, m.tableau, i + 1)),
    `</datasource>`,
  ].join("\n");
}

/** A Tableau colour preferences file carrying Nexora's palette. */
export function buildTableauPreferences(): string {
  return [
    `<?xml version="1.0"?>`,
    `<workbook>`,
    `  <preferences>`,
    `    <color-palette name="Nexora" type="regular">`,
    ...CHART_PALETTE.map((color) => `      <color>${color}</color>`),
    `    </color-palette>`,
    `  </preferences>`,
    `</workbook>`,
  ].join("\n");
}

function buildCalculationsDoc(dash: BiDashboard): string {
  return [
    `# Calculated fields for ${dash.datasetName}`,
    "",
    "Create each of these in Tableau: right-click the data pane ▸ Create Calculated Field.",
    "",
    ...dash.measures.map((m) => `**${m.name}**\n\n\`\`\`\n${m.tableau}\n\`\`\`\n`),
    "## Worksheets",
    "",
    "| Worksheet | Mark | Columns | Rows | Colour |",
    "| --- | --- | --- | --- | --- |",
    ...dash.visuals.map(
      (v, i) =>
        `| ${worksheetName(v, i)} | ${TABLEAU_MARK[v.type]} | ${v.x ?? "—"} | ${v.y ? `${v.agg} of ${v.y}` : "count of rows"} | ${v.series ?? "—"} |`
    ),
    "",
  ].join("\n");
}

function buildReadme(dash: BiDashboard): string {
  return [
    `# ${dash.datasetName} — Tableau export`,
    "",
    `Generated by Nexora on ${dash.generatedAt.slice(0, 10)} from ${dash.rowCount.toLocaleString("en-US")} row(s).`,
    dash.filtered ? "\n> This export carries only the rows left by the dashboard filters.\n" : "",
    "## Option A — open the workbook",
    "",
    `Open \`${dash.name}.twb\`. It expects \`Data/${"dataset.csv"}\` beside it, which is where the unzip puts it.`,
    "",
    "What comes across: the CSV connection with typed fields, a calculated field per measure, one worksheet per chart with its marks and shelves, a dashboard arranging them, and a filter per slicer.",
    "",
    "## Option B — connect the datasource",
    "",
    "Tableau is strict about workbook XML, and an older version may decline one it did not write. Nothing is lost:",
    "",
    "1. Open `manual/datasource.tds` — it carries the same connection, field types, and calculations.",
    "2. Drag fields onto the shelves using `manual/calculations.md`, which lists exactly what each worksheet had.",
    "3. Load `manual/preferences.tps` for the colour palette.",
    "",
    "## Data",
    "",
    "`Data/dataset.csv` is the cleaned table exactly as Nexora had it, UTF-8, comma-separated.",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Every file the Tableau export ships, ready to zip into a .twbx. */
export function buildTableauFiles(dash: BiDashboard): ZipEntry[] {
  const csvName = "dataset.csv";
  const entries: ZipEntry[] = [
    { path: `${dash.name}.twb`, data: buildTwb(dash, csvName) },
    { path: "manual/datasource.tds", data: buildTds(dash, csvName) },
    { path: "manual/calculations.md", data: buildCalculationsDoc(dash) },
    { path: "manual/preferences.tps", data: buildTableauPreferences() },
    { path: "README.md", data: buildReadme(dash) },
  ];

  if (dash.csv) {
    // Tableau resolves a packaged workbook's data out of a Data/ folder.
    entries.push({ path: `Data/${csvName}`, data: dash.csv });
  }

  return entries;
}
