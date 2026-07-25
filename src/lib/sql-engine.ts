import type { Row, CellValue } from "./types";
import { parseNumeric } from "./number";

export interface SqlResult {
  columns: string[];
  rows: Row[];
  error?: string;
  executionTimeMs: number;
}

/**
 * A client-side SQL engine that executes a practical subset of SQL against a
 * list of JSON rows. Supports:
 * - SELECT col1, col2, COUNT(*), COUNT(DISTINCT col), SUM/AVG/MIN/MAX(col), aliases
 * - WHERE with =, !=, <, >, <=, >=, LIKE, IS NULL, IS NOT NULL and AND / OR
 * - GROUP BY, ORDER BY (by name, alias, or ordinal), LIMIT
 *
 * String literals are masked before clause splitting so keywords inside quotes
 * (e.g. WHERE city = 'ORDER BY North') never corrupt the parse.
 */
export function executeSql(sql: string, data: Row[]): SqlResult {
  const start = performance.now();
  const timeMs = () => Math.max(0.1, parseFloat((performance.now() - start).toFixed(2)));

  try {
    if (!sql || sql.trim() === "") {
      throw new Error("Empty query");
    }

    const dataColumns = data.length > 0 ? Object.keys(data[0]) : [];

    // Normalise whitespace, drop trailing semicolon, then mask string literals.
    const cleanSql = sql.trim().replace(/\s+/g, " ").replace(/;$/, "");
    const { masked, literals } = maskLiterals(cleanSql);

    const selectMatch = masked.match(/SELECT\s+(.+?)\s+FROM\s+/i);
    if (!selectMatch) {
      throw new Error("Invalid query: SELECT ... FROM expected");
    }
    const selectStr = selectMatch[1];

    const whereMatch = masked.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i);
    const groupByMatch = masked.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    const orderByMatch = masked.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
    const limitMatch = masked.match(/LIMIT\s+(\d+)/i);

    const whereStr = whereMatch ? whereMatch[1] : "";
    const groupByStr = groupByMatch ? groupByMatch[1] : "";
    const orderByStr = orderByMatch ? orderByMatch[1] : "";

    // 1. Filtering (WHERE)
    let filtered = data;
    if (whereStr) {
      const groups = parseWhere(whereStr, literals);
      const refCols = groups.flat().map((c) => c.col);
      assertKnownColumns(refCols, dataColumns);
      filtered = data.filter((row) => evaluateWhere(groups, row));
    }

    // 2. Parse SELECT items
    const selectItems = parseSelectItems(selectStr, literals);
    const hasAggregates = selectItems.some((item) => item.isAggregate);
    const isStar = selectStr.trim() === "*";

    // Validate referenced (non-aggregate, non-star) columns up front.
    if (!isStar) {
      const refCols = selectItems
        .filter((i) => !i.isAggregate && i.field)
        .map((i) => i.field!);
      assertKnownColumns(refCols, dataColumns);
    }

    const groupKeys = groupByStr
      ? groupByStr.split(",").map((s) => stripQuotes(s.trim()))
      : [];
    assertKnownColumns(groupKeys, dataColumns);

    let resultRows: Row[] = [];
    let outputColumns: string[] = [];

    if (groupByStr || hasAggregates) {
      // 3. Grouping
      const groups = new Map<string, Row[]>();
      if (groupKeys.length === 0) {
        // Whole table is one group (pure aggregate query).
        groups.set("{}", filtered);
      } else {
        filtered.forEach((row) => {
          const keyObj: Record<string, CellValue> = {};
          groupKeys.forEach((k) => {
            keyObj[k] = row[k];
          });
          const keyStr = JSON.stringify(keyObj);
          const list = groups.get(keyStr) || [];
          list.push(row);
          groups.set(keyStr, list);
        });
      }

      groups.forEach((groupRows, keyStr) => {
        const groupKeyValues: Record<string, CellValue> = keyStr === "{}" ? {} : JSON.parse(keyStr);
        const resultRow: Row = {};

        selectItems.forEach((item) => {
          if (item.isAggregate) {
            resultRow[item.alias] = calculateAggregate(item, groupRows);
          } else if (item.field! in groupKeyValues) {
            resultRow[item.alias] = groupKeyValues[item.field!];
          } else {
            resultRow[item.alias] = groupRows[0] ? groupRows[0][item.field!] : null;
          }
        });

        resultRows.push(resultRow);
      });

      outputColumns = selectItems.map((item) => item.alias);
    } else if (isStar) {
      outputColumns = dataColumns.length > 0 ? dataColumns : ["*"];
      resultRows = filtered.map((row) => ({ ...row }));
    } else {
      outputColumns = selectItems.map((item) => item.alias);
      resultRows = filtered.map((row) => {
        const projected: Row = {};
        selectItems.forEach((item) => {
          projected[item.alias] = row[item.field!];
        });
        return projected;
      });
    }

    // 4. Sorting (ORDER BY) — supports name, alias, and ordinal (ORDER BY 2).
    if (orderByStr) {
      const orderItems = orderByStr.split(",").map((s) => {
        const parts = s.trim().split(/\s+/);
        const rawField = stripQuotes(parts[0]);
        const field = /^\d+$/.test(rawField)
          ? outputColumns[Number(rawField) - 1] ?? rawField
          : rawField;
        return { field, desc: !!parts[1] && parts[1].toUpperCase() === "DESC" };
      });

      resultRows.sort((a, b) => {
        for (const item of orderItems) {
          const valA = a[item.field];
          const valB = b[item.field];
          if (valA === valB) continue;
          if (valA === null || valA === undefined) return 1;
          if (valB === null || valB === undefined) return -1;

          const numA = parseNumeric(valA);
          const numB = parseNumeric(valB);
          let compare: number;
          if (numA !== null && numB !== null) {
            compare = numA < numB ? -1 : 1;
          } else {
            compare = String(valA) < String(valB) ? -1 : 1;
          }
          return item.desc ? -compare : compare;
        }
        return 0;
      });
    }

    // 5. Limit
    if (limitMatch) {
      resultRows = resultRows.slice(0, parseInt(limitMatch[1], 10));
    }

    return { columns: outputColumns, rows: resultRows, executionTimeMs: timeMs() };
  } catch (err) {
    return {
      columns: [],
      rows: [],
      error: err instanceof Error ? err.message : "Failed to execute query",
      executionTimeMs: timeMs(),
    };
  }
}

/* ─────────────────────────── literal masking ─────────────────────────── */

const MASK = "";

function maskLiterals(sql: string): { masked: string; literals: string[] } {
  const literals: string[] = [];
  const masked = sql.replace(/'([^']*)'|"([^"]*)"/g, (m) => {
    const i = literals.length;
    literals.push(m);
    return `${MASK}${i}${MASK}`;
  });
  return { masked, literals };
}

function unmask(s: string, literals: string[]): string {
  return s.replace(new RegExp(`${MASK}(\\d+)${MASK}`, "g"), (_, i) => literals[Number(i)] ?? "");
}

function stripQuotes(s: string): string {
  return s.replace(/^['"`]|['"`]$/g, "");
}

function assertKnownColumns(refs: string[], dataColumns: string[]) {
  if (dataColumns.length === 0) return;
  for (const col of refs) {
    if (col && col !== "*" && !dataColumns.includes(col)) {
      throw new Error(`Unknown column: ${col}`);
    }
  }
}

/* ─────────────────────────── SELECT parsing ─────────────────────────── */

interface SelectItem {
  alias: string;
  isAggregate: boolean;
  aggregateFunc?: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";
  distinct?: boolean;
  field?: string;
}

function parseSelectItems(selectStr: string, literals: string[]): SelectItem[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (const char of selectStr) {
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

  return parts.map((part) => {
    const asMatch = part.match(/^(.+?)\s+AS\s+(.+)$/i);
    const expression = asMatch ? asMatch[1].trim() : part;
    const explicitAlias = asMatch ? stripQuotes(unmask(asMatch[2].trim(), literals)) : null;

    const aggMatch = expression.match(/^(COUNT|SUM|AVG|MIN|MAX)\(\s*(DISTINCT\s+)?(.+?)\s*\)$/i);
    if (aggMatch) {
      const func = aggMatch[1].toUpperCase() as SelectItem["aggregateFunc"];
      const distinct = !!aggMatch[2];
      const field = stripQuotes(aggMatch[3].trim());
      return {
        alias: explicitAlias ?? expression,
        isAggregate: true,
        aggregateFunc: func,
        distinct,
        field,
      };
    }

    const field = stripQuotes(expression);
    return { alias: explicitAlias ?? field, isAggregate: false, field };
  });
}

/* ─────────────────────────── WHERE parsing ─────────────────────────── */

interface Condition {
  col: string;
  op: "=" | "!=" | "<" | ">" | "<=" | ">=" | "LIKE" | "IS NULL" | "IS NOT NULL";
  value: string; // already unmasked & unquoted (empty for null checks)
}

/** Parse into OR groups; each group is an AND list of conditions. A row passes
 *  when any group fully matches. OR has lower precedence than AND. */
function parseWhere(whereStr: string, literals: string[]): Condition[][] {
  return whereStr
    .split(/\s+OR\s+/i)
    .map((group) =>
      group
        .split(/\s+AND\s+/i)
        .map((token) => parseCondition(token.trim(), literals))
        .filter((c): c is Condition => c !== null)
    )
    .filter((group) => group.length > 0);
}

function parseCondition(token: string, literals: string[]): Condition | null {
  if (/\s+IS\s+NOT\s+NULL$/i.test(token)) {
    return { col: stripQuotes(token.replace(/\s+IS\s+NOT\s+NULL$/i, "").trim()), op: "IS NOT NULL", value: "" };
  }
  if (/\s+IS\s+NULL$/i.test(token)) {
    return { col: stripQuotes(token.replace(/\s+IS\s+NULL$/i, "").trim()), op: "IS NULL", value: "" };
  }

  const ops: Condition["op"][] = ["!=", "<=", ">=", "<", ">", "="];
  for (const op of ops) {
    const idx = token.indexOf(op);
    if (idx !== -1) {
      const col = stripQuotes(token.slice(0, idx).trim());
      const value = stripQuotes(unmask(token.slice(idx + op.length).trim(), literals));
      return { col, op, value };
    }
  }

  if (/\s+LIKE\s+/i.test(token)) {
    const [colPart, valPart] = token.split(/\s+LIKE\s+/i);
    return { col: stripQuotes(colPart.trim()), op: "LIKE", value: stripQuotes(unmask(valPart.trim(), literals)) };
  }

  return null; // unrecognised token — ignored rather than silently passing rows
}

function evaluateWhere(groups: Condition[][], row: Row): boolean {
  return groups.some((group) => group.every((cond) => evaluateCondition(cond, row)));
}

function evaluateCondition(cond: Condition, row: Row): boolean {
  const cell = row[cond.col];

  if (cond.op === "IS NULL") return cell === null || cell === undefined;
  if (cond.op === "IS NOT NULL") return cell !== null && cell !== undefined;

  if (cond.op === "LIKE") {
    const regexStr = "^" + cond.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$";
    return new RegExp(regexStr, "i").test(String(cell ?? ""));
  }

  const cellNum = parseNumeric(cell);
  const valNum = parseNumeric(cond.value);
  const numeric = cellNum !== null && valNum !== null;

  const a: number | string = numeric ? cellNum : String(cell ?? "").toLowerCase();
  const b: number | string = numeric ? valNum : cond.value.toLowerCase();

  switch (cond.op) {
    case "=": return a === b;
    case "!=": return a !== b;
    case "<": return a < b;
    case ">": return a > b;
    case "<=": return a <= b;
    case ">=": return a >= b;
    default: return false;
  }
}

/* ─────────────────────────── aggregates ─────────────────────────── */

function calculateAggregate(item: SelectItem, rows: Row[]): CellValue {
  const { aggregateFunc: func, field, distinct } = item;

  if (func === "COUNT") {
    if (field === "*") return rows.length;
    let present = rows.map((r) => r[field!]).filter((v) => v !== null && v !== undefined);
    if (distinct) present = Array.from(new Set(present));
    return present.length;
  }

  const values = rows
    .map((r) => parseNumeric(r[field!]))
    .filter((n): n is number => n !== null);

  if (values.length === 0) return null;

  switch (func) {
    case "SUM": return values.reduce((s, v) => s + v, 0);
    case "AVG": return values.reduce((s, v) => s + v, 0) / values.length;
    case "MIN": return Math.min(...values);
    case "MAX": return Math.max(...values);
    default: return null;
  }
}
