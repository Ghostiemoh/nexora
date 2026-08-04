/* Core data model for the Nexora analytics engine */

export type CellValue = string | number | boolean | null;
export type Row = Record<string, CellValue>;

export type ColumnType = "number" | "string" | "date" | "boolean" | "category";

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  /** % of rows with a non-null value */
  completeness: number;
  /** % of non-null values that are unique */
  uniqueness: number;
  missingCount: number;
  uniqueCount: number;
  /** numeric columns only */
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  /** sample standard deviation (Bessel's correction, n-1) */
  std?: number;
  /** first quartile (25th percentile) */
  p25?: number;
  /** third quartile (75th percentile) */
  p75?: number;
  /** interquartile range (p75 - p25) */
  iqr?: number;
  /** count of numeric values outside the 1.5*IQR fences */
  outlierCount?: number;
  /** date columns only, ISO range bounds */
  dateMin?: string;
  dateMax?: string;
  /** categorical columns only */
  topValues?: { value: string; count: number }[];
  /** % of non-null cells that conform to the inferred type */
  validity: number;
  /** true when string cells carry leading/trailing or doubled-up whitespace */
  hasWhitespace: boolean;
  /** true when string cells contain broken text encoding (mojibake) */
  hasMojibake?: boolean;
}

export type CleanOp =
  | { kind: "dropDuplicates" }
  | { kind: "dropEmptyRows" }
  | { kind: "trimWhitespace" }
  | { kind: "fillMissing"; column: string; strategy: "median" | "mode" }
  | { kind: "fixEncoding" }
  | { kind: "standardizeCase"; column: string }
  | { kind: "mergeValues"; column: string; mapping: Record<string, string> }
  | { kind: "convertExcelDates"; column: string }
  | { kind: "dropColumn"; column: string }
  | { kind: "findReplace"; column: string | null; find: string; replace: string; matchCase?: boolean }
  | { kind: "splitColumn"; column: string; delimiter: string; keepOriginal?: boolean }
  /** winsorize: pull values beyond the 1.5×IQR fences back onto them */
  | { kind: "capOutliers"; column: string }
  /** delete the rows holding a value beyond the 1.5×IQR fences */
  | { kind: "dropOutlierRows"; column: string };

export interface Diagnostic {
  id: string;
  severity: "warning" | "ok";
  title: string;
  description: string;
  fix?: {
    op: CleanOp;
    label: string;
    /** true when applying it is a judgement call, so a bulk "fix everything"
     *  run must leave it for the analyst to decide deliberately */
    manual?: boolean;
  };
  /** what to do about a finding that has no mechanical remedy. Every finding
   *  carries a fix or guidance; none is ever a dead end. */
  guidance?: string;
}

export interface DatasetHealth {
  overall: number;
  completeness: number;
  /** share of numeric cells within the 1.5*IQR fences (100 when no numeric columns) */
  accuracy: number;
  validity: number;
  consistency: number;
}

export interface Dataset {
  id: string;
  name: string;
  columns: string[];
  rows: Row[];
  profiles: ColumnProfile[];
  health: DatasetHealth;
  diagnostics: Diagnostic[];
  duplicateRows: number;
  createdAt: number;
  updatedAt: number;
  changelog: string[];
  /** parse stopped at the row cap */
  truncated: boolean;
  /** every cleaning op applied, in order, exportable and replayable */
  recipe?: CleanOp[];
}

export interface AxiomTable {
  headers: string[];
  rows: (string | number)[][];
}

export interface AxiomAnswer {
  text: string;
  table?: AxiomTable;
  suggestions?: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "axiom" | "system";
  text: string;
  table?: AxiomTable;
  suggestions?: string[];
  at: number;
}

export interface AppNotification {
  id: string;
  at: number;
  level: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  read: boolean;
}

export interface AuditEntry {
  id: string;
  at: number;
  /** short machine-ish verb: import, fix, undo, recipe, export, query, connection, team */
  action: string;
  detail: string;
  datasetId?: string;
  datasetName?: string;
}

export interface ExportRecord {
  id: string;
  at: number;
  kind: "csv" | "xlsx" | "md" | "recipe" | "workspace";
  filename: string;
  datasetId?: string;
  datasetName?: string;
  /** stored payload for direct re-download (text formats, size-capped);
   *  xlsx re-generates from the dataset instead */
  content?: string;
}

export interface DbConnection {
  id: string;
  name: string;
  type: "postgres" | "mysql";
  connectionString: string;
  lastStatus?: "ok" | "error";
  lastError?: string;
  lastCheckedAt?: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  roleType: string;
  initials: string;
  bgClass: string;
}

export interface SupportTicket {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  date: string;
}

