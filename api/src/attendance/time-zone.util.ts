import { BadRequestException } from '@nestjs/common';

export const DEFAULT_TIME_ZONE = 'UTC';

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function resolveTimeZone(timeZone?: string | null) {
  const resolved = timeZone?.trim() || DEFAULT_TIME_ZONE;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: resolved }).format(new Date());
    return resolved;
  } catch {
    throw new BadRequestException('Invalid time zone');
  }
}

export function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const values: Record<string, string> = {};
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedDateParts(date, timeZone);
  const utcTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return utcTime - date.getTime();
}

export function getUtcForZonedLocalDateTime(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  const firstPass = new Date(utcGuess.getTime() - getTimeZoneOffsetMs(utcGuess, timeZone));
  return new Date(utcGuess.getTime() - getTimeZoneOffsetMs(firstPass, timeZone));
}

export function getZonedDayRange(date: Date, timeZone: string) {
  const parts = getZonedDateParts(date, timeZone);

  return {
    start: getUtcForZonedLocalDateTime(timeZone, parts.year, parts.month, parts.day),
    end: getUtcForZonedLocalDateTime(timeZone, parts.year, parts.month, parts.day + 1),
  };
}

function getDateOnlyParts(dateString: string, timeZone: string) {
  // True date-only string (no time component) — unambiguous calendar date.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString.trim());

  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  // Full timestamp — resolve the calendar date in the user's time zone, NOT the
  // UTC date (which is the previous day for positive-offset zones like IST).
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid date');
  }

  const parts = getZonedDateParts(date, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

export function getZonedDateOnlyRange(dateString: string, timeZone: string) {
  const parts = getDateOnlyParts(dateString, timeZone);

  return {
    start: getUtcForZonedLocalDateTime(timeZone, parts.year, parts.month, parts.day),
    end: getUtcForZonedLocalDateTime(timeZone, parts.year, parts.month, parts.day + 1),
  };
}

export function buildZonedDateFilter(
  startDate: string | undefined,
  endDate: string | undefined,
  timeZone: string,
) {
  const filter: { gte?: Date; lt?: Date } = {};

  if (startDate) {
    filter.gte = getZonedDateOnlyRange(startDate, timeZone).start;
  }

  if (endDate) {
    filter.lt = getZonedDateOnlyRange(endDate, timeZone).end;
  }

  return Object.keys(filter).length ? filter : undefined;
}

export function parseDateTimeInTimeZone(value: string, timeZone: string) {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date time');
    return date;
  }

  const [datePart, timePart = '00:00'] = value.split('T');
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timePart);

  if (!dateMatch || !timeMatch) {
    throw new BadRequestException('Invalid date time');
  }

  return getUtcForZonedLocalDateTime(
    timeZone,
    Number(dateMatch[1]),
    Number(dateMatch[2]),
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3] ?? 0),
  );
}
