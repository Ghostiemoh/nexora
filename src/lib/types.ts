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
  std?: number;
  /** categorical columns only */
  topValues?: { value: string; count: number }[];
  /** % of non-null cells that conform to the inferred type */
  validity: number;
  /** true when string cells carry leading/trailing whitespace */
  hasWhitespace: boolean;
}

export type CleanOp =
  | { kind: "dropDuplicates" }
  | { kind: "dropEmptyRows" }
  | { kind: "trimWhitespace" }
  | { kind: "fillMissing"; column: string; strategy: "median" | "mode" };

export interface Diagnostic {
  id: string;
  severity: "warning" | "ok";
  title: string;
  description: string;
  fix?: { op: CleanOp; label: string };
}

export interface DatasetHealth {
  overall: number;
  completeness: number;
  uniqueness: number;
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
