/* A minimal ZIP writer, store-only (compression method 0).
 *
 * Both formats Nexora exports to are ZIP containers: a Power BI PBIP project
 * folder and a Tableau .twbx. Neither requires deflate — the spec has always
 * allowed stored entries, and Power BI Desktop and Tableau both read them. That
 * buys a correct archive in about a hundred lines with no dependency, which
 * matters for a build whose whole promise is that nothing leaves the tab.
 *
 * Pure functions over byte arrays, so the archive can be assembled and checked
 * without a browser. */

/** CRC-32 (IEEE 802.3), the checksum every ZIP entry carries. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** path inside the archive, forward slashes, no leading slash */
  path: string;
  /** text is encoded UTF-8; bytes are stored as given */
  data: string | Uint8Array;
}

const encoder = new TextEncoder();

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? encoder.encode(data) : data;
}

/** Normalize a path the way the ZIP spec expects: forward slashes, relative. */
export function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

/* Little-endian writers. ZIP is little-endian throughout. */
function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}
function u32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/** DOS date/time. Fixed to 1980-01-01 so the same input always produces the
 *  same archive bytes: a reproducible export is one you can diff. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

/** Build a ZIP archive. Entries are stored uncompressed, in the order given. */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(normalizeZipPath(entry.path));
    const dataBytes = toBytes(entry.data);
    const checksum = crc32(dataBytes);
    const size = dataBytes.length;

    // Bit 11 marks the filename as UTF-8, which matters for any non-ASCII
    // dataset name that reaches a path.
    const flags = 0x0800;

    const localHeader = [
      ...u32(0x04034b50),
      ...u16(20), // version needed: 2.0
      ...u16(flags),
      ...u16(0), // method: stored
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(checksum),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0), // extra field length
    ];

    local.push(...localHeader, ...nameBytes, ...dataBytes);

    central.push(
      ...u32(0x02014b50),
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(flags),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(checksum),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0), // extra
      ...u16(0), // comment
      ...u16(0), // disk number
      ...u16(0), // internal attrs
      ...u32(0), // external attrs
      ...u32(offset),
      ...nameBytes
    );

    offset += localHeader.length + nameBytes.length + size;
  }

  const end = [
    ...u32(0x06054b50),
    ...u16(0), // this disk
    ...u16(0), // disk with central directory
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0), // comment length
  ];

  const out = new Uint8Array(local.length + central.length + end.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(end, local.length + central.length);
  return out;
}

export function zipToBlob(entries: ZipEntry[]): Blob {
  // Copy into a fresh ArrayBuffer so the Blob never sees a SharedArrayBuffer view.
  const bytes = createZip(entries);
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/zip" });
}
