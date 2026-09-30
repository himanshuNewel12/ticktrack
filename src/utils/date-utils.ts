import { addDays, format, isSameDay } from "date-fns";

/**
 * Safely parses a date string into a local Date object without UTC timezone offset shifts.
 * Strings like "2026-09-29" are parsed into local midnight Date (year, month - 1, day).
 */
export function parseTaskDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (str.includes("T")) {
    return new Date(str);
  }
  const parts = str.slice(0, 10).split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d);
    }
  }
  return new Date(str);
}

/**
 * Formats task due date and time for user display across task rows and cards.
 * Example outputs: "Today 3:30 PM", "Tomorrow 9:00 AM", "Sep 28 6:00 PM", "Oct 12"
 */
export function formatTaskDueDateDisplay(dueStr: string | null | undefined): string | null {
  if (!dueStr) return null;
  const str = String(dueStr).trim();
  if (!str) return null;
  try {
    const parsed = parseTaskDate(str);
    if (!parsed) return str.slice(0, 10);
    const today = new Date();
    const tomorrow = addDays(today, 1);

    let base = format(parsed, "MMM d");
    if (isSameDay(parsed, today)) base = "Today";
    else if (isSameDay(parsed, tomorrow)) base = "Tomorrow";

    if (str.includes("T")) {
      const h = parsed.getHours();
      const min = parsed.getMinutes();
      if (h !== 0 || min !== 0) {
        const ampm = h >= 12 ? "PM" : "AM";
        const displayH = h % 12 === 0 ? 12 : h % 12;
        const displayM = String(min).padStart(2, "0");
        return `${base} ${displayH}:${displayM} ${ampm}`;
      }
    }
    return base;
  } catch {
    return str.slice(0, 10);
  }
}

/**
 * Returns timestamp for sorting tasks in descending order (newest/latest first).
 */
export function getTaskTimestamp(task: { created_at?: string | null; due_date?: string | null; id?: string }): number {
  if (task.created_at) {
    const t = new Date(task.created_at).getTime();
    if (!isNaN(t)) return t;
  }
  if (task.due_date) {
    const parsed = parseTaskDate(task.due_date);
    if (parsed) return parsed.getTime();
  }
  return 0;
}

/**
 * Returns timestamp for sorting upcoming active tasks in ascending chronological sequence (earliest due task first).
 * Dated tasks come first in chronological order; undated tasks follow after dated tasks.
 */
export function getUpcomingTaskTimestamp(task: { created_at?: string | null; due_date?: string | null; id?: string }): number {
  if (task.due_date) {
    const parsed = parseTaskDate(task.due_date);
    if (parsed) {
      if (String(task.due_date).includes("T")) {
        return parsed.getTime();
      }
      const endOfDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999);
      return endOfDay.getTime();
    }
  }
  return Number.MAX_SAFE_INTEGER;
}
