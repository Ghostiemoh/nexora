import type { Dataset, Row, ColumnProfile, Diagnostic, DatasetHealth, ColumnType } from "./types";

export function profileDataset(raw: {
  id: string;
  name: string;
  columns: string[];
  rows: Row[];
  createdAt: number;
  changelog: string[];
  truncated?: boolean;
}): Dataset {
  const { id, name, columns, rows, createdAt, changelog, truncated = false } = raw;
  const rowCount = rows.length;
  
  // 1. Calculate duplicates
  let duplicateRows = 0;
  const seenRows = new Set<string>();
  rows.forEach((row) => {
    const rowStr = JSON.stringify(row);
    if (seenRows.has(rowStr)) {
      duplicateRows++;
    } else {
      seenRows.add(rowStr);
    }
  });

  // 2. Profile columns
  const profiles: ColumnProfile[] = columns.map((colName) => {
    const nonNullValues = rows
      .map((r) => r[colName])
      .filter((v) => v !== null && v !== undefined && v !== "");
      
    const nonNullCount = nonNullValues.length;
    const completeness = rowCount > 0 ? (nonNullCount / rowCount) * 100 : 100;
    
    // Uniqueness
    const uniqueValues = new Set(nonNullValues);
    const uniqueCount = uniqueValues.size;
    const uniqueness = nonNullCount > 0 ? (uniqueCount / nonNullCount) * 100 : 100;
    
    // Type Inference
    let inferredType: ColumnType = "string";
    let numericCount = 0;
    let booleanCount = 0;
    let dateCount = 0;
    let hasWhitespace = false;

    nonNullValues.forEach((val) => {
      const valStr = String(val);
      // Check whitespaces
      if (valStr.trim() !== valStr) {
        hasWhitespace = true;
      }
      
      // Check number
      if (val !== "" && !isNaN(Number(val))) {
        numericCount++;
      }
      
      // Check boolean
      if (typeof val === "boolean" || valStr.toLowerCase() === "true" || valStr.toLowerCase() === "false") {
        booleanCount++;
      }
      
      // Check date
      if (isNaN(Number(val)) && !isNaN(Date.parse(valStr))) {
        dateCount++;
      }
    });

    const threshold = nonNullCount * 0.9;
    if (nonNullCount > 0) {
      if (numericCount >= threshold) inferredType = "number";
      else if (booleanCount >= threshold) inferredType = "boolean";
      else if (dateCount >= threshold) inferredType = "date";
      else if (uniqueCount < 15 && uniqueCount / nonNullCount < 0.15) inferredType = "category";
    }

    // Validity
    let validityCount = 0;
    nonNullValues.forEach((val) => {
      const valStr = String(val);
      if (inferredType === "number") {
        if (!isNaN(Number(val))) validityCount++;
      } else if (inferredType === "boolean") {
        if (typeof val === "boolean" || valStr.toLowerCase() === "true" || valStr.toLowerCase() === "false") validityCount++;
      } else if (inferredType === "date") {
        if (!isNaN(Date.parse(valStr))) validityCount++;
      } else {
        validityCount++;
      }
    });
    
    const validity = nonNullCount > 0 ? (validityCount / nonNullCount) * 100 : 100;

    // Descriptive stats
    const profile: ColumnProfile = {
      name: colName,
      type: inferredType,
      completeness,
      uniqueness,
      missingCount: rowCount - nonNullCount,
      uniqueCount,
      validity,
      hasWhitespace,
    };

    if (inferredType === "number" && nonNullCount > 0) {
      const numbers = nonNullValues.map((v) => Number(v)).sort((a, b) => a - b);
      const min = numbers[0];
      const max = numbers[numbers.length - 1];
      const sum = numbers.reduce((a, b) => a + b, 0);
      const mean = sum / numbers.length;
      
      // Median
      const mid = Math.floor(numbers.length / 2);
      const median = numbers.length % 2 !== 0 ? numbers[mid] : (numbers[mid - 1] + numbers[mid]) / 2;
      
      // Std Dev
      const variance = numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numbers.length;
      const std = Math.sqrt(variance);

      profile.min = parseFloat(min.toFixed(2));
      profile.max = parseFloat(max.toFixed(2));
      profile.mean = parseFloat(mean.toFixed(2));
      profile.median = parseFloat(median.toFixed(2));
      profile.std = parseFloat(std.toFixed(2));
    } else {
      // Categorical values grouping
      const counts: Record<string, number> = {};
      nonNullValues.forEach((v) => {
        const key = String(v).trim();
        counts[key] = (counts[key] || 0) + 1;
      });
      profile.topValues = Object.entries(counts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }

    return profile;
  });

  // 3. Generate Diagnostics & Warnings
  const diagnostics: Diagnostic[] = [];

  if (duplicateRows > 0) {
    diagnostics.push({
      id: "diag_duplicates",
      severity: "warning",
      title: "Duplicate Rows Found",
      description: `There are ${duplicateRows} identical rows in the dataset that might inflate statistics.`,
      fix: { op: { kind: "dropDuplicates" }, label: "Remove Duplicates" },
    });
  }

  const hasEmptyRows = rows.some((row) => Object.values(row).every((v) => v === null || v === undefined || v === ""));
  if (hasEmptyRows) {
    diagnostics.push({
      id: "diag_empty_rows",
      severity: "warning",
      title: "Empty Rows Detected",
      description: "Some rows are completely blank and should be excluded.",
      fix: { op: { kind: "dropEmptyRows" }, label: "Clear Blank Rows" },
    });
  }

  const whitespaceCols = profiles.filter((p) => p.hasWhitespace).map((p) => p.name);
  if (whitespaceCols.length > 0) {
    diagnostics.push({
      id: "diag_whitespace",
      severity: "warning",
      title: "Whitespace Inconsistencies",
      description: `Columns (${whitespaceCols.slice(0, 3).join(", ")}) contain text cells with leading/trailing spaces.`,
      fix: { op: { kind: "trimWhitespace" }, label: "Trim Text Spaces" },
    });
  }

  // Missing values warnings per column
  profiles.forEach((p) => {
    if (p.completeness < 100) {
      const label = p.type === "number" ? "median" : "mode";
      diagnostics.push({
        id: `diag_missing_${p.name}`,
        severity: "warning",
        title: `Nulls in Column '${p.name}'`,
        description: `This column is missing ${p.missingCount} values (${(100 - p.completeness).toFixed(1)}% incomplete).`,
        fix: {
          op: { kind: "fillMissing", column: p.name, strategy: p.type === "number" ? "median" : "mode" },
          label: `Impute via ${label}`,
        },
      });
    }
  });

  // 4. Calculate overall health score
  const completenessAvg = profiles.reduce((acc, p) => acc + p.completeness, 0) / (columns.length || 1);
  const uniquenessAvg = profiles.reduce((acc, p) => acc + p.uniqueness, 0) / (columns.length || 1);
  const validityAvg = profiles.reduce((acc, p) => acc + p.validity, 0) / (columns.length || 1);
  
  // Consistency is reduced by duplicates and whitespace issues
  let consistency = 100;
  if (duplicateRows > 0) consistency -= 10;
  if (whitespaceCols.length > 0) consistency -= 5;
  consistency = Math.max(10, consistency);

  const overall = Math.round(
    completenessAvg * 0.4 +
    uniquenessAvg * 0.2 +
    validityAvg * 0.2 +
    consistency * 0.2
  );

  const health: DatasetHealth = {
    overall,
    completeness: Math.round(completenessAvg),
    uniqueness: Math.round(uniquenessAvg),
    validity: Math.round(validityAvg),
    consistency: Math.round(consistency),
  };

  return {
    id,
    name,
    columns,
    rows,
    profiles,
    health,
    diagnostics,
    duplicateRows,
    createdAt,
    updatedAt: Date.now(),
    changelog,
    truncated,
  };
}
