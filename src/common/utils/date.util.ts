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

export const CAIRO_TIMEZONE = 'Africa/Cairo';

export interface CairoDateParts {
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  day: number;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  hour: number;
  minute: number;
  second: number;
}

/**
 * استخراج أجزاء التاريخ الحالية وفقاً لتوقيت القاهرة الرسمي (Africa/Cairo)
 */
export function getCairoDateParts(d: Date = new Date()): CairoDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10) - 1;
  const day = parseInt(map.day, 10);
  const rawHour = parseInt(map.hour, 10);
  const hour = rawHour === 24 ? 0 : rawHour % 24;
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);

  const utcEquivalent = new Date(Date.UTC(year, month, day));
  const dayOfWeek = utcEquivalent.getUTCDay();

  return { year, month, day, dayOfWeek, hour, minute, second };
}

/**
 * الحصول على بداية اليوم الحالي (الساعة 00:00:00.000 UTC) معتمداً على التاريخ التقويمي في توقيت القاهرة.
 */
export function getTodayMidnightUtcInCairo(date: Date = new Date()): Date {
  const { year, month, day } = getCairoDateParts(date);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

/**
 * تحويل تاريخ إلى صيغة YYYY-MM-DD وفقاً لتوقيت القاهرة.
 */
export function getCairoDateString(date: Date = new Date()): string {
  const { year, month, day } = getCairoDateParts(date);
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * تحويل نص تاريخ تقويمي بصيغة YYYY-MM-DD إلى Date في UTC midnight.
 */
export function parseDateStringToUtcMidnight(dateStr: string): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

/**
 * استخراج نطاق شهر تقويمي بصيغة YYYY-MM (بداية الشهر UTC 00:00:00 إلى نهاية الشهر UTC 23:59:59.999).
 */
export function getCairoMonthRange(yearMonth: string): {
  startDate: Date;
  endDate: Date;
  year: number;
  month: number;
  daysInMonth: number;
} {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;

  const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const lastDayDate = new Date(Date.UTC(year, month + 1, 0));
  const daysInMonth = lastDayDate.getUTCDate();
  const endDate = new Date(Date.UTC(year, month, daysInMonth, 23, 59, 59, 999));

  return { startDate, endDate, year, month, daysInMonth };
}
