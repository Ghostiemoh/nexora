import { describe, it, expect } from "vitest";
import { crc32, createZip, normalizeZipPath } from "./zip";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Read a little-endian unsigned integer of `width` bytes at `at`. */
function readLE(bytes: Uint8Array, at: number, width: number): number {
  let value = 0;
  for (let i = width - 1; i >= 0; i--) value = value * 256 + bytes[at + i];
  return value;
}

/** Walk the central directory and return what a reader would see. Parsing the
 *  archive back is the only honest way to prove it is well formed. */
function readCentralDirectory(zip: Uint8Array) {
  // The end-of-central-directory record is the last 22 bytes (no comment).
  const eocd = zip.length - 22;
  expect(readLE(zip, eocd, 4)).toBe(0x06054b50);

  const count = readLE(zip, eocd + 10, 2);
  const cdSize = readLE(zip, eocd + 12, 4);
  const cdOffset = readLE(zip, eocd + 16, 4);
  expect(cdOffset + cdSize).toBe(eocd);

  const files: { path: string; crc: number; size: number; localOffset: number }[] = [];
  let at = cdOffset;
  for (let i = 0; i < count; i++) {
    expect(readLE(zip, at, 4)).toBe(0x02014b50);
    const nameLen = readLE(zip, at + 28, 2);
    files.push({
      crc: readLE(zip, at + 16, 4),
      size: readLE(zip, at + 24, 4),
      localOffset: readLE(zip, at + 42, 4),
      path: decoder.decode(zip.subarray(at + 46, at + 46 + nameLen)),
    });
    at += 46 + nameLen;
  }
  return files;
}

/** Pull an entry's stored bytes out via its local header. */
function readEntryData(zip: Uint8Array, localOffset: number): Uint8Array {
  expect(readLE(zip, localOffset, 4)).toBe(0x04034b50);
  const size = readLE(zip, localOffset + 18, 4);
  const nameLen = readLE(zip, localOffset + 26, 2);
  const extraLen = readLE(zip, localOffset + 28, 2);
  const start = localOffset + 30 + nameLen + extraLen;
  return zip.subarray(start, start + size);
}

describe("crc32", () => {
  it("matches the published check value for '123456789'", () => {
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for empty input", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("matches the known value for 'The quick brown fox jumps over the lazy dog'", () => {
    expect(crc32(encoder.encode("The quick brown fox jumps over the lazy dog"))).toBe(0x414fa339);
  });
});

describe("normalizeZipPath", () => {
  it("converts backslashes and strips a leading slash", () => {
    expect(normalizeZipPath("\\Report\\report.json")).toBe("Report/report.json");
    expect(normalizeZipPath("/data/dataset.csv")).toBe("data/dataset.csv");
  });
});

describe("createZip", () => {
  it("writes a readable central directory for every entry", () => {
    const zip = createZip([
      { path: "a.txt", data: "hello" },
      { path: "nested/b.json", data: '{"ok":true}' },
    ]);

    const files = readCentralDirectory(zip);
    expect(files.map((f) => f.path)).toEqual(["a.txt", "nested/b.json"]);
    expect(files[0].size).toBe(5);
    expect(files[0].crc).toBe(crc32(encoder.encode("hello")));
  });

  it("round-trips entry content through the local headers", () => {
    const payload = '{"name":"Nexora","rows":42}';
    const zip = createZip([
      { path: "first.csv", data: "a,b\n1,2\n" },
      { path: "model.bim", data: payload },
    ]);

    const files = readCentralDirectory(zip);
    const recovered = decoder.decode(readEntryData(zip, files[1].localOffset));
    expect(recovered).toBe(payload);
  });

  it("stores UTF-8 paths and content without corruption", () => {
    const zip = createZip([{ path: "données/café.csv", data: "région\nAbuja – North\n" }]);
    const files = readCentralDirectory(zip);
    expect(files[0].path).toBe("données/café.csv");
    expect(decoder.decode(readEntryData(zip, files[0].localOffset))).toContain("Abuja – North");
  });

  it("accepts raw bytes alongside text", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x10]);
    const zip = createZip([{ path: "image.jpg", data: bytes }]);
    const files = readCentralDirectory(zip);
    expect(Array.from(readEntryData(zip, files[0].localOffset))).toEqual(Array.from(bytes));
  });

  it("produces identical bytes for identical input", () => {
    const build = () => createZip([{ path: "x.txt", data: "same" }]);
    expect(Array.from(build())).toEqual(Array.from(build()));
  });

  it("writes a valid empty archive", () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22);
    expect(readCentralDirectory(zip)).toEqual([]);
  });
});
