import type { Dataset, AxiomAnswer, AxiomTable } from "./types";

/**
 * Axiom NLP data query interpreter.
 * Matches keywords (size, rows, nulls, duplicates, column summaries) and returns:
 * - Natural language explanations.
 * - Auto-generated SQL statements.
 * - Formatted tabular data.
 * - Interactive suggestion chips.
 */
export function queryAxiom(query: string, dataset: Dataset | null): AxiomAnswer {
  if (!dataset) {
    return {
      text: "Please upload or select a dataset first to enable analysis.",
      suggestions: ["Load sample dataset"],
    };
  }

  const clean = query.trim().toLowerCase();
  const cleanName = dataset.name.replace(/\.[^/.]+$/, "");

  // 1. Size / Count query
  if (clean.includes("size") || clean.includes("row") || clean.includes("count") || clean.includes("how many")) {
    const table: AxiomTable = {
      headers: ["Metric", "Value"],
      rows: [
        ["Total Rows", dataset.rows.length],
        ["Total Columns", dataset.columns.length],
        ["Duplicate Rows", dataset.duplicateRows],
        ["Health Status", `${dataset.health.overall}%`],
      ],
    };
    return {
      text: `### Dataset Scale & Shape
The dataset **${dataset.name}** contains **${dataset.rows.length} rows** and **${dataset.columns.length} columns**.

Here is the auto-generated SQL query representing this statistics:
\`\`\`sql
SELECT COUNT(*) AS total_rows FROM ${cleanName}
\`\`\``,
      table,
      suggestions: ["List columns", "Show duplicates", "Dataset health"],
    };
  }

  // 2. Duplicates query
  if (clean.includes("duplicate") || clean.includes("double") || clean.includes("overlap")) {
    const table: AxiomTable = {
      headers: ["Metric", "Count"],
      rows: [
        ["Total Rows", dataset.rows.length],
        ["Duplicate Rows", dataset.duplicateRows],
        ["Unique Rows", dataset.rows.length - dataset.duplicateRows],
      ],
    };
    return {
      text: `### Duplicate Rows Analysis
I detected **${dataset.duplicateRows} duplicate rows** in your dataset.

You can clean this immediately using the **Dataset Doctor** panel or run this query in the **SQL Lab**:
\`\`\`sql
SELECT COUNT(*) AS total_rows, COUNT(DISTINCT ${dataset.columns[0]}) AS distinct_${dataset.columns[0]} FROM ${cleanName}
\`\`\``,
      table,
      suggestions: ["Run duplicates fix", "Show missing values"],
    };
  }

  // 3. Nulls / Missing values query
  if (clean.includes("null") || clean.includes("missing") || clean.includes("empty") || clean.includes("nan")) {
    const missingRows: (string | number)[][] = dataset.profiles
      .filter((p) => p.missingCount > 0)
      .map((p) => [p.name, p.missingCount, `${(100 - p.completeness).toFixed(1)}%`]);
      
    if (missingRows.length === 0) {
      return {
        text: `### Missing Values Scan
Great news! I scanned all columns and found **0 missing values**. Your dataset is 100% complete.`,
        suggestions: ["Dataset health", "List columns"],
      };
    }

    const table: AxiomTable = {
      headers: ["Column Name", "Null Count", "Missing Percentage"],
      rows: missingRows,
    };
    
    return {
      text: `### Missing Values Diagnostics
I identified missing values in **${missingRows.length} columns**.

Here is the breakdown. You can inspect the affected rows for any column with:
\`\`\`sql
SELECT * FROM ${cleanName} WHERE ${missingRows[0][0]} IS NULL LIMIT 25
\`\`\``,
      table,
      suggestions: ["Apply auto-fix", "Zustand store", "Show column summaries"],
    };
  }

  // 4. Columns listing
  if (clean.includes("column") || clean.includes("schema") || clean.includes("header")) {
    const table: AxiomTable = {
      headers: ["Column", "Inferred Type", "Completeness", "Unique Values"],
      rows: dataset.profiles.map((p) => [p.name, p.type, `${p.completeness.toFixed(0)}%`, p.uniqueCount]),
    };
    return {
      text: `### Columns & Types Schema
The dataset schema contains **${dataset.columns.length} columns**.

Here is the profile summary for all headers:`,
      table,
      suggestions: ["Show missing values", "Dataset health"],
    };
  }

  // 5. Health query
  if (clean.includes("health") || clean.includes("doctor") || clean.includes("score")) {
    const table: AxiomTable = {
      headers: ["Category", "Score (%)"],
      rows: [
        ["Completeness", dataset.health.completeness],
        ["Accuracy", dataset.health.accuracy],
        ["Validity", dataset.health.validity],
        ["Consistency", dataset.health.consistency],
        ["Overall Health Score", dataset.health.overall],
      ],
    };
    return {
      text: `### Dataset Doctor Health Audit
The overall health score is **${dataset.health.overall}%**.

There are **${dataset.diagnostics.length} unresolved warnings** that you can fix in the **Dataset Doctor** to improve data consistency.`,
      table,
      suggestions: ["List warnings", "Show duplicates"],
    };
  }

  // 6. Dynamic Column Matcher
  // Match a specific column name in the query, guarding against short names
  // ("id") matching inside unrelated words ("provide").
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normQuery = normalize(clean);
  const matchedCol = dataset.columns.find((col) => {
    const nc = normalize(col);
    if (nc.length < 3) return false;
    const wordBoundary = new RegExp(`\\b${col.toLowerCase().replace(/[^a-z0-9_]+/g, "[^a-z0-9]*")}\\b`);
    return wordBoundary.test(clean) || (nc.length >= 4 && normQuery.includes(nc));
  });

  if (matchedCol) {
    const colProfile = dataset.profiles.find(p => p.name === matchedCol);
    if (colProfile) {
      const isNumeric = colProfile.type === "number";

      let text = `### Column Profile: ${matchedCol}
The field **${matchedCol}** is inferred as a **${colProfile.type}** type.
- **Completeness:** ${colProfile.completeness.toFixed(1)}% (${colProfile.missingCount} null values)
- **Uniqueness:** ${colProfile.uniqueness.toFixed(1)}% (${colProfile.uniqueCount} distinct values)`;

      if (isNumeric) {
        text += `
- **Min / Max:** ${colProfile.min ?? "N/A"} / ${colProfile.max ?? "N/A"}
- **Mean / Median:** ${colProfile.mean ?? "N/A"} / ${colProfile.median ?? "N/A"}
- **Std Dev (sample):** ${colProfile.std ?? "N/A"}
- **IQR (p25–p75):** ${colProfile.p25 ?? "N/A"} – ${colProfile.p75 ?? "N/A"}
- **Outliers (1.5×IQR):** ${colProfile.outlierCount ?? 0}`;
      } else if (colProfile.type === "date" && colProfile.dateMin) {
        text += `
- **Date range:** ${colProfile.dateMin} → ${colProfile.dateMax}`;
      }

      text += `

Here is the SQL snippet to query this field:
\`\`\`sql
SELECT ${matchedCol}, COUNT(*) AS count FROM ${cleanName} GROUP BY ${matchedCol} ORDER BY count DESC LIMIT 10
\`\`\``;

      let table: AxiomTable | undefined = undefined;

      if (isNumeric) {
        table = {
          headers: ["Statistic", "Value"],
          rows: [
            ["Completeness (%)", colProfile.completeness.toFixed(1)],
            ["Nulls Count", colProfile.missingCount],
            ["Distinct Count", colProfile.uniqueCount],
            ["Minimum Value", colProfile.min ?? "N/A"],
            ["Maximum Value", colProfile.max ?? "N/A"],
            ["Average (Mean)", colProfile.mean ?? "N/A"],
            ["Median (p50)", colProfile.median ?? "N/A"],
            ["p25 / p75", `${colProfile.p25 ?? "N/A"} / ${colProfile.p75 ?? "N/A"}`],
            ["Std Dev (sample)", colProfile.std ?? "N/A"],
            ["Outliers (1.5×IQR)", colProfile.outlierCount ?? 0],
          ]
        };
      } else if (colProfile.topValues && colProfile.topValues.length > 0) {
        table = {
          headers: ["Category Value", "Occurrences"],
          rows: colProfile.topValues.map(v => [v.value || "(blank)", v.count])
        };
      }

      const suggestions = [
        `SELECT * FROM ${cleanName} LIMIT 10`,
        "Show missing values",
        "Overall health"
      ];

      return {
        text,
        table,
        suggestions
      };
    }
  }

  // 7. Default fallback
  return {
    text: `### Nexus AI Assistant
I can help you audit your dataset. Try asking:
* *"How many rows are in this dataset?"*
* *"Show me missing values"*
* *"Do we have duplicates?"*
* *"What is the schema or column list?"*
* *"How clean is my dataset?"*

Or you can run a custom SQL query in the **SQL Lab**:
\`\`\`sql
SELECT * FROM dataset LIMIT 10;
\`\`\``,
    suggestions: ["Show dataset size", "Show missing values", "Show duplicates"],
  };
}
