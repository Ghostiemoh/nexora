/* eslint-disable @typescript-eslint/no-explicit-any -- query rows and aggregates are dynamically typed */
import type { Row, CellValue } from "./types";

export interface SqlResult {
  columns: string[];
  rows: Row[];
  error?: string;
  executionTimeMs: number;
}

/**
 * A client-side SQL engine that executes standard SQL queries against a list of JSON rows.
 * Supports:
 * - SELECT col1, col2, COUNT(*), SUM(col3), AVG(col4), MIN(col5), MAX(col6)
 * - WHERE col1 = 'val' AND col2 > 10
 * - GROUP BY col1, col2
 * - ORDER BY col1 DESC, col2 ASC
 * - LIMIT 10
 */
export function executeSql(sql: string, data: Row[]): SqlResult {
  const start = performance.now();
  
  try {
    if (!sql || sql.trim() === "") {
      throw new Error("Empty query");
    }

    // Clean query
    const cleanSql = sql.trim().replace(/\s+/g, " ").replace(/;$/, "");
    
    // Parse SELECT
    const selectMatch = cleanSql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (!selectMatch) {
      throw new Error("Invalid query: SELECT ... FROM expected");
    }
    const selectStr = selectMatch[1];
    
    // Extract clauses
    let whereStr = "";
    let groupByStr = "";
    let orderByStr = "";
    let limitStr = "";
    
    const whereMatch = cleanSql.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (whereMatch) whereStr = whereMatch[1];
    
    const groupByMatch = cleanSql.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (groupByMatch) groupByStr = groupByMatch[1];
    
    const orderByMatch = cleanSql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
    if (orderByMatch) orderByStr = orderByMatch[1];
    
    const limitMatch = cleanSql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) limitStr = limitMatch[1];
    
    // 1. Filtering (WHERE)
    let filtered = [...data];
    if (whereStr) {
      filtered = filtered.filter(row => evaluateWhereClause(whereStr, row));
    }
    
    // 2. Parsing select expressions and aggregates
    const selectItems = parseSelectItems(selectStr);
    const hasAggregates = selectItems.some(item => item.isAggregate);
    
    let resultRows: Row[] = [];
    let outputColumns: string[] = [];
    
    if (groupByStr || hasAggregates) {
      // 3. Grouping (GROUP BY)
      const groupKeys = groupByStr ? groupByStr.split(",").map(s => s.trim()) : [];
      
      const groups = new Map<string, Row[]>();
      filtered.forEach(row => {
        const keyObj: Record<string, any> = {};
        groupKeys.forEach(k => {
          keyObj[k] = row[k];
        });
        const keyStr = JSON.stringify(keyObj);
        const list = groups.get(keyStr) || [];
        list.push(row);
        groups.set(keyStr, list);
      });
      
      // If no group keys but aggregates exist, treat entire table as one group
      if (groupKeys.length === 0 && groups.size === 0 && filtered.length > 0) {
        groups.set("{}", filtered);
      } else if (filtered.length === 0) {
        groups.set("{}", []);
      }
      
      groups.forEach((groupRows, keyStr) => {
        const groupKeyValues = JSON.parse(keyStr);
        const resultRow: Row = { ...groupKeyValues };
        
        selectItems.forEach(item => {
          if (item.isAggregate) {
            resultRow[item.alias] = calculateAggregate(item.aggregateFunc!, item.field!, groupRows);
          } else if (groupKeyValues[item.field!] !== undefined) {
            resultRow[item.alias] = groupKeyValues[item.field!];
          } else {
            resultRow[item.alias] = groupRows[0] ? groupRows[0][item.field!] : null;
          }
        });
        
        resultRows.push(resultRow);
      });
      
      outputColumns = selectItems.map(item => item.alias);
    } else {
      // Plain projection
      if (selectStr.trim() === "*") {
        if (data.length > 0) {
          outputColumns = Object.keys(data[0]);
        } else {
          outputColumns = ["*"];
        }
        resultRows = filtered;
      } else {
        outputColumns = selectItems.map(item => item.alias);
        resultRows = filtered.map(row => {
          const projected: Row = {};
          selectItems.forEach(item => {
            projected[item.alias] = row[item.field!];
          });
          return projected;
        });
      }
    }
    
    // 4. Sorting (ORDER BY)
    if (orderByStr) {
      const orderItems = orderByStr.split(",").map(s => {
        const parts = s.trim().split(" ");
        return {
          field: parts[0],
          desc: parts[1] && parts[1].toUpperCase() === "DESC"
        };
      });
      
      resultRows.sort((a, b) => {
        for (const item of orderItems) {
          const valA = a[item.field];
          const valB = b[item.field];
          if (valA === valB) continue;
          if (valA === null || valA === undefined) return 1;
          if (valB === null || valB === undefined) return -1;
          
          const compare = valA < valB ? -1 : 1;
          return item.desc ? -compare : compare;
        }
        return 0;
      });
    }
    
    // 5. Limit (LIMIT)
    if (limitStr) {
      const limit = parseInt(limitStr, 10);
      resultRows = resultRows.slice(0, limit);
    }
    
    return {
      columns: outputColumns,
      rows: resultRows,
      executionTimeMs: Math.max(0.1, parseFloat((performance.now() - start).toFixed(2)))
    };
    
  } catch (err: any) {
    return {
      columns: [],
      rows: [],
      error: err.message || "Failed to execute query",
      executionTimeMs: Math.max(0.1, parseFloat((performance.now() - start).toFixed(2)))
    };
  }
}

interface SelectItem {
  expression: string;
  alias: string;
  isAggregate: boolean;
  aggregateFunc?: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";
  field?: string;
}

function parseSelectItems(selectStr: string): SelectItem[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;
  
  for (let i = 0; i < selectStr.length; i++) {
    const char = selectStr[i];
    if (char === "(") parenDepth++;
    if (char === ")") parenDepth--;
    
    if (char === "," && parenDepth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  
  return parts.map(part => {
    // Check for alias (AS)
    const asMatch = part.match(/(.+?)\s+AS\s+(.+)/i);
    let expression = part;
    let alias = part;
    if (asMatch) {
      expression = asMatch[1].trim();
      alias = asMatch[2].trim().replace(/['"`]/g, "");
    }
    
    // Check for aggregates
    const aggMatch = expression.match(/^(COUNT|SUM|AVG|MIN|MAX)\((.+?)\)$/i);
    if (aggMatch) {
      const func = aggMatch[1].toUpperCase() as any;
      const field = aggMatch[2].trim().replace(/['"`]/g, "");
      return {
        expression,
        alias: asMatch ? alias : expression,
        isAggregate: true,
        aggregateFunc: func,
        field: field === "*" ? "id" : field
      };
    }
    
    return {
      expression,
      alias: alias.replace(/['"`]/g, ""),
      isAggregate: false,
      field: expression.replace(/['"`]/g, "")
    };
  });
}

function evaluateWhereClause(whereStr: string, row: Row): boolean {
  // Simple evaluation of conditions combined with AND / OR
  // Supports basic operators: =, !=, <, >, <=, >=, LIKE, IS NULL, IS NOT NULL
  
  // Normalize simple queries
  const tokens = whereStr.split(/\s+AND\s+/i);
  return tokens.every(token => {
    const isLike = /\s+LIKE\s+/i.test(token);
    const isNull = /\s+IS\s+NULL/i.test(token);
    const isNotNull = /\s+IS\s+NOT\s+NULL/i.test(token);
    
    if (isNull) {
      const col = token.replace(/\s+IS\s+NULL/i, "").trim().replace(/['"`]/g, "");
      return row[col] === null || row[col] === undefined;
    }
    if (isNotNull) {
      const col = token.replace(/\s+IS\s+NOT\s+NULL/i, "").trim().replace(/['"`]/g, "");
      return row[col] !== null && row[col] !== undefined;
    }
    
    let op = "=";
    let parts: string[] = [];
    
    if (token.includes("!=")) { op = "!="; parts = token.split("!="); }
    else if (token.includes("<=")) { op = "<="; parts = token.split("<="); }
    else if (token.includes(">=")) { op = ">="; parts = token.split(">="); }
    else if (token.includes("<")) { op = "<"; parts = token.split("<"); }
    else if (token.includes(">")) { op = ">"; parts = token.split(">"); }
    else if (token.includes("=")) { op = "="; parts = token.split("="); }
    else if (isLike) { op = "LIKE"; parts = token.split(/\s+LIKE\s+/i); }
    else {
      return true; // Unrecognized condition passes
    }
    
    const col = parts[0].trim().replace(/['"`]/g, "");
    const valStr = parts[1].trim().replace(/^['"`]|['"`]$/g, "");
    const cell = row[col];
    
    if (op === "LIKE") {
      const regexStr = "^" + valStr.replace(/%/g, ".*") + "$";
      const regex = new RegExp(regexStr, "i");
      return regex.test(String(cell ?? ""));
    }
    
    const cellNum = Number(cell);
    const valNum = Number(valStr);
    const compareNumbers = !isNaN(cellNum) && !isNaN(valNum) && cell !== null && cell !== "";
    
    const valA = compareNumbers ? cellNum : String(cell ?? "").toLowerCase();
    const valB = compareNumbers ? valNum : valStr.toLowerCase();
    
    switch (op) {
      case "=": return valA === valB;
      case "!=": return valA !== valB;
      case "<": return valA < valB;
      case ">": return valA > valB;
      case "<=": return valA <= valB;
      case ">=": return valA >= valB;
      default: return true;
    }
  });
}

function calculateAggregate(
  func: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX",
  field: string,
  rows: Row[]
): CellValue {
  if (func === "COUNT") {
    if (field === "id" || field === "*") return rows.length;
    return rows.filter(r => r[field] !== null && r[field] !== undefined).length;
  }
  
  const values = rows
    .map(r => r[field])
    .filter((v): v is number => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v))))
    .map(v => Number(v));
    
  if (values.length === 0) return null;
  
  switch (func) {
    case "SUM":
      return values.reduce((sum, v) => sum + v, 0);
    case "AVG":
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    case "MIN":
      return Math.min(...values);
    case "MAX":
      return Math.max(...values);
    default:
      return null;
  }
}
