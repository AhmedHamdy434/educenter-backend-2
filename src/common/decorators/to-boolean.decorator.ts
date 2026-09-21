import { Transform } from 'class-transformer';

export function ToBoolean() {
  return Transform(({ value, obj, key }) => {
    // قراءة القيمة الخام الأصلية قبل التحويل الضمني
    const rawObj = obj as Record<string, unknown> | undefined;
    const val: unknown =
      rawObj && key && rawObj[key] !== undefined
        ? rawObj[key]
        : (value as unknown);

    if (val === '1' || val === 1 || val === 'true' || val === true) {
      return true;
    }

    if (val === '0' || val === 0 || val === 'false' || val === false) {
      return false;
    }

    return undefined;
  });
}
