/**
 * Default sensitive field names to redact from logs (case-insensitive).
 */
export const DEFAULT_SENSITIVE_FIELDS: readonly string[] = [
  'password',
  'newpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'apikey',
];

/**
 * Recursively redacts sensitive keys from an object or array.
 * Creates a sanitized copy without mutating the original input.
 * Handles circular references safely.
 * Converts Prisma Decimal / BigNumber instances to clean numbers/strings for readability.
 */
export function redactSensitive(
  data: unknown,
  customFields: string[] = [],
  visited: WeakSet<object> = new WeakSet(),
): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  // Primitive values (string, number, boolean, symbol, etc.)
  if (typeof data !== 'object') {
    return data;
  }

  // Handle Date, RegExp, Error instances
  if (data instanceof Date) {
    return data.toISOString();
  }
  if (data instanceof RegExp) {
    return data.toString();
  }
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
  }

  // Handle Decimal / BigNumber instances (e.g. Prisma Decimal, decimal.js)
  if (
    typeof (data as { toFixed?: unknown }).toFixed === 'function' &&
    typeof (data as { toNumber?: unknown }).toNumber === 'function'
  ) {
    try {
      return (data as { toNumber: () => number }).toNumber();
    } catch {
      return (data as { toString: () => string }).toString();
    }
  }

  // Prevent circular references
  if (visited.has(data)) {
    return '[CIRCULAR]';
  }
  visited.add(data);

  // Handle Arrays
  if (Array.isArray(data)) {
    return data.map((item) => redactSensitive(item, customFields, visited));
  }

  // Handle plain objects
  const sensitiveFieldList = [
    ...DEFAULT_SENSITIVE_FIELDS,
    ...customFields.map((f) => f.trim().toLowerCase()).filter(Boolean),
  ];

  const result: Record<string, unknown> = {};
  const entries = Object.entries(data as Record<string, unknown>);

  for (const [key, value] of entries) {
    const normalizedKey = key.toLowerCase();
    const isSensitive = sensitiveFieldList.includes(normalizedKey);

    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSensitive(value, customFields, visited);
    }
  }

  return result;
}

/**
 * Truncates a string to maxLength characters and appends a truncation notice if needed.
 */
export function truncatePayload(payload: string, maxLength: number): string {
  if (!payload || maxLength <= 0 || payload.length <= maxLength) {
    return payload;
  }
  return `${payload.slice(0, maxLength)}... [truncated]`;
}

/**
 * Safely serializes data to a JSON string and truncates if necessary.
 * In pretty mode, formats with 2-space indentation.
 * Never throws an error.
 */
export function safeSerializeAndRedact(
  data: unknown,
  maxLength: number = 1000,
  customFields: string[] = [],
  pretty: boolean = false,
): string {
  try {
    const redacted = redactSensitive(data, customFields);
    const serialized = pretty
      ? JSON.stringify(redacted, null, 2)
      : JSON.stringify(redacted);
    if (serialized === undefined) {
      return 'undefined';
    }
    return truncatePayload(serialized, maxLength);
  } catch (err) {
    return `[UNABLE_TO_SERIALIZE_BODY: ${err instanceof Error ? err.message : 'Unknown error'}]`;
  }
}

/**
 * Formats a serialized body for pretty multi-line console output.
 * Indents each line so the block nests neatly under "  Body: { ... }".
 */
export function formatIndentedBody(bodyStr: string): string {
  const lines = bodyStr.split('\n');
  if (lines.length <= 1) {
    return `  Body: ${bodyStr}`;
  }
  const indented = lines
    .map((line, idx) => (idx === 0 ? line : `  ${line}`))
    .join('\n');
  return `  Body: ${indented}`;
}
