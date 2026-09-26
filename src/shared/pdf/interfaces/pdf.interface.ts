export interface PdfTableColumn {
  header: string;
  key: string;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
}

export interface BuildPdfTableOptions {
  title: string;
  subtitle?: string;
  columns: PdfTableColumn[];
  data: Record<string, unknown>[];
  dateStr?: string;
  orientation?: 'portrait' | 'landscape';
}
