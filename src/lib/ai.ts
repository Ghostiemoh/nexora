/* Gemini-backed AI features. The user's own API key lives in their browser
 * (Settings → AI) and requests go straight from the browser to Google. No
 * Nexora server sits in the middle, so we never see the key or the payload.
 *
 * What Google receives is NOT just a schema. buildSchemaContext sends real
 * values from the file: the first few rows verbatim, plus the most common
 * values and the min/max/mean of every column. Anything written in the UI
 * about AI and privacy has to say that plainly. See PRIVACY.md.
 *
 * Every feature degrades to the local rule-based analyst when no key is set. */

import type { Dataset } from "./types";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

export async function callGemini(apiKey: string, prompt: string, system?: string): Promise<string> {
  // The key goes in a header, never the query string. A URL-borne key ends up
  // in browser history, Referer headers, and every proxy log on the path.
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    }),
  });

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Gemini request failed (${res.status}).`);
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned an empty response.");
  return text.trim();
}

/** Schema, stats, and a few sample rows: enough context to reason about the
 *  data without shipping the data. */
export function buildSchemaContext(dataset: Dataset, sampleRows = 5): string {
  const cols = dataset.profiles
    .map((p) => {
      const bits = [`${p.name} (${p.type})`];
      if (p.type === "number" && p.min !== undefined) {
        bits.push(`range ${p.min}–${p.max}, mean ${p.mean}, median ${p.median}`);
      }
      if (p.dateMin) bits.push(`from ${p.dateMin} to ${p.dateMax}`);
      if (p.topValues?.length) {
        bits.push(`top values: ${p.topValues.slice(0, 4).map((t) => t.value).join(", ")}`);
      }
      if (p.missingCount > 0) bits.push(`${p.missingCount} missing`);
      return `- ${bits.join("; ")}`;
    })
    .join("\n");

  const samples = dataset.rows.slice(0, sampleRows).map((r) => JSON.stringify(r)).join("\n");

  return `Table name: ${dataset.name.replace(/\.[^/.]+$/, "")}
Rows: ${dataset.rows.length}
Columns:
${cols}

Sample rows (first ${Math.min(sampleRows, dataset.rows.length)}):
${samples}`;
}

/** The exact SQL dialect the in-browser engine understands. */
export const ENGINE_DIALECT = `The SQL engine supports ONLY this subset:
- SELECT col1, col2, aggregates: COUNT(*), COUNT(col), COUNT(DISTINCT col), SUM(col), AVG(col), MIN(col), MAX(col), with AS aliases
- FROM <table> (single table, no JOINs, no subqueries)
- WHERE with =, !=, <, >, <=, >=, LIKE (% and _), IS NULL, IS NOT NULL, combined with AND / OR (no parentheses)
- GROUP BY col[, col]
- ORDER BY col|alias|ordinal [ASC|DESC]
- LIMIT n
No JOIN, no HAVING, no CASE, no window functions, no date functions.`;

export function stripSqlFences(text: string): string {
  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  const sql = (fenced ? fenced[1] : text).trim();
  return sql.replace(/;\s*$/, "");
}

export async function generateSqlFromEnglish(
  apiKey: string,
  dataset: Dataset,
  english: string
): Promise<string> {
  const system = `You translate English questions into SQL for a small in-browser engine.
${ENGINE_DIALECT}
Reply with the SQL statement ONLY. Do not add an explanation or a markdown fence.`;
  const prompt = `${buildSchemaContext(dataset)}\n\nQuestion: ${english}\n\nSQL:`;
  return stripSqlFences(await callGemini(apiKey, prompt, system));
}

export async function optimizeOrFixQuery(
  apiKey: string,
  dataset: Dataset,
  sql: string,
  problem: { error?: string; timeMs?: number }
): Promise<string> {
  const system = `You are a senior SQL reviewer for a small in-browser engine.
${ENGINE_DIALECT}
Given a query and its problem, explain the cause in one short paragraph, then give the corrected/optimized query in a \`\`\`sql fence. Be concise.`;
  const situation = problem.error
    ? `The query failed with error: ${problem.error}`
    : `The query succeeded but took ${problem.timeMs} ms. Suggest how to make it cheaper, for example by filtering earlier, selecting fewer columns, or adding a LIMIT.`;
  const prompt = `${buildSchemaContext(dataset, 3)}\n\nQuery:\n${sql}\n\n${situation}`;
  return callGemini(apiKey, prompt, system);
}

export async function chatWithData(
  apiKey: string,
  dataset: Dataset,
  question: string,
  recentTurns: { role: string; text: string }[] = []
): Promise<string> {
  const system = `You are Axiom, the data analyst inside Nexora (a local-first analytics tool).
Answer questions about the user's dataset using the schema, statistics, and sample rows provided.
Be precise and quantitative when the stats allow it; say clearly when a question needs computation you can't see.
When a computed answer would need SQL, include the query in a \`\`\`sql fence using this dialect:
${ENGINE_DIALECT}
Keep answers short, a paragraph or two of plain text. Do not use em dashes.`;

  const history = recentTurns
    .slice(-6)
    .map((t) => `${t.role === "user" ? "User" : "Axiom"}: ${t.text}`)
    .join("\n");

  const prompt = `${buildSchemaContext(dataset)}\n\n${history ? `Recent conversation:\n${history}\n\n` : ""}User question: ${question}`;
  return callGemini(apiKey, prompt, system);
}
