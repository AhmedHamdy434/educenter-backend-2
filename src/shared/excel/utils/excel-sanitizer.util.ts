/**
 * الرموز التي يمكن استخدامها في هجمات Formula Injection في ملفات Excel و CSV.
 */
const FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * تطهير القيمة النصية أثناء التصدير فقط (Export Only):
 * إذا كانت القيمة نصية وتبدأ بأحد الرموز الخطرة، يتم إضافة فاصلة عليا بادئة (')
 * لمنع برامج الجداول الإلكترونية (مثل MS Excel و LibreOffice) من تفسيرها كمعادلة تنفيذية.
 */
export function sanitizeForExport(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (
    trimmed.length > 0 &&
    FORMULA_TRIGGER_CHARS.some((char) => trimmed.startsWith(char))
  ) {
    return `'${value}`;
  }

  return value;
}

/**
 * تطهير كائن بيانات كامل للصف أثناء التصدير.
 */
export function sanitizeRowForExport(
  row: Record<string, any>,
): Record<string, any> {
  const sanitizedRow: Record<string, any> = {};

  for (const [key, val] of Object.entries(row)) {
    sanitizedRow[key] = sanitizeForExport(val);
  }

  return sanitizedRow;
}
