/**
 * تحويل الأرقام الهندية / العربية المشرقية (٠١٢٣٤٥٦٧٨٩) إلى أرقام عربية قياسية (0123456789).
 */
export function normalizeArabicDigits(input: string): string {
  if (!input) return '';
  return input.replace(/[٠-٩]/g, (char) =>
    (char.charCodeAt(0) - 1632).toString(),
  );
}

/**
 * تطبيع النصوص العربية لغايات المقارنة والبحث الموحد:
 * - إزالة التشكيل والحركات
 * - توحيد أشكال الألف (أ، إ، آ -> ا)
 * - توحيد التاء المربوطة والهاء (ة -> ه)
 * - توحيد الياء والألف المقصورة (ى -> ي)
 * - إزالة المسافات الزائدة والمتكررة
 */
export function normalizeArabicText(input?: string | null): string {
  if (!input) return '';

  return (
    input
      .toString()
      // إزالة التشكيل (Tashkeel)
      .replace(/[\u064B-\u065F\u0670]/g, '')
      // توحيد الألف
      .replace(/[أإآ]/g, 'ا')
      // توحيد التاء المربوطة
      .replace(/ة/g, 'ه')
      // توحيد الياء
      .replace(/ى/g, 'ي')
      // إزالة المسافات المتكررة والمسافات البادئة والناهية
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

/**
 * مقارنة نصين عربيين بعد التطبيع الكامل لضمان مطابقة مرنة للأسماء.
 */
export function areArabicTextsEqual(
  a?: string | null,
  b?: string | null,
): boolean {
  return normalizeArabicText(a) === normalizeArabicText(b);
}

/**
 * تنظيف وتطبيع رقم الهاتف المصري:
 * - تحويل الأرقام الهندية لأرقام عادية
 * - تحويل المدخلات الرقمية لنصوص
 * - حذف المسافات والرموز الزائدة
 * - استعادة الصفر الأولي المفقود من Excel إذا كان الرقم مكوناً من 10 خانات ويبدأ بـ (10, 11, 12, 15)
 * - معالجة كود الدولة (+20 أو 20)
 */
export function normalizeEgyptianPhone(input?: string | number | null): string {
  if (input === undefined || input === null) return '';

  const rawStr = typeof input === 'number' ? input.toString() : String(input);
  let phoneStr = normalizeArabicDigits(rawStr.trim());

  // إزالة أي مسافات أو شرطات أو أقواس
  phoneStr = phoneStr.replace(/[\s\-()]/g, '');

  // إذا كان يبدأ بـ +20
  if (phoneStr.startsWith('+20')) {
    phoneStr = '0' + phoneStr.slice(3);
  } else if (phoneStr.startsWith('0020')) {
    phoneStr = '0' + phoneStr.slice(4);
  } else if (phoneStr.startsWith('20') && phoneStr.length === 12) {
    phoneStr = '0' + phoneStr.slice(2);
  }

  // إذا أسقط Excel الصفر الأولي وأصبح الرقم 10 خانات ويبدأ بـ 10, 11, 12, 15
  if (
    phoneStr.length === 10 &&
    (phoneStr.startsWith('10') ||
      phoneStr.startsWith('11') ||
      phoneStr.startsWith('12') ||
      phoneStr.startsWith('15'))
  ) {
    phoneStr = '0' + phoneStr;
  }

  return phoneStr;
}
