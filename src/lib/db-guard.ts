/* Read-only guard for the database API routes. Nexora is an analytics tool,
 * not an admin console. The API executes SELECT-shaped statements only, and
 * never more than one statement per request. */

const ALLOWED_STARTS = /^(SELECT|WITH|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;
const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|MERGE|CALL|EXECUTE|COPY|VACUUM|SET|USE|ATTACH|PRAGMA|LOAD)\b/i;

export interface GuardResult {
  ok: boolean;
  reason?: string;
  /** the statement, trimmed, with any single trailing semicolon removed */
  statement: string;
}

/** Strip SQL comments so keywords can't hide inside them. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

export function guardReadOnly(sql: string): GuardResult {
  const cleaned = stripComments(sql).trim().replace(/;\s*$/, "");

  if (cleaned === "") {
    return { ok: false, reason: "Empty query.", statement: cleaned };
  }
  if (cleaned.includes(";")) {
    return { ok: false, reason: "Multiple statements are not allowed.", statement: cleaned };
  }
  if (!ALLOWED_STARTS.test(cleaned)) {
    return { ok: false, reason: "Only SELECT / WITH / SHOW / DESCRIBE / EXPLAIN queries are allowed.", statement: cleaned };
  }
  if (FORBIDDEN.test(cleaned)) {
    return { ok: false, reason: "Query contains a write/DDL keyword — this endpoint is read-only.", statement: cleaned };
  }
  return { ok: true, statement: cleaned };
}
