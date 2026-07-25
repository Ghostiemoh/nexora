import { describe, it, expect } from "vitest";
import { guardReadOnly } from "./db-guard";
import { stripSqlFences, buildSchemaContext } from "./ai";
import { profileDataset } from "./profile";

describe("db read-only guard", () => {
  it("allows SELECT / WITH / SHOW / EXPLAIN", () => {
    expect(guardReadOnly("SELECT * FROM users LIMIT 10").ok).toBe(true);
    expect(guardReadOnly("  with t as (select 1) select * from t").ok).toBe(true);
    expect(guardReadOnly("SHOW TABLES").ok).toBe(true);
    expect(guardReadOnly("EXPLAIN SELECT id FROM t").ok).toBe(true);
  });

  it("rejects writes and DDL, whatever the casing", () => {
    expect(guardReadOnly("DELETE FROM users").ok).toBe(false);
    expect(guardReadOnly("drop table users").ok).toBe(false);
    expect(guardReadOnly("SELECT 1; DROP TABLE users").ok).toBe(false);
    expect(guardReadOnly("INSERT INTO t VALUES (1)").ok).toBe(false);
    expect(guardReadOnly("SELECT * FROM t WHERE id IN (SELECT 1) FOR UPDATE OF x").ok).toBe(false);
  });

  it("strips comments before checking, so commented keywords are harmless", () => {
    const block = guardReadOnly("SELECT 1 /* ; DROP TABLE x */ FROM t");
    expect(block.ok).toBe(true);
    expect(block.statement).not.toContain("DROP"); // never reaches the DB
    const line = guardReadOnly("-- DELETE FROM t\nSELECT 1 FROM t");
    expect(line.ok).toBe(true);
    expect(line.statement).not.toContain("DELETE");
  });

  it("strips a single trailing semicolon and rejects chained statements", () => {
    const res = guardReadOnly("SELECT 1 FROM t;");
    expect(res.ok).toBe(true);
    expect(res.statement).toBe("SELECT 1 FROM t");
    expect(guardReadOnly("SELECT 1; SELECT 2").ok).toBe(false);
  });
});

describe("ai helpers", () => {
  it("stripSqlFences unwraps fenced and bare SQL, dropping trailing semicolons", () => {
    expect(stripSqlFences("```sql\nSELECT 1 FROM t;\n```")).toBe("SELECT 1 FROM t");
    expect(stripSqlFences("SELECT 2 FROM t")).toBe("SELECT 2 FROM t");
    expect(stripSqlFences("```\nSELECT 3\n```")).toBe("SELECT 3");
  });

  it("buildSchemaContext ships schema + stats + samples, never the whole table", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      region: ["North", "South"][i % 2],
      amount: 100 + i,
    }));
    const ds = profileDataset({
      id: "x", name: "sales.csv", columns: ["region", "amount"], rows, createdAt: 0, changelog: [],
    });
    const ctx = buildSchemaContext(ds, 5);
    expect(ctx).toContain("Table name: sales");
    expect(ctx).toContain("region");
    expect(ctx).toContain("amount (number)");
    // 5 sample rows, not 500
    const sampleCount = (ctx.match(/"region":/g) ?? []).length;
    expect(sampleCount).toBe(5);
  });
});
