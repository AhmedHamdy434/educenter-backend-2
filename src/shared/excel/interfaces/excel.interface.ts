export interface ExcelColumnDefinition {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
  example?: string | number;
}

export interface BuildWorkbookOptions {
  sheetName?: string;
  columns: ExcelColumnDefinition[];
  data: Array<Record<string, any>>;
  sanitizeFormula?: boolean;
  isRtl?: boolean;
}

export interface BuildTemplateOptions {
  dataSheetName?: string;

  instructionsSheetName?: string;
  columns: ExcelColumnDefinition[];
  sampleRows?: Array<Record<string, any>>;
  instructions?: string[];
  referenceTables?: Array<{
    title: string;
    items: string[];
  }>;
}

export interface RowValidationError {
  row: number;
  field: string;
  value?: unknown;
  message: string;
}

export interface ExcelImportSummary<T = unknown> {
  totalRows: number;
  validRows: number;
  failedRows: number;
  remainingErrorsCount?: number;
  errors: RowValidationError[];
  data?: T[];
}

export interface ParseSheetOptions {
  maxRows?: number;
  sheetIndexOrName?: number | string;
  expectedHeaders?: string[];
  headerRowNumber?: number;
}

export interface ParsedSheetResult {
  headers: string[];
  rows: Array<{
    rowNumber: number;
    values: Record<string, any>;
  }>;
}
