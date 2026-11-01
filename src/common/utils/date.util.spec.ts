import {
  getFirstDayOfMonth,
  getFirstDayOfNextMonth,
  getLastDayOfMonth,
  addMonths,
  getCairoDateParts,
  getTodayMidnightUtcInCairo,
  getCairoDateString,
  parseDateStringToUtcMidnight,
  getCairoMonthRange,
} from './date.util';

describe('date.util', () => {
  describe('getFirstDayOfMonth', () => {
    it('should return the first day of the month at 00:00:00.000 UTC', () => {
      const input = new Date('2026-10-15T14:30:00.000Z');
      const result = getFirstDayOfMonth(input);

      expect(result.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(result.getUTCDate()).toBe(1);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
      expect(result.getUTCMilliseconds()).toBe(0);
    });

    it('should not regress to previous month due to local timezone offsets', () => {
      // Testing with September date
      const input = new Date('2026-09-17T12:00:00.000Z');
      const result = getFirstDayOfMonth(input);

      expect(result.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(result.toISOString().slice(0, 10)).toBe('2026-09-01');
    });
  });

  describe('getFirstDayOfNextMonth', () => {
    it('should return the first day of the next month even if input date has time 00:00:00', () => {
      const input = new Date('2026-12-31T00:00:00.000Z');
      const result = getFirstDayOfNextMonth(input);

      expect(result.toISOString()).toBe('2027-01-01T00:00:00.000Z');
      expect(result.getUTCDate()).toBe(1);
      expect(result.getUTCFullYear()).toBe(2027);
      expect(result.getUTCMonth()).toBe(0); // January
    });

    it('should return the first day of the next month when input has time 23:59:59.999', () => {
      const input = new Date('2026-09-30T23:59:59.999Z');
      const result = getFirstDayOfNextMonth(input);

      expect(result.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });
  });

  describe('getLastDayOfMonth', () => {
    it('should return the last day of the current month at 23:59:59.999 UTC when addMonthsCount is 0', () => {
      const input = new Date('2026-09-15T10:00:00.000Z');
      const result = getLastDayOfMonth(input, 0);

      // September has 30 days
      expect(result.toISOString()).toBe('2026-09-30T23:59:59.999Z');
      expect(result.getUTCDate()).toBe(30);
    });

    it('should return the last day of October for an October date', () => {
      const input = new Date('2026-10-05T10:00:00.000Z');
      const result = getLastDayOfMonth(input, 0);

      // October has 31 days
      expect(result.toISOString()).toBe('2026-10-31T23:59:59.999Z');
      expect(result.getUTCDate()).toBe(31);
    });

    it('should calculate end date for yearly subscriptions (add 11 months from start)', () => {
      const input = new Date('2026-01-01T00:00:00.000Z');
      const result = getLastDayOfMonth(input, 11);

      // January + 11 months -> December
      expect(result.toISOString()).toBe('2026-12-31T23:59:59.999Z');
    });
  });

  describe('addMonths', () => {
    it('should add months accurately in UTC', () => {
      const input = new Date('2026-01-15T00:00:00.000Z');
      const result = addMonths(input, 2);

      expect(result.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    });

    it('should handle month-end adjustments (e.g., Jan 31 to Feb)', () => {
      const input = new Date('2026-01-31T00:00:00.000Z');
      const result = addMonths(input, 1);

      // 2026 is not a leap year, so Feb has 28 days
      expect(result.getUTCDate()).toBe(28);
      expect(result.getUTCMonth()).toBe(1); // February (0-based)
    });
  });

  describe('Cairo Timezone Helpers', () => {
    describe('getCairoDateParts', () => {
      it('should correctly extract Cairo date parts when UTC is late in the day', () => {
        // 2026-10-31 at 22:30:00 UTC is 2026-11-01 at 00:30:00 in Cairo (UTC+2)
        const utcDate = new Date('2026-10-31T22:30:00.000Z');
        const parts = getCairoDateParts(utcDate);

        expect(parts.year).toBe(2026);
        expect(parts.month).toBe(10); // November (0-based)
        expect(parts.day).toBe(1);
        expect(parts.hour).toBe(0);
        expect(parts.minute).toBe(30);
      });
    });

    describe('getTodayMidnightUtcInCairo', () => {
      it('should return UTC midnight of the Cairo calendar day', () => {
        const utcDate = new Date('2026-10-31T22:30:00.000Z');
        const midnight = getTodayMidnightUtcInCairo(utcDate);

        expect(midnight.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      });

      it('should return 2026-10-31 midnight during daytime', () => {
        const utcDate = new Date('2026-10-31T10:00:00.000Z');
        const midnight = getTodayMidnightUtcInCairo(utcDate);

        expect(midnight.toISOString()).toBe('2026-10-31T00:00:00.000Z');
      });
    });

    describe('getCairoDateString', () => {
      it('should format date string in YYYY-MM-DD according to Cairo time', () => {
        const utcDate = new Date('2026-10-31T22:15:00.000Z');
        expect(getCairoDateString(utcDate)).toBe('2026-11-01');

        const dayDate = new Date('2026-10-31T10:15:00.000Z');
        expect(getCairoDateString(dayDate)).toBe('2026-10-31');
      });
    });

    describe('parseDateStringToUtcMidnight', () => {
      it('should parse YYYY-MM-DD string into UTC midnight Date', () => {
        const parsed = parseDateStringToUtcMidnight('2026-10-15');
        expect(parsed.toISOString()).toBe('2026-10-15T00:00:00.000Z');
      });
    });

    describe('getCairoMonthRange', () => {
      it('should return correct start and end range for a given month YYYY-MM', () => {
        const range = getCairoMonthRange('2026-10');
        expect(range.startDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
        expect(range.endDate.toISOString()).toBe('2026-10-31T23:59:59.999Z');
        expect(range.daysInMonth).toBe(31);
        expect(range.year).toBe(2026);
        expect(range.month).toBe(9);
      });

      it('should handle February in non-leap year (28 days)', () => {
        const range = getCairoMonthRange('2026-02');
        expect(range.startDate.toISOString()).toBe('2026-02-01T00:00:00.000Z');
        expect(range.endDate.toISOString()).toBe('2026-02-28T23:59:59.999Z');
        expect(range.daysInMonth).toBe(28);
      });
    });
  });
});
