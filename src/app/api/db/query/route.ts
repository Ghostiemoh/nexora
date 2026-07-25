import { NextResponse } from "next/server";
import { Client as PgClient } from "pg";
import mysql from "mysql2/promise";
import { guardReadOnly } from "@/lib/db-guard";

export const runtime = "nodejs";

const ROW_CAP = 50_000;

interface QueryBody {
  type: "postgres" | "mysql";
  connectionString: string;
  query: string;
}

/** Execute a read-only query against a user-supplied connection and return
 *  rows for import. Read-only is enforced by guardReadOnly. */
export async function POST(req: Request) {
  let body: QueryBody;
  try {
    body = (await req.json()) as QueryBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.connectionString || !body.query || (body.type !== "postgres" && body.type !== "mysql")) {
    return NextResponse.json({ error: "type, connectionString, and query are required." }, { status: 400 });
  }

  const guard = guardReadOnly(body.query);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: 400 });
  }

  try {
    let rows: Record<string, unknown>[];

    if (body.type === "postgres") {
      const client = new PgClient({ connectionString: body.connectionString, connectionTimeoutMillis: 8000 });
      await client.connect();
      try {
        const res = await client.query(guard.statement);
        rows = res.rows as Record<string, unknown>[];
      } finally {
        await client.end();
      }
    } else {
      const conn = await mysql.createConnection({ uri: body.connectionString, connectTimeout: 8000 });
      try {
        const [result] = await conn.query(guard.statement);
        rows = result as Record<string, unknown>[];
      } finally {
        await conn.end();
      }
    }

    const truncated = rows.length > ROW_CAP;
    const limited = truncated ? rows.slice(0, ROW_CAP) : rows;
    const columns = limited.length > 0 ? Object.keys(limited[0]) : [];

    // Serialize values the browser data model understands.
    const safeRows = limited.map((r) => {
      const out: Record<string, string | number | boolean | null> = {};
      for (const c of columns) {
        const v = r[c];
        if (v === null || v === undefined) out[c] = null;
        else if (typeof v === "number" || typeof v === "boolean") out[c] = v;
        else if (v instanceof Date) out[c] = v.toISOString().slice(0, 10);
        else out[c] = String(v);
      }
      return out;
    });

    return NextResponse.json({ ok: true, columns, rows: safeRows, truncated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Query failed." },
      { status: 502 }
    );
  }
}
