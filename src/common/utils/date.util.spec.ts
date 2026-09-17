import {
  getFirstDayOfMonth,
  getFirstDayOfNextMonth,
  getLastDayOfMonth,
  addMonths,
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
});
