import { describe, it, expect } from "vitest";
import { executeSql } from "./sql-engine";
import type { Row } from "./types";

const data: Row[] = [
  { id: 1, city: "Lagos", amount: "1,200", tier: "Pro" },
  { id: 2, city: "Kano", amount: "800", tier: "Pro" },
  { id: 3, city: "Lagos", amount: "2,000", tier: "Enterprise" },
  { id: 4, city: "Abuja", amount: "500", tier: "Pro" },
  { id: 5, city: "Big AND Tall", amount: "100", tier: "Pro" },
];

describe("projection & filtering", () => {
  it("returns all rows for SELECT *", () => {
    const r = executeSql("SELECT * FROM t", data);
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(5);
  });

  it("evaluates OR correctly (not silently passing every row)", () => {
    const r = executeSql("SELECT * FROM t WHERE city = 'Kano' OR city = 'Abuja'", data);
    expect(r.rows).toHaveLength(2);
  });

  it("evaluates AND correctly", () => {
    const r = executeSql("SELECT * FROM t WHERE tier = 'Pro' AND city = 'Lagos'", data);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].id).toBe(1);
  });

  it("does not split on keywords inside string literals", () => {
    const r = executeSql("SELECT * FROM t WHERE city = 'Big AND Tall'", data);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].id).toBe(5);
  });

  it("supports LIKE", () => {
    const r = executeSql("SELECT * FROM t WHERE city LIKE 'La%'", data);
    expect(r.rows).toHaveLength(2);
  });

  it("errors on unknown columns instead of returning silent nulls", () => {
    const r = executeSql("SELECT nope FROM t", data);
    expect(r.error).toMatch(/Unknown column/i);
  });
});

describe("aggregates", () => {
  it("sums currency-formatted values instead of dropping them", () => {
    const r = executeSql("SELECT SUM(amount) AS total FROM t", data);
    expect(r.rows[0].total).toBe(4600); // 1200+800+2000+500+100
  });

  it("supports COUNT(DISTINCT col)", () => {
    const r = executeSql("SELECT COUNT(DISTINCT city) AS c FROM t", data);
    expect(r.rows[0].c).toBe(4);
  });

  it("groups and orders by alias", () => {
    const r = executeSql("SELECT city, COUNT(*) AS n FROM t GROUP BY city ORDER BY n DESC", data);
    expect(r.rows[0].city).toBe("Lagos");
    expect(r.rows[0].n).toBe(2);
  });

  it("orders by ordinal position (ORDER BY 2)", () => {
    const r = executeSql("SELECT city, COUNT(*) AS n FROM t GROUP BY city ORDER BY 2 DESC LIMIT 1", data);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].city).toBe("Lagos");
  });
});
