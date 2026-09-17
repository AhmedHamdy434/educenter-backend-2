/**
 * الحصول على أول يوم في الشهر (الساعة 00:00:00.000)
 */
export function getFirstDayOfMonth(date: Date = new Date()): Date {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * الحصول على آخر يوم في الشهر (الساعة 23:59:59.999) بعد إضافة عدد معين من الأشهر
 */
export function getLastDayOfMonth(
  date: Date = new Date(),
  addMonthsCount: number = 0,
): Date {
  const d = new Date(date);
  return new Date(
    d.getFullYear(),
    d.getMonth() + addMonthsCount + 1,
    0,
    23,
    59,
    59,
    999,
  );
}

/**
 * إضافة عدد محدد من الأشهر التقويمية (Calendar Months) إلى تاريخ معين.
 * يتعامل بذكاء مع نهايات الأشهر المختلفة (مثل 31 يناير + شهر -> 28/29 فبراير).
 */
export function addMonths(date: Date, months: number = 1): Date {
  const result = new Date(date);
  const originalDay = result.getDate();

  result.setMonth(result.getMonth() + months);

  // في حال تجاوز الشهر اليوم الأصلي (مثلاً الانتقال من 31 يناير إلى مارس)
  if (result.getDate() !== originalDay) {
    result.setDate(0); // تعيين اليوم الأخير من الشهر المستهدف
  }

  return result;
}
