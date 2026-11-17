import dayjs, { Dayjs } from 'dayjs';
import { RecurrenceFrequency } from '@prisma/client';

/**
 * Pure expansion of a recurrence rule into concrete windows. Deliberately holds
 * no Prisma or Nest dependency — this is the only genuinely fiddly logic in the
 * feature (month-end clamping, weekday anchoring, end conditions) and it is far
 * easier to reason about and test in isolation.
 */

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** Every N days / weeks / months. Values below 1 are treated as 1. */
  interval: number;
  /** WEEKLY only — 0=Sun … 6=Sat. Empty falls back to the series start's weekday. */
  byWeekday: number[];
  /** MONTHLY only — 1–31. Null falls back to the series start's day of month. */
  byMonthDay: number | null;
  /** MONTHLY only — multiple days (1–31). If specified, candidate dates are generated for all specified days. */
  byMonthDays?: number[];
  /** Template window start; its time-of-day is copied onto every occurrence. */
  seriesStartAt: Date;
  durationMin: number;
  allDay: boolean;
  /** Inclusive last date an occurrence may fall on. Null = no date cutoff. */
  seriesEndDate: Date | null;
  /** Total occurrences the series may ever produce. Null = no count cutoff. */
  maxOccurrences: number | null;
  /**
   * Drop candidates that land on a Saturday, Sunday or public holiday. Skipped
   * days are removed outright rather than shifted to the next working day, and
   * never count against `maxOccurrences` — ten weekday occurrences means ten.
   */
  skipNonWorkingDays?: boolean;
}

export interface ExpandedOccurrence {
  /** Date-only anchor — the per-series idempotency key. */
  occurrenceDate: Date;
  startAt: Date;
  endAt: Date;
}

export interface ExpandOptions {
  /** Generate occurrences falling on or before this instant. */
  until: Date;
  /**
   * Horizon watermark. Occurrences on or before this date already exist and are
   * skipped without counting against `maxOccurrences` — they are already
   * reflected in `alreadyGenerated`.
   */
  after?: Date | null;
  /** How many occurrences the series has already produced. */
  alreadyGenerated?: number;
  /**
   * `yyyy-MM-dd` keys of public holidays covering the expansion window. Only
   * consulted when the rule sets `skipNonWorkingDays`; the caller loads them
   * because this module stays free of Prisma.
   */
  holidayDates?: Set<string>;
}

/** Local-time `yyyy-MM-dd` key — the format holiday lookups are keyed on. */
export function dateKey(day: Dayjs): string {
  return day.format('YYYY-MM-DD');
}

/**
 * Bounds the candidate walk so a pathological rule can never spin forever. At
 * the widest this is ~5 years of daily occurrences, far beyond any horizon the
 * generator asks for in one pass.
 */
const MAX_STEPS = 2000;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Normalises a weekday list to unique, in-range, chronologically sorted values. */
export function normaliseWeekdays(input: number[] | null | undefined): number[] {
  return Array.from(new Set(input ?? []))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
}

/**
 * Candidate dates for step `n` of the rule, in chronological order. A step is
 * one interval unit, so WEEKLY may yield several dates per step and the other
 * frequencies exactly one.
 */
function candidatesForStep(rule: RecurrenceRule, seriesStart: Dayjs, step: number): Dayjs[] {
  const interval = Math.max(1, rule.interval || 1);
  const startDay = seriesStart.startOf('day');

  if (rule.frequency === RecurrenceFrequency.DAILY) {
    return [startDay.add(step * interval, 'day')];
  }

  if (rule.frequency === RecurrenceFrequency.WEEKLY) {
    const weekdays = normaliseWeekdays(rule.byWeekday);
    const days = weekdays.length > 0 ? weekdays : [startDay.day()];
    // Anchored on the series start's week (dayjs weeks start on Sunday, matching
    // the 0=Sun encoding), so "every 2 weeks" counts calendar weeks rather than
    // drifting off whichever weekday happened to come first.
    const weekStart = startDay.startOf('week').add(step * interval, 'week');
    return days.map((day) => weekStart.add(day, 'day'));
  }

  // MONTHLY — clamp to the last day of short months so a "31st" rule still fires
  // in February rather than silently rolling into the next month.
  const monthStart = startDay.startOf('month').add(step * interval, 'month');
  const daysInMonth = monthStart.daysInMonth();
  const rawDays = (rule.byMonthDays && rule.byMonthDays.length > 0)
    ? rule.byMonthDays
    : [rule.byMonthDay ?? startDay.date()];
  const sortedDays = Array.from(new Set(rawDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))).sort((a, b) => a - b);
  const daysToUse = sortedDays.length > 0 ? sortedDays : [startDay.date()];

  return Array.from(new Set(daysToUse.map((d) => Math.min(d, daysInMonth))))
    .sort((a, b) => a - b)
    .map((d) => monthStart.date(d));
}

/** Applies the template's time-of-day and duration to a candidate date. */
function windowFor(day: Dayjs, rule: RecurrenceRule, seriesStart: Dayjs) {
  if (rule.allDay) {
    return { startAt: day.startOf('day').toDate(), endAt: day.endOf('day').toDate() };
  }

  const startAt = day
    .hour(seriesStart.hour())
    .minute(seriesStart.minute())
    .second(0)
    .millisecond(0);

  return { startAt: startAt.toDate(), endAt: startAt.add(rule.durationMin, 'minute').toDate() };
}

/**
 * Expands the rule into the occurrences that fall in `(after, until]`.
 *
 * Occurrences are always produced contiguously from the series start, which is
 * what lets `alreadyGenerated` stand in for "everything before the watermark"
 * when enforcing `maxOccurrences`.
 */
export function expandOccurrences(
  rule: RecurrenceRule,
  { until, after = null, alreadyGenerated = 0, holidayDates }: ExpandOptions,
): ExpandedOccurrence[] {
  const remaining = rule.maxOccurrences ? rule.maxOccurrences - alreadyGenerated : Infinity;
  if (remaining <= 0) return [];

  const seriesStart = dayjs(rule.seriesStartAt);
  if (!seriesStart.isValid()) return [];

  const startDay = seriesStart.startOf('day');
  const untilDay = dayjs(until).endOf('day');
  const endDay = rule.seriesEndDate ? dayjs(rule.seriesEndDate).endOf('day') : null;
  const afterDay = after ? dayjs(after).startOf('day') : null;

  const out: ExpandedOccurrence[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const candidates = candidatesForStep(rule, seriesStart, step);

    // Every candidate in a step shares a step anchor, so once the earliest one
    // is past the horizon no later step can come back inside it.
    if (candidates.length > 0 && candidates[0].startOf('day').isAfter(untilDay)) break;

    let exhausted = false;

    for (const candidate of candidates) {
      const day = candidate.startOf('day');

      // WEEKLY emits a whole week at a time, so the first week can contain days
      // that precede the series start.
      if (day.isBefore(startDay)) continue;
      if (endDay && day.isAfter(endDay)) {
        exhausted = true;
        break;
      }
      if (day.isAfter(untilDay)) break;
      if (afterDay && !day.isAfter(afterDay)) continue;

      // Checked before the push so a skipped day is a non-event: it consumes no
      // slot of maxOccurrences and leaves no cancelled row behind.
      if (rule.skipNonWorkingDays) {
        const weekday = day.day();
        if (weekday === 0 || weekday === 6) continue;
        if (holidayDates?.has(dateKey(day))) continue;
      }

      out.push({ occurrenceDate: day.toDate(), ...windowFor(candidate, rule, seriesStart) });

      if (out.length >= remaining) {
        exhausted = true;
        break;
      }
    }

    if (exhausted) break;
  }

  return out;
}

/**
 * True once the rule can never produce another occurrence, so the caller can
 * retire the series instead of rescanning it in the nightly cron forever.
 *
 * Judged against the horizon actually generated rather than today's date: a
 * series whose end date has been fully covered is finished even though that date
 * is still in the future.
 */
export function isFullyGenerated(
  rule: RecurrenceRule,
  generatedUntil: Date,
  generatedCount: number,
): boolean {
  if (rule.maxOccurrences && generatedCount >= rule.maxOccurrences) return true;
  if (
    rule.seriesEndDate &&
    !dayjs(generatedUntil).isBefore(dayjs(rule.seriesEndDate).endOf('day'))
  ) {
    return true;
  }
  return false;
}

/** Plain-language summary of the rule — shown verbatim in the series list. */
export function describeRecurrence(rule: RecurrenceRule): string {
  const interval = Math.max(1, rule.interval || 1);
  const seriesStart = dayjs(rule.seriesStartAt);
  let text: string;

  if (rule.frequency === RecurrenceFrequency.DAILY) {
    text = interval === 1 ? 'Every day' : `Every ${interval} days`;
  } else if (rule.frequency === RecurrenceFrequency.WEEKLY) {
    const weekdays = normaliseWeekdays(rule.byWeekday);
    const days = (weekdays.length > 0 ? weekdays : [seriesStart.day()])
      .map((day) => WEEKDAY_LABELS[day])
      .join(', ');
    text = `${interval === 1 ? 'Every week' : `Every ${interval} weeks`} on ${days}`;
  } else {
    const rawDays = (rule.byMonthDays && rule.byMonthDays.length > 0)
      ? rule.byMonthDays
      : [rule.byMonthDay ?? seriesStart.date()];
    const sortedDays = Array.from(new Set(rawDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))).sort((a, b) => a - b);
    const daysStr = sortedDays.length > 0 ? sortedDays.map((d) => `day ${d}`).join(', ') : `day ${seriesStart.date()}`;
    text = `${interval === 1 ? 'Every month' : `Every ${interval} months`} on ${daysStr}`;
  }

  if (!rule.allDay) text += `, ${seriesStart.format('hh:mm A')}`;
  if (rule.seriesEndDate) text += ` until ${dayjs(rule.seriesEndDate).format('DD MMM YYYY')}`;
  else if (rule.maxOccurrences) text += ` for ${rule.maxOccurrences} occurrences`;
  if (rule.skipNonWorkingDays) text += ' (skips weekends & holidays)';

  return text;
}
