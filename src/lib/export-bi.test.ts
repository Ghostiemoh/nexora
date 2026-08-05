import { describe, it, expect } from "vitest";
import { profileDataset } from "./profile";
import { buildDashboardLayout } from "./dashboard";
import { buildBiDashboard, buildMeasure, measureName, safeName, biDataType } from "./bi-model";
import {
  buildDaxFile,
  buildModelBim,
  buildPowerBiFiles,
  buildPowerQuery,
  buildReportJson,
  buildTheme,
  POWERBI_VISUAL,
} from "./export-powerbi";
import {
  buildTableauFiles,
  buildTds,
  buildTwb,
  escapeXmlAttr,
  tableauField,
  worksheetName,
  TABLEAU_MARK,
} from "./export-tableau";
import { createZip } from "./zip";
import type { Row } from "./types";

const REGIONS = ["West", "East", "North", "South"];
const PRODUCTS = ["Widget", "Gadget", "Doohickey"];

function salesRows(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 60; i++) {
    rows.push({
      order_date: `2026-0${(i % 6) + 1}-1${i % 9}`,
      region: REGIONS[i % REGIONS.length],
      product: PRODUCTS[i % PRODUCTS.length],
      revenue: 100 + (i % 17) * 37,
      units: 1 + (i % 9),
    });
  }
  return rows;
}

function fixture() {
  const dataset = profileDataset({
    id: "ds_sales",
    name: "regional_sales.csv",
    columns: ["order_date", "region", "product", "revenue", "units"],
    rows: salesRows(),
    createdAt: 0,
    changelog: [],
  });
  const layout = buildDashboardLayout(dataset);
  const dash = buildBiDashboard(dataset, layout, { generatedAt: "2026-08-05T00:00:00.000Z" });
  return { dataset, layout, dash };
}

/** Read a ZipEntry list back as a path → text map. */
function filesOf(entries: { path: string; data: string | Uint8Array }[]) {
  const map = new Map<string, string>();
  for (const entry of entries) {
    map.set(entry.path, typeof entry.data === "string" ? entry.data : "<binary>");
  }
  return map;
}

describe("bi-model", () => {
  it("makes a name safe for a folder and a filename", () => {
    expect(safeName("Q3 sales / west.xlsx")).toBe("Q3_sales_west");
    expect(safeName("....")).toBe("Nexora_Dashboard");
  });

  it("maps every inferred type onto the four types both platforms share", () => {
    expect(biDataType("number")).toBe("number");
    expect(biDataType("date")).toBe("date");
    expect(biDataType("boolean")).toBe("boolean");
    expect(biDataType("category")).toBe("string");
  });

  it("names a measure the way an analyst would", () => {
    expect(measureName("revenue", "sum")).toBe("Total Revenue");
    expect(measureName("revenue", "avg")).toBe("Average Revenue");
    expect(measureName(null, "count")).toBe("Row Count");
  });

  it("writes both a DAX and a Tableau formula for each measure", () => {
    const measure = buildMeasure("Sales", "revenue", "sum");
    expect(measure.dax).toBe("Total Revenue = SUM('Sales'[revenue])");
    expect(measure.tableau).toBe("SUM([revenue])");
  });

  it("counts rows with a table expression rather than a column sum", () => {
    expect(buildMeasure("Sales", null, "count").dax).toBe("Row Count = COUNTROWS('Sales')");
  });

  it("carries every field, visual, and measure the dashboard uses", () => {
    const { dash } = fixture();
    expect(dash.fields.map((f) => f.name)).toContain("revenue");
    expect(dash.visuals.length).toBeGreaterThan(0);
    expect(dash.measures.length).toBeGreaterThan(0);
    expect(dash.csv.split("\n")[0]).toContain("region");
  });

  it("lays visuals out without overlapping one another", () => {
    const { dash } = fixture();
    const boxes = dash.visuals.map((v) => v.layout);

    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const overlap =
          boxes[a].x < boxes[b].x + boxes[b].width &&
          boxes[a].x + boxes[a].width > boxes[b].x &&
          boxes[a].y < boxes[b].y + boxes[b].height &&
          boxes[a].y + boxes[a].height > boxes[b].y;
        expect(overlap, `visual ${a} overlaps visual ${b}`).toBe(false);
      }
    }
  });

  it("keeps every visual inside the report page", () => {
    const { dash } = fixture();
    for (const visual of dash.visuals) {
      expect(visual.layout.x).toBeGreaterThanOrEqual(0);
      expect(visual.layout.x + visual.layout.width).toBeLessThanOrEqual(1280);
    }
  });

  it("exports only the visuals asked for", () => {
    const { dataset, layout } = fixture();
    const first = layout.panels[0].id;
    const dash = buildBiDashboard(dataset, layout, { onlyVisuals: [first] });

    expect(dash.visuals).toHaveLength(1);
    expect(dash.visuals[0].id).toBe(first);
  });

  it("turns the live filter selections into slicers", () => {
    const { dataset, layout } = fixture();
    const column = layout.filters[0].column;
    const dash = buildBiDashboard(dataset, layout, { selections: { [column]: ["West"] } });

    const slicer = dash.slicers.find((s) => s.column === column);
    expect(slicer?.selected).toEqual(["West"]);
  });

  it("ships the model without a table when data is excluded", () => {
    const { dataset, layout } = fixture();
    const dash = buildBiDashboard(dataset, layout, { includeData: false });

    expect(dash.csv).toBe("");
    expect(dash.rowCount).toBe(0);
  });

  it("records that an export carries only the filtered rows", () => {
    const { dataset, layout } = fixture();
    const dash = buildBiDashboard(dataset, layout, { rows: dataset.rows.slice(0, 10) });

    expect(dash.filtered).toBe(true);
    expect(dash.rowCount).toBe(10);
  });
});

describe("Power BI export", () => {
  it("writes a semantic model that parses as JSON", () => {
    const { dash } = fixture();
    const model = JSON.parse(buildModelBim(dash));

    expect(model.model.tables).toHaveLength(1);
    expect(model.model.tables[0].name).toBe(dash.tableName);
  });

  it("types every column in the model", () => {
    const { dash } = fixture();
    const model = JSON.parse(buildModelBim(dash));
    const columns: { name: string; dataType: string }[] = model.model.tables[0].columns;

    expect(columns.find((c) => c.name === "revenue")?.dataType).toBe("double");
    expect(columns.find((c) => c.name === "region")?.dataType).toBe("string");
    expect(columns.find((c) => c.name === "order_date")?.dataType).toBe("dateTime");
  });

  it("carries each measure as a DAX expression without its assignment", () => {
    const { dash } = fixture();
    const model = JSON.parse(buildModelBim(dash));
    const measures: { name: string; expression: string }[] = model.model.tables[0].measures;

    expect(measures.length).toBeGreaterThan(0);
    for (const measure of measures) {
      expect(measure.expression).not.toContain(" = ");
      expect(measure.expression.length).toBeGreaterThan(0);
    }
  });

  it("embeds the Power Query that loads the bundled CSV", () => {
    const { dash } = fixture();
    const model = JSON.parse(buildModelBim(dash));
    const m: string[] = model.model.tables[0].partitions[0].source.expression;

    expect(m.join("\n")).toContain("data/dataset.csv");
    expect(m.join("\n")).toContain("Table.PromoteHeaders");
  });

  it("types every column in the Power Query script too", () => {
    const { dash } = fixture();
    const m = buildPowerQuery(dash);

    expect(m).toContain('{"revenue", type number}');
    expect(m).toContain('{"region", type text}');
    expect(m).toContain('{"order_date", type date}');
  });

  it("writes a report layout that parses as JSON", () => {
    const { dash } = fixture();
    const report = JSON.parse(buildReportJson(dash));

    expect(report.sections).toHaveLength(1);
    expect(report.sections[0].width).toBe(1280);
  });

  it("nests each visual's own config as a JSON string, the way Power BI stores it", () => {
    const { dash } = fixture();
    const report = JSON.parse(buildReportJson(dash));
    const container = report.sections[0].visualContainers.at(-1);
    const config = JSON.parse(container.config);

    expect(typeof container.config).toBe("string");
    expect(config.singleVisual.visualType).toBeTruthy();
    expect(config.singleVisual.prototypeQuery.From[0].Entity).toBe(dash.tableName);
  });

  it("projects a field into every bucket its visual type reads", () => {
    const { dash } = fixture();
    const report = JSON.parse(buildReportJson(dash));

    const barVisual = dash.visuals.find((v) => v.type === "bar");
    expect(barVisual, "fixture should produce a bar chart").toBeTruthy();

    const container = report.sections[0].visualContainers.find(
      (c: { config: string }) => JSON.parse(c.config).name === barVisual!.id
    );
    const projections = JSON.parse(container.config).singleVisual.projections;

    expect(projections.Category?.[0].queryRef).toBe(`${dash.tableName}.${barVisual!.x}`);
    expect(projections.Y?.length).toBeGreaterThan(0);
  });

  it("maps every chart type onto a real Power BI visual", () => {
    for (const visual of Object.values(POWERBI_VISUAL)) {
      expect(visual).toMatch(/^[a-zA-Z]+$/);
    }
    expect(POWERBI_VISUAL.doughnut).toBe("donutChart");
    expect(POWERBI_VISUAL.heatmap).toBe("matrix");
  });

  it("emits a slicer container per filter", () => {
    const { dataset, layout } = fixture();
    const dash = buildBiDashboard(dataset, layout, {});
    const report = JSON.parse(buildReportJson(dash));
    const slicers = report.sections[0].visualContainers.filter(
      (c: { config: string }) => JSON.parse(c.config).singleVisual.visualType === "slicer"
    );

    expect(slicers).toHaveLength(dash.slicers.length);
    expect(dash.slicers.length).toBeGreaterThan(0);
  });

  it("writes a theme carrying the product palette", () => {
    const theme = JSON.parse(buildTheme("Sales"));
    expect(theme.dataColors[0]).toBe("#e7b856");
    expect(theme.background).toBe("#101315");
  });

  it("writes a paste-ready DAX file with one measure per line", () => {
    const { dash } = fixture();
    const dax = buildDaxFile(dash);

    for (const measure of dash.measures) {
      expect(dax).toContain(measure.dax);
    }
  });

  it("ships the project, the manual fallback, the data, and a README", () => {
    const { dash } = fixture();
    const files = filesOf(buildPowerBiFiles(dash));

    expect(files.has(`${dash.name}.pbip`)).toBe(true);
    expect(files.has(`${dash.name}.Dataset/model.bim`)).toBe(true);
    expect(files.has(`${dash.name}.Report/report.json`)).toBe(true);
    expect(files.has("manual/queries.m")).toBe(true);
    expect(files.has("manual/measures.dax")).toBe(true);
    expect(files.has("manual/theme.json")).toBe(true);
    expect(files.has("data/dataset.csv")).toBe(true);
    expect(files.has("README.md")).toBe(true);
  });

  it("points the report at the dataset folder beside it", () => {
    const { dash } = fixture();
    const files = filesOf(buildPowerBiFiles(dash));
    const pbir = JSON.parse(files.get(`${dash.name}.Report/definition.pbir`)!);

    expect(pbir.datasetReference.byPath.path).toBe(`../${dash.name}.Dataset`);
  });

  it("says plainly that the project format needs a preview toggle", () => {
    const { dash } = fixture();
    const readme = filesOf(buildPowerBiFiles(dash)).get("README.md")!;

    expect(readme).toContain("Preview features");
    expect(readme).toContain("manual/");
  });

  it("omits the data file when the model ships without a table", () => {
    const { dataset, layout } = fixture();
    const dash = buildBiDashboard(dataset, layout, { includeData: false });

    expect(filesOf(buildPowerBiFiles(dash)).has("data/dataset.csv")).toBe(false);
  });

  it("zips into a readable archive", () => {
    const { dash } = fixture();
    const zip = createZip(buildPowerBiFiles(dash));
    expect(zip.length).toBeGreaterThan(1000);
    expect(zip[0]).toBe(0x50); // "PK"
    expect(zip[1]).toBe(0x4b);
  });
});

describe("Tableau export", () => {
  it("escapes the characters an XML attribute cannot hold", () => {
    expect(escapeXmlAttr(`Sales & "Ops" <2026>`)).toBe(
      "Sales &amp; &quot;Ops&quot; &lt;2026&gt;"
    );
  });

  it("brackets a field name and doubles an embedded bracket", () => {
    expect(tableauField("revenue")).toBe("[revenue]");
    expect(tableauField("odd]name")).toBe("[odd]]name]");
  });

  it("numbers worksheets so two charts can share a title", () => {
    const visual = { title: "Revenue by Region" } as Parameters<typeof worksheetName>[0];
    expect(worksheetName(visual, 0)).toBe("1. Revenue by Region");
    expect(worksheetName(visual, 4)).toBe("5. Revenue by Region");
  });

  it("writes a workbook whose XML is well formed", () => {
    const { dash } = fixture();
    const twb = buildTwb(dash);

    // Every element opened at the top level is closed again.
    for (const tag of ["workbook", "datasources", "worksheets", "dashboards"]) {
      expect(twb).toContain(`<${tag}`);
      expect(twb).toContain(`</${tag}>`);
    }
    expect(twb.startsWith("<?xml")).toBe(true);
  });

  it("connects to the CSV the package carries", () => {
    const { dash } = fixture();
    const twb = buildTwb(dash);

    expect(twb).toContain(`class="textscan"`);
    expect(twb).toContain(`directory="Data"`);
    expect(twb).toContain(`filename="dataset.csv"`);
  });

  it("types every field as a dimension or a measure", () => {
    const { dash } = fixture();
    const twb = buildTwb(dash);

    expect(twb).toContain(`name="[revenue]" role="measure" type="quantitative"`);
    expect(twb).toContain(`name="[region]" role="dimension" type="nominal"`);
  });

  it("carries each measure as a calculated field", () => {
    const { dash } = fixture();
    const twb = buildTwb(dash);

    expect(twb).toContain(`<calculation class="tableau"`);
    expect(twb).toContain("SUM([revenue])");
  });

  it("writes one worksheet per visual and puts them all on the dashboard", () => {
    const { dash } = fixture();
    const twb = buildTwb(dash);

    expect(twb.match(/<worksheet name=/g)).toHaveLength(dash.visuals.length);
    dash.visuals.forEach((visual, i) => {
      expect(twb).toContain(escapeXmlAttr(worksheetName(visual, i)));
    });
  });

  it("gives each chart type a mark Tableau understands", () => {
    expect(TABLEAU_MARK.bar).toBe("Bar");
    expect(TABLEAU_MARK.doughnut).toBe("Pie");
    expect(TABLEAU_MARK.heatmap).toBe("Square");
  });

  it("positions dashboard zones on Tableau's own grid", () => {
    const { dash } = fixture();
    const twb = buildTwb(dash);

    const widths = [...twb.matchAll(/<zone [^>]*w="(\d+)"/g)].map((m) => parseInt(m[1], 10));
    expect(widths.length).toBeGreaterThan(0);
    for (const width of widths) {
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(100_000);
    }
  });

  it("adds a filter zone per slicer", () => {
    const { dash } = fixture();
    const twb = buildTwb(dash);
    expect(twb.match(/type-v2="filter"/g)).toHaveLength(dash.slicers.length);
  });

  it("writes a standalone datasource as the fallback", () => {
    const { dash } = fixture();
    const tds = buildTds(dash);

    expect(tds).toContain("<datasource");
    expect(tds).toContain(`class="textscan"`);
    expect(tds).toContain("[revenue]");
  });

  it("packages the workbook, the data, the fallback, and a README", () => {
    const { dash } = fixture();
    const files = filesOf(buildTableauFiles(dash));

    expect(files.has(`${dash.name}.twb`)).toBe(true);
    expect(files.has("Data/dataset.csv")).toBe(true);
    expect(files.has("manual/datasource.tds")).toBe(true);
    expect(files.has("manual/calculations.md")).toBe(true);
    expect(files.has("manual/preferences.tps")).toBe(true);
    expect(files.has("README.md")).toBe(true);
  });

  it("says plainly what to do if Tableau declines the workbook", () => {
    const { dash } = fixture();
    const readme = filesOf(buildTableauFiles(dash)).get("README.md")!;

    expect(readme).toContain("datasource.tds");
    expect(readme).toContain("Nothing is lost");
  });

  it("zips into a readable archive", () => {
    const { dash } = fixture();
    const zip = createZip(buildTableauFiles(dash));
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
  });
});
