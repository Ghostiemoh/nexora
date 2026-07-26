import { NextResponse } from "next/server";
import { Client as PgClient } from "pg";
import mysql from "mysql2/promise";

export const runtime = "nodejs";

interface TestBody {
  type: "postgres" | "mysql";
  connectionString: string;
}

/** Connectivity check + table listing for a user-supplied connection. The
 *  connection string comes from and stays with the user. It is used for this
 *  request only and never persisted server-side. */
export async function POST(req: Request) {
  let body: TestBody;
  try {
    body = (await req.json()) as TestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.connectionString || (body.type !== "postgres" && body.type !== "mysql")) {
    return NextResponse.json({ error: "type ('postgres'|'mysql') and connectionString are required." }, { status: 400 });
  }

  try {
    if (body.type === "postgres") {
      const client = new PgClient({ connectionString: body.connectionString, connectionTimeoutMillis: 8000 });
      await client.connect();
      try {
        const res = await client.query(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema NOT IN ('pg_catalog','information_schema')
           ORDER BY table_name LIMIT 200`
        );
        return NextResponse.json({ ok: true, tables: res.rows.map((r: { table_name: string }) => r.table_name) });
      } finally {
        await client.end();
      }
    }

    const conn = await mysql.createConnection({ uri: body.connectionString, connectTimeout: 8000 });
    try {
      const [rows] = await conn.query("SHOW TABLES");
      const tables = (rows as Record<string, string>[]).map((r) => String(Object.values(r)[0]));
      return NextResponse.json({ ok: true, tables: tables.slice(0, 200) });
    } finally {
      await conn.end();
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Connection failed." },
      { status: 502 }
    );
  }
}
