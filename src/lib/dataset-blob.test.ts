import { describe, it, expect } from "vitest";
import { generateDataKey } from "./crypto";
import { sealDataset, openDataset, DATASET_BLOB_VERSION } from "./dataset-blob";
import type { Dataset } from "./types";

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "local-1",
    name: "Q3 receivables.csv",
    columns: ["client", "amount", "status"],
    rows: [
      { client: "Adeyemi Holdings", amount: 412000, status: "unpaid" },
      { client: "Okonkwo Ltd", amount: 98500, status: "paid" },
    ],
    profiles: [],
    health: { overall: 88, completeness: 90, accuracy: 86, validity: 88, consistency: 88 },
    diagnostics: [],
    duplicateRows: 0,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_500_000,
    changelog: [],
    truncated: false,
    ...overrides,
  } as Dataset;
}

describe("sealing a dataset for Storage", () => {
  it("round-trips every field unchanged", async () => {
    const key = await generateDataKey();
    const dataset = makeDataset();

    const opened = await openDataset(key, await sealDataset(key, dataset));

    expect(opened).toEqual(dataset);
  });

  /* The claim the product now makes is "the server cannot read it", so this is
   * the test that claim rests on. A cell value appearing in the blob would mean
   * the compression ran and the sealing did not. */
  it("leaves no cell value, column name, or filename in the bytes", async () => {
    const key = await generateDataKey();
    const blob = await sealDataset(key, makeDataset());
    const asText = new TextDecoder().decode(blob);

    for (const secret of ["Adeyemi", "Okonkwo", "unpaid", "client", "receivables", "412000"]) {
      expect(asText).not.toContain(secret);
    }
  });

  it("stamps a version byte so a later format can be told apart", async () => {
    const key = await generateDataKey();
    const blob = await sealDataset(key, makeDataset());

    expect(blob[0]).toBe(DATASET_BLOB_VERSION);
  });

  /* Rows are JSON objects that repeat every column name on every row, which is
   * why compressing before sealing is not a micro-optimisation: without it a
   * modest CSV arrives at Storage several times its original size. */
  it("compresses, so repetitive rows do not inflate on the wire", async () => {
    const key = await generateDataKey();
    const rows = Array.from({ length: 2000 }, (_, i) => ({
      client: "Adeyemi Holdings",
      amount: i,
      status: "unpaid",
    }));
    const dataset = makeDataset({ rows });

    const rawSize = new TextEncoder().encode(JSON.stringify(dataset)).byteLength;
    const blob = await sealDataset(key, dataset);

    expect(blob.byteLength).toBeLessThan(rawSize / 4);
  });

  it("survives a dataset with nulls, empty strings, and unicode", async () => {
    const key = await generateDataKey();
    const dataset = makeDataset({
      columns: ["name", "note"],
      rows: [
        { name: "Ọlábísí", note: null },
        { name: "", note: "café — naïve" },
      ],
    });

    expect(await openDataset(key, await sealDataset(key, dataset))).toEqual(dataset);
  });

  it("refuses a blob sealed under a different account's key", async () => {
    const mine = await generateDataKey();
    const theirs = await generateDataKey();
    const blob = await sealDataset(mine, makeDataset());

    await expect(openDataset(theirs, blob)).rejects.toThrow();
  });

  it("refuses a truncated blob rather than returning half a dataset", async () => {
    const key = await generateDataKey();
    const blob = await sealDataset(key, makeDataset());

    await expect(openDataset(key, blob.slice(0, blob.byteLength - 8))).rejects.toThrow();
  });

  it("refuses a blob whose version byte it does not recognise", async () => {
    const key = await generateDataKey();
    const blob = await sealDataset(key, makeDataset());
    blob[0] = 99;

    await expect(openDataset(key, blob)).rejects.toThrow(/version/i);
  });

  /* Two seals of identical input must differ, or the storage layer leaks which
   * datasets are unchanged between devices just from the bytes. */
  it("produces different bytes each time, because the nonce is fresh", async () => {
    const key = await generateDataKey();
    const dataset = makeDataset();

    const a = await sealDataset(key, dataset);
    const b = await sealDataset(key, dataset);

    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});
