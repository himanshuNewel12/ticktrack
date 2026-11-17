import { RecurrenceFrequency } from '@prisma/client';
import dayjs from 'dayjs';
import {
  expandOccurrences,
  normaliseWeekdays,
  dateKey,
  RecurrenceRule,
} from './recurrence.util';

describe('recurrence.util', () => {
  describe('normaliseWeekdays', () => {
    it('handles null, undefined, and empty arrays', () => {
      expect(normaliseWeekdays(null)).toEqual([]);
      expect(normaliseWeekdays(undefined)).toEqual([]);
      expect(normaliseWeekdays([])).toEqual([]);
    });

    it('deduplicates, sorts, and filters out invalid numbers', () => {
      expect(normaliseWeekdays([5, 1, 3, 1, 5, 7, -1, 2.5])).toEqual([1, 3, 5]);
    });
  });

  describe('dateKey', () => {
    it('formats dayjs to YYYY-MM-DD', () => {
      expect(dateKey(dayjs('2026-10-27 10:00:00'))).toBe('2026-10-27');
    });
  });

  describe('expandOccurrences', () => {
    const baseRule: RecurrenceRule = {
      frequency: RecurrenceFrequency.DAILY,
      interval: 1,
      byWeekday: [],
      byMonthDay: null,
      seriesStartAt: dayjs('2026-10-01 09:00:00').toDate(),
      durationMin: 60,
      allDay: false,
      seriesEndDate: null,
      maxOccurrences: null,
    };

    it('generates daily occurrences within the until date', () => {
      const occurrences = expandOccurrences(baseRule, {
        until: dayjs('2026-10-05').endOf('day').toDate(),
      });

      expect(occurrences).toHaveLength(5);
      expect(occurrences.map((o) => dayjs(o.occurrenceDate).format('YYYY-MM-DD'))).toEqual([
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
      ]);
      expect(occurrences[0].startAt).toEqual(dayjs('2026-10-01 09:00:00').toDate());
      expect(occurrences[0].endAt).toEqual(dayjs('2026-10-01 10:00:00').toDate());
    });

    it('respects daily interval (e.g. every 2 days)', () => {
      const rule: RecurrenceRule = { ...baseRule, interval: 2 };
      const occurrences = expandOccurrences(rule, {
        until: dayjs('2026-10-07').endOf('day').toDate(),
      });

      expect(occurrences.map((o) => dayjs(o.occurrenceDate).format('YYYY-MM-DD'))).toEqual([
        '2026-10-01',
        '2026-10-03',
        '2026-10-05',
        '2026-10-07',
      ]);
    });

    it('generates weekly occurrences on specified weekdays, skipping days before seriesStartAt', () => {
      // 2026-10-07 is Wednesday (day 3).
      // Weekdays: Monday (1), Wednesday (3), Friday (5).
      const rule: RecurrenceRule = {
        ...baseRule,
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 1,
        byWeekday: [1, 3, 5],
        seriesStartAt: dayjs('2026-10-07 09:00:00').toDate(),
      };

      const occurrences = expandOccurrences(rule, {
        until: dayjs('2026-10-18').endOf('day').toDate(),
      });

      // Week 1 should only have Wed (07) and Fri (09), not Mon (05) which precedes seriesStartAt.
      // Week 2: Mon (12), Wed (14), Fri (16).
      expect(occurrences.map((o) => dayjs(o.occurrenceDate).format('YYYY-MM-DD'))).toEqual([
        '2026-10-07',
        '2026-10-09',
        '2026-10-12',
        '2026-10-14',
        '2026-10-16',
      ]);
    });

    it('monthly frequency clamps day 31 to month-end for shorter months', () => {
      // Start Jan 31, 2026
      const rule: RecurrenceRule = {
        ...baseRule,
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        byMonthDay: 31,
        seriesStartAt: dayjs('2026-01-31 09:00:00').toDate(),
      };

      const occurrences = expandOccurrences(rule, {
        until: dayjs('2026-04-30').endOf('day').toDate(),
      });

      // Jan 31 -> Feb 28 (non-leap year) -> Mar 31 -> Apr 30
      expect(occurrences.map((o) => dayjs(o.occurrenceDate).format('YYYY-MM-DD'))).toEqual([
        '2026-01-31',
        '2026-02-28',
        '2026-03-31',
        '2026-04-30',
      ]);
    });

    it('monthly frequency supports multiple byMonthDays', () => {
      const rule: RecurrenceRule = {
        ...baseRule,
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        byMonthDay: null,
        byMonthDays: [1, 15],
        seriesStartAt: dayjs('2026-10-01 09:00:00').toDate(),
      };

      const occurrences = expandOccurrences(rule, {
        until: dayjs('2026-11-30').endOf('day').toDate(),
      });

      expect(occurrences.map((o) => dayjs(o.occurrenceDate).format('YYYY-MM-DD'))).toEqual([
        '2026-10-01',
        '2026-10-15',
        '2026-11-01',
        '2026-11-15',
      ]);
    });

    it('skips weekends and public holidays when skipNonWorkingDays is true', () => {
      // 2026-10-01 is Thursday
      // 2026-10-02 is Friday (mocked as public holiday)
      // 2026-10-03 is Saturday (weekend)
      // 2026-10-04 is Sunday (weekend)
      // 2026-10-05 is Monday
      const rule: RecurrenceRule = {
        ...baseRule,
        skipNonWorkingDays: true,
        seriesStartAt: dayjs('2026-10-01 09:00:00').toDate(),
      };

      const holidays = new Set(['2026-10-02']);

      const occurrences = expandOccurrences(rule, {
        until: dayjs('2026-10-06').endOf('day').toDate(),
        holidayDates: holidays,
      });

      expect(occurrences.map((o) => dayjs(o.occurrenceDate).format('YYYY-MM-DD'))).toEqual([
        '2026-10-01',
        '2026-10-05',
        '2026-10-06',
      ]);
    });

    it('enforces seriesEndDate cutoff', () => {
      const rule: RecurrenceRule = {
        ...baseRule,
        seriesEndDate: dayjs('2026-10-03 18:00:00').toDate(),
      };

      const occurrences = expandOccurrences(rule, {
        until: dayjs('2026-10-10').endOf('day').toDate(),
      });

      expect(occurrences.map((o) => dayjs(o.occurrenceDate).format('YYYY-MM-DD'))).toEqual([
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
      ]);
    });

    it('enforces maxOccurrences and accounts for alreadyGenerated', () => {
      const rule: RecurrenceRule = {
        ...baseRule,
        maxOccurrences: 5,
      };

      // Pass 1: generate first 3
      const pass1 = expandOccurrences(rule, {
        until: dayjs('2026-10-03').endOf('day').toDate(),
      });
      expect(pass1).toHaveLength(3);

      // Pass 2: continue from watermark after 2026-10-03 with alreadyGenerated = 3
      const pass2 = expandOccurrences(rule, {
        until: dayjs('2026-10-10').endOf('day').toDate(),
        after: dayjs('2026-10-03').startOf('day').toDate(),
        alreadyGenerated: 3,
      });

      // Max is 5, already generated 3, so only 2 should be returned
      expect(pass2).toHaveLength(2);
      expect(pass2.map((o) => dayjs(o.occurrenceDate).format('YYYY-MM-DD'))).toEqual([
        '2026-10-04',
        '2026-10-05',
      ]);

      // Pass 3: already reached 5
      const pass3 = expandOccurrences(rule, {
        until: dayjs('2026-10-20').endOf('day').toDate(),
        after: dayjs('2026-10-05').startOf('day').toDate(),
        alreadyGenerated: 5,
      });
      expect(pass3).toEqual([]);
    });

    it('supports allDay activities setting start of day to end of day', () => {
      const rule: RecurrenceRule = {
        ...baseRule,
        allDay: true,
      };

      const occurrences = expandOccurrences(rule, {
        until: dayjs('2026-10-01').endOf('day').toDate(),
      });

      expect(occurrences).toHaveLength(1);
      const occ = occurrences[0];
      expect(dayjs(occ.startAt).format('HH:mm:ss')).toBe('00:00:00');
      expect(dayjs(occ.endAt).format('HH:mm:ss')).toBe('23:59:59');
    });
  });
});
