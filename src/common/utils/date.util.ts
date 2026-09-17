/**
 * الحصول على أول يوم في الشهر (الساعة 00:00:00.000 UTC)
 */
export function getFirstDayOfMonth(date: Date = new Date()): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * الحصول على أول يوم في الشهر التالي (الساعة 00:00:00.000 UTC)
 */
export function getFirstDayOfNextMonth(date: Date = new Date()): Date {
  const d = new Date(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
}

/**
 * الحصول على آخر يوم في الشهر (الساعة 23:59:59.999 UTC) بعد إضافة عدد معين من الأشهر
 */
export function getLastDayOfMonth(
  date: Date = new Date(),
  addMonthsCount: number = 0,
): Date {
  const d = new Date(date);
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + addMonthsCount + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  );
}

/**
 * إضافة عدد محدد من الأشهر التقويمية (Calendar Months) إلى تاريخ معين بنظام UTC.
 * يتعامل بذكاء مع نهايات الأشهر المختلفة (مثل 31 يناير + شهر -> 28/29 فبراير).
 */
export function addMonths(date: Date, months: number = 1): Date {
  const result = new Date(date);
  const originalDay = result.getUTCDate();

  result.setUTCMonth(result.getUTCMonth() + months);

  // في حال تجاوز الشهر اليوم الأصلي (مثلاً الانتقال من 31 يناير إلى مارس)
  if (result.getUTCDate() !== originalDay) {
    result.setUTCDate(0); // تعيين اليوم الأخير من الشهر المستهدف
  }

  return result;
}
