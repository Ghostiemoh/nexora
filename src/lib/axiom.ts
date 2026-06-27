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
SELECT COUNT(*) FROM dataset;
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
SELECT COUNT(*), COUNT(DISTINCT customer_id) FROM dataset;
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

Here is the breakdown. You can run the following SQL query to audit this:
\`\`\`sql
SELECT ${dataset.profiles.filter(p => p.missingCount > 0).map(p => `COUNT(*) - COUNT(${p.name}) AS missing_${p.name}`).slice(0, 3).join(", ")} FROM dataset;
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
        ["Uniqueness", dataset.health.uniqueness],
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

  // 6. Default fallback
  const firstCol = dataset.columns[0] || "*";
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
