import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";

import { ApiError, api, postJson, setOnUnauthorized, uploadFiles, uploadVoiceNote } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { setCrashUser } from "@/src/utils/crash-reporter";
import { getTaskTimestamp } from "@/src/utils/date-utils";
import {
  requestNotificationPermissions,
  scheduleTaskNotification,
  cancelTaskNotification,
  syncAllTaskNotifications,
  cancelAllTaskNotifications,
  registerForPushNotificationsAsync,
  snoozeTaskNotification,
  ACTION_COMPLETE_TASK,
  ACTION_SNOOZE_TASK,
  Notifications,
} from "@/src/utils/notification-service";
import type { Attendance, AppNotification, AssignableUser, CatalogHabit, Habit, Reminder, LocalAttachment, Task, TaskAction, TaskAttachment, TaskList, UpdateTaskPayload, User, VoiceNote } from "@/src/types";

export type OfflineTaskQueueItem = {
  tempId: string;
  isRecurring: boolean;
  endpoint: string;
  body: Record<string, unknown>;
  createdAt: number;
};

const STORAGE_CACHED_TASKS = "ticktrack_cached_tasks";
const MAX_CACHED_TASKS = 200;
let cacheTasksTimer: ReturnType<typeof setTimeout> | null = null;

/** Offline cache: debounced, open tasks first, capped, with trimmed history so one storage value stays small. */
function cacheTasks(list: Task[]) {
  if (cacheTasksTimer) clearTimeout(cacheTasksTimer);
  cacheTasksTimer = setTimeout(() => {
    const slim = [...list.filter((t) => !t.completed), ...list.filter((t) => t.completed)]
      .slice(0, MAX_CACHED_TASKS)
      .map((t) => (t.actions && t.actions.length > 5 ? { ...t, actions: t.actions.slice(0, 5) } : t));
    void storage.setItem(STORAGE_CACHED_TASKS, JSON.stringify(slim));
  }, 500);
}

/** Cached tasks saved before "watchers" was renamed to "informers". */
function migrateCachedTask(task: any): Task {
  if (task && task.watchers !== undefined && task.informers === undefined) {
    const { watchers, ...rest } = task;
    return { ...rest, informers: watchers };
  }
  return task;
}

/** Offline-queued request bodies saved before "watcherIds" was renamed to "informerIds". */
function migrateQueuedBody(body: Record<string, unknown>): Record<string, unknown> {
  if (body && "watcherIds" in body && !("informerIds" in body)) {
    const { watcherIds, ...rest } = body;
    return { ...rest, informerIds: watcherIds };
  }
  return body;
}
const STORAGE_OFFLINE_QUEUE = "ticktrack_offline_task_queue";
const STORAGE_CACHED_LISTS = "ticktrack_cached_lists";
const STORAGE_CACHED_HABITS = "ticktrack_cached_habits";
const STORAGE_CACHED_ASSIGNABLES = "ticktrack_cached_assignables";

type AppContextValue = {
  token: string | null;
  user: User | null;
  tasks: Task[];
  habits: Habit[];
  catalog: CatalogHabit[];
  reminders: Reminder[];
  lists: TaskList[];
  assignableUsers: AssignableUser[];
  notifications: AppNotification[];
  unreadNotificationCount: number;
  /** Tasks genuinely waiting in the offline queue (not just optimistic in-flight ones). */
  offlineQueueCount: number;
  loading: boolean;
  onboarded: boolean;
  error: string | null;
  signIn: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  markOnboarded: () => Promise<void>;
  addTask: (payload: Record<string, unknown>) => Promise<void>;
  editTask: (task: Task, payload: UpdateTaskPayload) => Promise<void>;
  toggleTask: (task: Task, remarks?: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  postponeTask: (task: Task, payload: { endDate: string; startDate?: string; startTime?: string; endTime?: string; remarks?: string; voice?: VoiceNote }) => Promise<void>;
  addRemark: (task: Task, remarks: string, voice?: VoiceNote, files?: LocalAttachment[]) => Promise<void>;
  loadTaskDetail: (task: Task) => Promise<void>;
  /** Tasks I am kept informed about and tasks I may escalate — kept out of the main task list. */
  loadFollowing: () => Promise<{ informed: Task[]; escalations: Task[] }>;
  /** Only the tasks I may escalate; feeds the Escalations section of Today / Next 7 Days. */
  loadEscalations: () => Promise<Task[]>;
  escalateTask: (task: Task, remarks?: string) => Promise<void>;
  dismissReminder: (task: Task, reminderKey: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  addHabit: (habit: CatalogHabit | { name: string; category: string }) => Promise<void>;
  toggleHabit: (habit: Habit) => Promise<void>;
  addList: (payload: { name: string; emoji?: string; color?: string }) => Promise<TaskList>;
  deleteList: (listId: string) => Promise<void>;
  reorderLists: (orderedListIds: string[]) => Promise<void>;
  updateUser: (updated: Partial<User>) => void;
  refresh: () => Promise<void>;
  todayAttendance: Attendance | null | undefined;
  attendanceLoading: boolean;
  fetchAttendance: () => Promise<Attendance | null>;
  checkIn: (data?: { remarks?: string; isWfh?: boolean }) => Promise<Attendance>;
  checkOut: (data?: { remarks?: string }) => Promise<Attendance>;
};

const Context = createContext<AppContextValue | null>(null);

export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}



function toIsoTimestamp(dueStr: string): string {
  if (dueStr.includes("T")) {
    const d = new Date(dueStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  return dueStr;
}

function toLocalDateString(isoOrDateStr: string | null | undefined): string | null {
  if (!isoOrDateStr) return null;
  const str = String(isoOrDateStr).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return str.slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const datePart = `${year}-${month}-${day}`;

  if (str.includes("T")) {
    const localHours = d.getHours();
    const localMinutes = d.getMinutes();
    // Only embed time if not exactly midnight local (00:00) — date-only tasks have no meaningful time
    if (localHours !== 0 || localMinutes !== 0) {
      const hours = String(localHours).padStart(2, "0");
      const minutes = String(localMinutes).padStart(2, "0");
      return `${datePart}T${hours}:${minutes}`;
    }
  }

  return datePart;
}

export function toIsoDateTime(date: string, time?: string, endOfDayIfNoTime = false): string | null {
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;

  let hours = endOfDayIfNoTime ? 23 : 0;
  let minutes = endOfDayIfNoTime ? 59 : 0;

  if (time) {
    const [h, m] = time.split(":").map(Number);
    if (Number.isFinite(h)) hours = h;
    if (Number.isFinite(m)) minutes = m;
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

function normalizeTask(raw: any): Task {
  const rawDate = raw.endDate ?? raw.startDate ?? raw.plannedEnd ?? raw.plannedStart ?? raw.due_date;
  const due_date = toLocalDateString(rawDate);

  const rawAssigneesList: string[] = [];
  const normalizedAssignees: { id: string; name: string; email?: string }[] = [];

  if (Array.isArray(raw.taskAssignees) && raw.taskAssignees.length > 0) {
    raw.taskAssignees.forEach((ta: any) => {
      const u = ta.user ?? ta;
      const uid = u.id ?? u.userId ?? ta.userId;
      if (uid) {
        const idStr = String(uid);
        rawAssigneesList.push(idStr);
        const name = (u.name ?? `${u.firstName ?? ""} ${u.lastName ?? ""}`).trim() || u.email || "Unknown";
        normalizedAssignees.push({ id: idStr, name, email: u.email });
      }
    });
  } else if (raw.assignee) {
    const u = raw.assignee;
    const idStr = String(u.id);
    rawAssigneesList.push(idStr);
    const name = (u.name ?? `${u.firstName ?? ""} ${u.lastName ?? ""}`).trim() || u.email || "Unknown";
    normalizedAssignees.push({ id: idStr, name, email: u.email });
  }

  if (raw.assigneeId) rawAssigneesList.push(String(raw.assigneeId));
  if (Array.isArray(raw.assigneeIds)) {
    raw.assigneeIds.forEach((id: any) => {
      if (id) rawAssigneesList.push(String(id));
    });
  }
  const uniqueAssigneeIds = Array.from(new Set(rawAssigneesList));

  const allAssigneeNames = normalizedAssignees.map((a) => a.name).filter(Boolean);
  const assigneeName =
    allAssigneeNames.length > 0
      ? allAssigneeNames.join(", ")
      : raw.assignee
      ? (raw.assignee.name ?? `${raw.assignee.firstName ?? ""} ${raw.assignee.lastName ?? ""}`).trim()
      : raw.assigneeName ?? null;

  const creatorUser = raw.createdBy ?? null;
  const creatorName = creatorUser
    ? (creatorUser.name ?? `${creatorUser.firstName ?? ""} ${creatorUser.lastName ?? ""}`).trim() || creatorUser.email
    : raw.createdByName ?? null;

  const rawAuditLogs = Array.isArray(raw.auditLogs) ? raw.auditLogs : [];
  const auditActions: TaskAction[] = rawAuditLogs.map((al: any) => ({
    id: al.id,
    type: al.action,
    remarks: al.reason ?? null,
    before: al.before,
    after: al.after,
    createdAt: al.createdAt,
    actor: al.user ?? null,
    actorName: al.user
      ? `${al.user.firstName ?? ""} ${al.user.lastName ?? ""}`.trim() || al.user.email
      : null,
  }));

  return {
    ...raw,
    id: raw.id,
    title: raw.title,
    notes: raw.description ?? raw.notes ?? "",
    due_date,
    startAt: raw.startDate ?? raw.plannedStart ?? null,
    endAt: raw.endDate ?? raw.plannedEnd ?? null,
    window: raw.window ?? null,
    postponeCount: raw.postponeCount ?? 0,
    priority: (raw.priority ?? "MEDIUM").toLowerCase() as any,
    completed: raw.completed === true || String(raw.status || "").toUpperCase() === "COMPLETED" || raw.progressPct === 100,
    status: raw.status ?? (raw.completed ? "COMPLETED" : "WIP"),
    completedAt: raw.completedAt ? String(raw.completedAt) : ((raw.completed === true || String(raw.status || "").toUpperCase() === "COMPLETED" || raw.progressPct === 100) && raw.updatedAt ? String(raw.updatedAt) : null),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
    list_id: raw.projectId ?? raw.list_id ?? "inbox",
    projectId: raw.projectId ?? raw.list_id ?? null,
    assigneeId: raw.assigneeId ?? raw.assignee?.id ?? (uniqueAssigneeIds[0] || null),
    assigneeIds: uniqueAssigneeIds,
    assignees: normalizedAssignees.length > 0 ? normalizedAssignees : null,
    assigneeName: assigneeName || null,
    source: "task",
    createdById: raw.createdById ?? creatorUser?.id ?? null,
    createdBy: creatorUser,
    createdByName: creatorName,
    actions: auditActions,
    auditLogs: rawAuditLogs,
  };
}

function normalizeActivity(act: any): Task {
  const isCompleted = act.completed === true || String(act.status || "").toUpperCase() === "COMPLETED";

  const actAssigneesList: string[] = [];
  const normalizedAssignees: { id: string; name: string; email?: string; avatarUrl?: string }[] = [];

  if (Array.isArray(act.assignees)) {
    act.assignees.forEach((a: any) => {
      const u = a.user ?? a;
      const uid = u.id ?? u.userId ?? a.userId;
      if (uid) {
        const idStr = String(uid);
        actAssigneesList.push(idStr);
        const name = (u.name ?? `${u.firstName ?? ""} ${u.lastName ?? ""}`).trim() || u.email || "Unknown";
        normalizedAssignees.push({
          id: idStr,
          name,
          email: u.email,
          avatarUrl: u.avatarUrl,
        });
      }
    });
  }

  if (Array.isArray(act.assigneeIds)) {
    act.assigneeIds.forEach((id: any) => {
      if (id) actAssigneesList.push(String(id));
    });
  }
  const uniqueActAssigneeIds = Array.from(new Set(actAssigneesList));

  const allAssigneeNames = normalizedAssignees.map((a) => a.name).filter(Boolean);
  const assigneeName = allAssigneeNames.length > 0 ? allAssigneeNames.join(", ") : (act.createdByName ?? null);

  const startIso = act.startAt ? String(act.startAt) : null;
  const endIso = act.endAt ? String(act.endAt) : null;
  const dateStr = toLocalDateString(startIso);

  const creatorUser = act.createdBy ?? null;
  const creatorName = creatorUser
    ? (creatorUser.name ?? `${creatorUser.firstName ?? ""} ${creatorUser.lastName ?? ""}`).trim() || creatorUser.email
    : act.createdByName ?? null;

  const actions: TaskAction[] = Array.isArray(act.actions)
    ? act.actions.map((ac: any) => ({
        id: ac.id,
        type: ac.type,
        remarks: ac.remarks ?? null,
        audio: ac.audioFile ? { file: String(ac.audioFile), durationSec: Number(ac.audioSec) || 0 } : null,
        attachments: Array.isArray(ac.attachments) ? (ac.attachments as TaskAttachment[]) : [],
        createdAt: ac.createdAt,
        fromStartAt: ac.fromStartAt ? String(ac.fromStartAt) : null,
        fromEndAt: ac.fromEndAt ? String(ac.fromEndAt) : null,
        toStartAt: ac.toStartAt ? String(ac.toStartAt) : null,
        toEndAt: ac.toEndAt ? String(ac.toEndAt) : null,
        actor: ac.actor ?? null,
        actorName: ac.actor
          ? `${ac.actor.firstName ?? ""} ${ac.actor.lastName ?? ""}`.trim() || ac.actor.email
          : null,
      }))
    : [];

  return {
    id: act.id,
    title: act.name ?? act.title ?? "Untitled",
    notes: act.description ?? act.notes ?? "",
    descriptionAudio: act.descriptionAudioFile
      ? { file: String(act.descriptionAudioFile), durationSec: Number(act.descriptionAudioSec) || 0 }
      : null,
    due_date: dateStr,
    startAt: startIso,
    endAt: endIso,
    window: act.window ?? null,
    postponeCount: act.postponeCount ?? 0,
    priority: "medium",
    completed: isCompleted,
    status: act.status ?? (isCompleted ? "COMPLETED" : "PENDING"),
    completedAt: act.completedAt ? String(act.completedAt) : (isCompleted && act.updatedAt ? String(act.updatedAt) : null),
    updatedAt: act.updatedAt ? String(act.updatedAt) : null,
    list_id: "inbox",
    assigneeId: uniqueActAssigneeIds[0] || null,
    assigneeIds: uniqueActAssigneeIds,
    assignees: normalizedAssignees.length > 0 ? normalizedAssignees : null,
    assigneeName: assigneeName || null,
    informers: Array.isArray(act.informers) ? act.informers.map((w: any) => ({ id: w.userId ?? w.id, name: w.name, email: w.email })) : null,
    escalators: Array.isArray(act.escalators) ? act.escalators.map((e: any) => ({ id: e.userId ?? e.id, name: e.name, email: e.email })) : null,
    isEscalator: Boolean(act.isEscalator),
    source: "activity",
    created_at: act.createdAt ?? new Date().toISOString(),
    createdById: act.createdById ?? creatorUser?.id ?? null,
    createdBy: creatorUser,
    createdByName: creatorName,
    assignedById: act.assignedById ?? null,
    assignedByName: act.assignedByName ?? null,
    actions,
    recurrence: act.recurrence?.frequency
      ? (String(act.recurrence.frequency).toUpperCase() === "WEEKLY" && act.recurrence.interval === 2
          ? "fortnightly"
          : String(act.recurrence.frequency).toLowerCase())
      : (act.recurrenceId ? "repeat" : "none"),
    recurrenceId: act.recurrenceId ?? null,
  };
}

function normalizeRecurringSeries(series: any): Task {
  const actAssigneesList: string[] = [];
  const normalizedAssignees: { id: string; name: string; email?: string; avatarUrl?: string }[] = [];

  if (Array.isArray(series.assignees)) {
    series.assignees.forEach((a: any) => {
      const u = a.user ?? a;
      const uid = u.id ?? u.userId ?? a.userId;
      if (uid) {
        const idStr = String(uid);
        actAssigneesList.push(idStr);
        const name = (u.name ?? `${u.firstName ?? ""} ${u.lastName ?? ""}`).trim() || u.email || "Unknown";
        normalizedAssignees.push({
          id: idStr,
          name,
          email: u.email,
          avatarUrl: u.avatarUrl,
        });
      }
    });
  }

  const uniqueAssigneeIds = Array.from(new Set(actAssigneesList));
  const allAssigneeNames = normalizedAssignees.map((a) => a.name).filter(Boolean);
  const assigneeName = allAssigneeNames.length > 0 ? allAssigneeNames.join(", ") : (series.createdByName ?? null);

  const startIso = series.nextOccurrenceAt ? String(series.nextOccurrenceAt) : (series.seriesStartAt ? String(series.seriesStartAt) : null);
  const endIso = series.seriesEndDate ? String(series.seriesEndDate) : null;
  const dateStr = toLocalDateString(startIso);

  const creatorUser = series.createdBy ?? null;
  const creatorName = creatorUser
    ? (creatorUser.name ?? `${creatorUser.firstName ?? ""} ${creatorUser.lastName ?? ""}`).trim() || creatorUser.email
    : series.createdByName ?? null;

  const isCompleted = series.status === "COMPLETED" || series.status === "CANCELLED";

  return {
    id: `recurrence_${series.id}`,
    title: series.name ?? "Untitled Series",
    notes: (series.summary ? `🔁 ${series.summary}\n\n` : "") + (series.description ?? ""),
    due_date: dateStr,
    startAt: startIso,
    endAt: endIso,
    window: null,
    postponeCount: 0,
    priority: "medium",
    completed: isCompleted,
    status: series.status ?? (isCompleted ? "CANCELLED" : "ACTIVE"),
    completedAt: null,
    updatedAt: series.createdAt ? String(series.createdAt) : null,
    list_id: "inbox",
    assigneeId: uniqueAssigneeIds[0] || null,
    assigneeIds: uniqueAssigneeIds,
    assignees: normalizedAssignees.length > 0 ? normalizedAssignees : null,
    assigneeName: assigneeName || null,
    source: "recurring_series",
    created_at: series.createdAt ?? new Date().toISOString(),
    createdById: series.createdById ?? creatorUser?.id ?? null,
    createdBy: creatorUser,
    createdByName: creatorName,
    actions: [],
    recurrence: series.frequency
      ? (String(series.frequency).toUpperCase() === "WEEKLY" && series.interval === 2
          ? "fortnightly"
          : String(series.frequency).toLowerCase())
      : "repeat",
    recurrenceRule: series.summary || undefined,
    repeatDays: Array.isArray(series.byWeekday) ? series.byWeekday : [],
  };
}

import { initAppTheme } from "./theme";
import { DeleteRepeatModal, type DeleteRepeatChoice } from "./components/delete-repeat-modal";

export function AppProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [catalog, setCatalog] = useState<CatalogHabit[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null | undefined>(undefined);
  const [attendanceLoading, setAttendanceLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against race conditions between background polls and user toggles
  const recentTogglesRef = useRef<Map<string, { completed: boolean; completedAt: string | null; time: number }>>(new Map());
  const isRefreshingRef = useRef<boolean>(false);
  const refreshQueuedRef = useRef<boolean>(false);
  const [deletePrompt, setDeletePrompt] = useState<{ title?: string; resolve: (c: DeleteRepeatChoice | null) => void } | null>(null);
  // Last known repeat rule per series. Occurrences only carry a recurrenceId, so when the series
  // list call fails (or the save response is fresher) this stops the rule reverting on screen.
  const seriesInfoRef = useRef<Map<string, { recurrence: string; recurrenceRule?: string; repeatDays?: number[] }>>(new Map());

  const unreadNotificationCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const markNotificationRead = async (id: string) => {
    if (!token) return;
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    await api(`/user-alerts/${id}/read`, { method: "PATCH" }, token).catch(() => {});
  };

  const markAllNotificationsRead = async () => {
    if (!token) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await api("/user-alerts/mark-all-read", { method: "PATCH" }, token).catch(() => {});
  };

  const isSyncingQueueRef = useRef(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  // Optimistic tasks whose first create request is still running; not stale yet.
  const inFlightTempIdsRef = useRef<Set<string>>(new Set());

  // Optimistic `offline_` tasks that are neither queued nor in flight were already
  // synced or rejected by the server; drop them so they stop reading as "pending".
  const purgeStaleOfflineTasks = (keepIds: Set<string>) => {
    setTasks((current) => {
      const next = current.filter(
        (t) => !t.id.startsWith("offline_") || keepIds.has(t.id) || inFlightTempIdsRef.current.has(t.id)
      );
      if (next.length === current.length) return current;
      cacheTasks(next);
      return next;
    });
  };

  const syncOfflineQueue = useCallback(async (authToken?: string) => {
    const activeToken = authToken || token;
    if (!activeToken) return;
    if (isSyncingQueueRef.current) return;
    isSyncingQueueRef.current = true;

    try {
      const queueRaw = await storage.getItem<any>(STORAGE_OFFLINE_QUEUE, []);
      const queue: OfflineTaskQueueItem[] = Array.isArray(queueRaw)
        ? queueRaw
        : typeof queueRaw === "string"
        ? JSON.parse(queueRaw || "[]")
        : [];

      if (!queue || queue.length === 0) {
        setOfflineQueueCount(0);
        purgeStaleOfflineTasks(new Set());
        isSyncingQueueRef.current = false;
        return;
      }

      console.log(`[TickTrack] Auto-syncing ${queue.length} offline task(s)...`);
      const remaining: OfflineTaskQueueItem[] = [];
      let anySynced = false;

      for (const item of queue) {
        try {
          const res = await postJson<any>(item.endpoint, migrateQueuedBody(item.body), activeToken);
          if (res) {
            anySynced = true;
            console.log(`[TickTrack] Successfully synced offline task: ${item.tempId}`);
            if (!item.isRecurring) {
              const realTask = normalizeActivity(res);
              setTasks((current) => {
                const next = current.map((t) => (t.id === item.tempId ? realTask : t));
                cacheTasks(next);
                return next;
              });
            } else {
              setTasks((current) => {
                const next = current.filter((t) => t.id !== item.tempId);
                cacheTasks(next);
                return next;
              });
            }
          }
        } catch (syncErr: any) {
          const errMsg = String(syncErr?.message || syncErr || "");
          const isNetworkError =
            errMsg.includes("Unable to reach backend") ||
            errMsg.includes("Network") ||
            errMsg.includes("network") ||
            errMsg.includes("timed out") ||
            errMsg.includes("timeout") ||
            errMsg.includes("Failed to fetch") ||
            errMsg.includes("XHR network error");

          if (isNetworkError) {
            remaining.push(item);
            console.log("[TickTrack] Still offline during task sync, keeping in queue");
            break;
          } else {
            console.warn(`[TickTrack] Error syncing task ${item.tempId}:`, errMsg);
          }
        }
      }

      await storage.setItem(STORAGE_OFFLINE_QUEUE, JSON.stringify(remaining));
      setOfflineQueueCount(remaining.length);
      purgeStaleOfflineTasks(new Set(remaining.map((item) => item.tempId)));

      if (anySynced) {
        void refresh();
      }
    } catch (e) {
      console.warn("[TickTrack] Offline queue error:", e);
    } finally {
      isSyncingQueueRef.current = false;
    }
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    if (isRefreshingRef.current) {
      // A refresh that started before this call may hold pre-save data (e.g. the old repeat
      // rule); re-run once it finishes instead of dropping this request.
      refreshQueuedRef.current = true;
      return;
    }
    isRefreshingRef.current = true;
    try {
      setError(null);
      void syncOfflineQueue();

      const in14Days = new Date();
      in14Days.setDate(in14Days.getDate() + 14);
      const in14DaysStr = in14Days.toISOString().slice(0, 10);

      const [
        mineRes,
        nearMineRes,
        assignedRes,
        nearAssignedRes,
        recurringRes,
        nextLists,
        nextAssignables,
        nextAlerts,
        todayAttRes,
        savedDeletedIds,
        savedCompletedDatesRaw,
      ] = await Promise.all([
        api<{ data?: any[] }>("/activities/mine?limit=100", {}, token).catch(() => null),
        api<{ data?: any[] }>(`/activities/mine?to=${in14DaysStr}&limit=150`, {}, token).catch(() => null),
        api<{ data?: any[] }>("/activities/assigned?limit=100", {}, token).catch(() => null),
        api<{ data?: any[] }>(`/activities/assigned?to=${in14DaysStr}&limit=150`, {}, token).catch(() => null),
        api<{ data?: any[] }>("/activities/recurring?limit=100", {}, token).catch(() => null),
        api<TaskList[]>("/lists", {}, token).catch(() => null),
        api<AssignableUser[]>("/users/assignable", {}, token).catch(() => null),
        api<AppNotification[]>("/user-alerts?limit=50&scope=app", {}, token).catch(() => null),
        api<Attendance>(`/attendance/today?timeZone=${encodeURIComponent(getDeviceTimeZone())}`, {}, token).catch(() => null),
        storage.getItem<string>("ticktrack_deleted_task_ids", ""),
        storage.getItem<string>("ticktrack_completed_task_dates", ""),
      ]);

      setTodayAttendance(todayAttRes || null);

      const deletedSet = new Set(
        savedDeletedIds
          ? (typeof savedDeletedIds === "string" ? JSON.parse(savedDeletedIds) : savedDeletedIds)
          : []
      );
      let completedDatesMap: Record<string, string> = {};
      if (savedCompletedDatesRaw) {
        try {
          completedDatesMap = typeof savedCompletedDatesRaw === "string" ? JSON.parse(savedCompletedDatesRaw) : (savedCompletedDatesRaw as any);
        } catch {}
      }
      let completedDatesChanged = false;

      // Only update tasks if we received server response (do not clear offline cache if offline)
      if (mineRes !== null || nearMineRes !== null || assignedRes !== null || nearAssignedRes !== null || recurringRes !== null) {
        const parseList = (res: any) =>
          ((res as any)?.data ?? (Array.isArray(res) ? res : [])).map(normalizeActivity);

        const mineActivities = parseList(mineRes);
        const nearMineActivities = parseList(nearMineRes);
        const assignedActivities = parseList(assignedRes);
        const nearAssignedActivities = parseList(nearAssignedRes);
        const recurringSeries = ((recurringRes as any)?.data ?? (Array.isArray(recurringRes) ? recurringRes : [])).map(normalizeRecurringSeries);

        const seriesById = new Map<string, Task>();
        recurringSeries.forEach((s: Task) => {
          const rawId = s.id.replace("recurrence_", "");
          seriesById.set(rawId, s);
        });

        const allActivities = [...nearMineActivities, ...mineActivities, ...nearAssignedActivities, ...assignedActivities];

        if (recurringRes !== null) {
          seriesById.forEach((s, rawId) => {
            seriesInfoRef.current.set(rawId, { recurrence: s.recurrence ?? "repeat", recurrenceRule: s.recurrenceRule, repeatDays: s.repeatDays });
          });
        }

        // Enrich occurrences with parent series recurrence details
        allActivities.forEach((item) => {
          const info = (item as any).recurrenceId ? seriesInfoRef.current.get((item as any).recurrenceId) : undefined;
          if (__DEV__ && /test/i.test(item.title) ) {
            console.log("[repeat-debug] refresh", { id: item.id, title: item.title, due: item.due_date, recurrenceId: (item as any).recurrenceId ?? null, recurringFetched: recurringRes !== null, seriesInList: (item as any).recurrenceId ? seriesById.has((item as any).recurrenceId) : null, info });
          }
          if (info) {
            item.recurrence = info.recurrence;
            item.recurrenceRule = info.recurrenceRule;
            item.repeatDays = info.repeatDays;
          }
        });

        // A series row is anchored on its next occurrence, which already exists as a
        // real activity — showing both lists the same task twice on that day.
        const occurrenceKeys = new Set(
          allActivities
            .filter((a) => (a as any).recurrenceId)
            .map((a) => `${(a as any).recurrenceId}|${a.due_date}`),
        );
        const visibleSeries = recurringSeries.filter(
          (s: Task) => !occurrenceKeys.has(`${s.id.replace("recurrence_", "")}|${s.due_date}`),
        );

        const now = Date.now();
        const taskMap = new Map<string, Task>();
        [...visibleSeries, ...allActivities].forEach((item) => {
          // Deleting = cancelling server-side, so never show cancelled items, nor
          // occurrences of a series the user deleted.
          const isCancelled = String(item?.status || "").toUpperCase() === "CANCELLED";
          const seriesId = (item as any)?.recurrenceId;
          const seriesDeleted = seriesId ? deletedSet.has(`recurrence_${seriesId}`) : false;
          if (item && item.id && !isCancelled && !seriesDeleted && !deletedSet.has(item.id)) {
            const recentToggle = recentTogglesRef.current.get(item.id);
            if (recentToggle && now - recentToggle.time < 15000) {
              item.completed = recentToggle.completed;
              item.completedAt = recentToggle.completedAt;
              if (item.completed && item.completedAt && !completedDatesMap[item.id]) {
                completedDatesMap[item.id] = item.completedAt;
                completedDatesChanged = true;
              } else if (!item.completed && completedDatesMap[item.id]) {
                delete completedDatesMap[item.id];
                completedDatesChanged = true;
              }
              taskMap.set(item.id, item);
              return;
            }

            if (item.completed) {
              item.completedAt = item.completedAt || completedDatesMap[item.id] || (item.updatedAt ? String(item.updatedAt) : null);
              if (item.completedAt && !completedDatesMap[item.id]) {
                completedDatesMap[item.id] = item.completedAt;
                completedDatesChanged = true;
              }
            } else if (completedDatesMap[item.id]) {
              delete completedDatesMap[item.id];
              completedDatesChanged = true;
            }
            taskMap.set(item.id, item);
          }
        });

        // Retain pending offline tasks that haven't synced yet
        setTasks((currentTasks) => {
          // List responses carry only the latest few actions. Keep any fuller history already
          // loaded via loadTaskDetail instead of truncating it on every refresh.
          currentTasks.forEach((t) => {
            const fresh = taskMap.get(t.id);
            if (!fresh || !t.actions?.length) return;
            const freshActions = fresh.actions ?? [];
            if (t.actions.length <= freshActions.length) return;
            const seen = new Set(freshActions.map((a) => a.id));
            const merged = [...freshActions, ...t.actions.filter((a) => !seen.has(a.id))];
            taskMap.set(t.id, { ...fresh, actions: merged });
          });
          currentTasks.forEach((t) => {
            if (t.id.startsWith("offline_") && !deletedSet.has(t.id) && !taskMap.has(t.id)) {
              const hasMatchingServerTask = Array.from(taskMap.values()).some(
                (existing) => existing.title.trim().toLowerCase() === t.title.trim().toLowerCase()
              );
              if (!hasMatchingServerTask) {
                taskMap.set(t.id, t);
              }
            }
          });
          const allTasks = Array.from(taskMap.values()).sort((a, b) => getTaskTimestamp(b) - getTaskTimestamp(a));
          cacheTasks(allTasks);
          void syncAllTaskNotifications(allTasks);
          return allTasks;
        });
      }

      if (completedDatesChanged) {
        void storage.setItem("ticktrack_completed_task_dates", JSON.stringify(completedDatesMap));
      }

      if (nextAlerts !== null) {
        const appAlerts = (Array.isArray(nextAlerts) ? nextAlerts : []).filter((item) => {
          const t = (item.type || "").toUpperCase();
          const entityType = String(item.metadata?.entityType || "").toUpperCase();
          return (
            t.startsWith("ACTIVITY_") ||
            t.startsWith("TASK_") ||
            entityType === "ACTIVITY" ||
            entityType === "TASK"
          );
        });
        // Read notifications expire 48h after creation.
        const expiryCutoff = Date.now() - 48 * 60 * 60 * 1000;
        setNotifications(
          appAlerts.filter((n) => {
            if (!n.isRead) return true;
            const created = new Date(n.createdAt).getTime();
            return Number.isNaN(created) || created >= expiryCutoff;
          })
        );
      }

      if (nextLists !== null) {
        let resolvedLists = nextLists;
        if (resolvedLists.length === 0) {
          const savedOnboardingLists = await storage.getItem<any>("ticktrack_onboarding_lists", null);
          const listNames: string[] = Array.isArray(savedOnboardingLists)
            ? savedOnboardingLists
            : typeof savedOnboardingLists === "string"
            ? JSON.parse(savedOnboardingLists)
            : [];
          if (listNames.length > 0) {
            const listEmojis: Record<string, string> = {
              Work: "💼",
              Personal: "🏠",
              Shopping: "📦",
              Learning: "📖",
              "Wish List": "🦄",
              Fitness: "🏃",
            };
            const createdListPromises = listNames.map((name) =>
              postJson<TaskList>("/lists", { name, emoji: listEmojis[name] || "📋" }, token).catch(() => null)
            );
            const createdLists = (await Promise.all(createdListPromises)).filter(Boolean) as TaskList[];
            if (createdLists.length > 0) {
              resolvedLists = createdLists;
              await storage.removeItem("ticktrack_onboarding_lists");
            }
          }
        }
        setLists(resolvedLists);
        void storage.setItem(STORAGE_CACHED_LISTS, JSON.stringify(resolvedLists));
      }

      if (nextAssignables !== null) {
        setAssignableUsers(nextAssignables);
        void storage.setItem(STORAGE_CACHED_ASSIGNABLES, JSON.stringify(nextAssignables));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync your workspace");
    } finally {
      isRefreshingRef.current = false;
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void refresh();
      }
    }
  }, [token, syncOfflineQueue]);

  const deleteTask = async (taskId: string) => {
    if (taskId.startsWith("offline_")) {
      const queueRaw = await storage.getItem<any>(STORAGE_OFFLINE_QUEUE, []);
      const queue: OfflineTaskQueueItem[] = Array.isArray(queueRaw)
        ? queueRaw
        : typeof queueRaw === "string"
        ? JSON.parse(queueRaw || "[]")
        : [];
      const updatedQueue = queue.filter((item) => item.tempId !== taskId);
      await storage.setItem(STORAGE_OFFLINE_QUEUE, JSON.stringify(updatedQueue));
      setOfflineQueueCount(updatedQueue.length);

      setTasks((current) => {
        const next = current.filter((item) => item.id !== taskId);
        cacheTasks(next);
        return next;
      });
      void cancelTaskNotification(taskId);
      void refreshReminders();
      return;
    }

    if (!token) return;
    const target = tasks.find((t) => t.id === taskId);

    // An occurrence of a repeating task: ask whether to remove just this day or the whole series.
    const occurrenceSeriesId: string | null =
      target?.source === "activity" ? ((target as any).recurrenceId ?? null) : null;
    let deleteAllRepeats = false;
    if (occurrenceSeriesId) {
      const choice = await new Promise<DeleteRepeatChoice | null>((resolve) => {
        setDeletePrompt({ title: target?.title, resolve });
      });
      setDeletePrompt(null);
      if (!choice) return;
      deleteAllRepeats = choice === "series";
    }

    // Activity / series cancels must succeed before the task is hidden locally; otherwise it
    // silently reappears on the next refresh and the delete looks like it did nothing.
    try {
      if (deleteAllRepeats && occurrenceSeriesId) {
        await api(`/activities/recurring/${occurrenceSeriesId}/cancel`, { method: "PATCH", body: JSON.stringify({ remarks: "Cancelled via mobile app" }) }, token);
      } else if (target?.source === "recurring_series" || taskId.startsWith("recurrence_")) {
        const realId = taskId.replace("recurrence_", "");
        await api(`/activities/recurring/${realId}/cancel`, { method: "PATCH", body: JSON.stringify({ remarks: "Cancelled via mobile app" }) }, token);
      } else if (target?.source === "activity") {
        await api(`/activities/${taskId}/cancel`, { method: "PATCH", body: JSON.stringify({}) }, token);
      }
    } catch (err) {
      console.error("[deleteTask] cancel failed", { taskId, deleteAllRepeats, error: err instanceof Error ? err.message : err });
      Alert.alert("Could not delete", err instanceof Error ? err.message : "Please try again.");
      return;
    }
    if (target?.source !== "recurring_series" && !taskId.startsWith("recurrence_") && target?.source !== "activity") {
      await api(`/tasks/${taskId}`, { method: "DELETE" }, token).catch(() => {});
    }

    const rawSaved = await storage.getItem<any>("ticktrack_deleted_task_ids", []);
    const existing: string[] = Array.isArray(rawSaved) ? rawSaved : typeof rawSaved === "string" ? JSON.parse(rawSaved) : [];
    const deletedSeriesId = target?.source === "recurring_series" || taskId.startsWith("recurrence_")
      ? taskId.replace("recurrence_", "")
      : deleteAllRepeats ? occurrenceSeriesId : null;
    const updatedDeleted = Array.from(
      new Set([...existing, taskId, ...(deletedSeriesId ? [`recurrence_${deletedSeriesId}`] : [])]),
    );
    await storage.setItem("ticktrack_deleted_task_ids", JSON.stringify(updatedDeleted));
    setTasks((current) => {
      const next = current.filter(
        (item) => item.id !== taskId && !(deletedSeriesId && (item as any).recurrenceId === deletedSeriesId),
      );
      cacheTasks(next);
      return next;
    });
    void cancelTaskNotification(taskId);
    void refreshReminders();
  };

  // Concurrent 401s (startup /auth/me, refresh, offline sync) share one login attempt instead of
  // each sending their own.
  const reauthPromiseRef = useRef<Promise<string | null> | null>(null);

  const silentReauth = useCallback((): Promise<string | null> => {
    if (reauthPromiseRef.current) return reauthPromiseRef.current;
    const attempt = (async (): Promise<string | null> => {
      try {
        const rawCreds = await storage.secureGet<string | null>("ticktrack_saved_creds", null);
        if (!rawCreds) return null;
        const creds = typeof rawCreds === "string" ? JSON.parse(rawCreds) : rawCreds;
        if (!creds?.email || !creds?.password) return null;

        const result = await postJson<{ access_token?: string; token?: string; user: User }>("/auth/login", {
          email: String(creds.email).trim(),
          password: String(creds.password),
        });
        const newToken = result.access_token || result.token || (result as any).accessToken;
        if (newToken) {
          await storage.secureSet("ticktrack_token", newToken);
          setToken(newToken);
          if (result.user) {
            setUser((prev) => ({ ...(prev || {}), ...result.user }));
          }
          return newToken;
        }
      } catch (e) {
        console.warn("[TickTrack] Silent reauth failed:", e);
        // The server rejected the saved credentials (wrong password, deactivated or locked account).
        // Never retry them: every failed login counts toward the 5-attempt lockout. Drop them and
        // send the user to the sign-in screen instead.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          await storage.secureRemove("ticktrack_saved_creds");
          await storage.secureRemove("ticktrack_token");
          setToken(null);
          setUser(null);
          Alert.alert(
            "Please sign in again",
            e.status === 403 ? e.message : "Your session has expired and the saved password was not accepted.",
          );
        }
      }
      return null;
    })();
    reauthPromiseRef.current = attempt;
    void attempt.finally(() => {
      reauthPromiseRef.current = null;
    });
    return attempt;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      void initAppTheme();
      void requestNotificationPermissions();
      const [
        savedToken,
        seenOnboarding,
        savedProfile,
        cachedTasksRaw,
        cachedListsRaw,
        cachedHabitsRaw,
      ] = await Promise.all([
        storage.secureGet("ticktrack_token", null),
        storage.getItem("ticktrack_onboarded", false),
        storage.getItem<any>("ticktrack_user_profile", null),
        storage.getItem<any>(STORAGE_CACHED_TASKS, null),
        storage.getItem<any>(STORAGE_CACHED_LISTS, null),
        storage.getItem<any>(STORAGE_CACHED_HABITS, null),
      ]);
      if (!active) return;
      setOnboarded(Boolean(seenOnboarding));
      if (savedProfile) {
        setUser(typeof savedProfile === "string" ? JSON.parse(savedProfile) : savedProfile);
      }
      if (cachedTasksRaw) {
        try {
          const parsed = typeof cachedTasksRaw === "string" ? JSON.parse(cachedTasksRaw) : cachedTasksRaw;
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTasks(parsed.map(migrateCachedTask));
          }
        } catch {}
      }
      if (cachedListsRaw) {
        try {
          const parsed = typeof cachedListsRaw === "string" ? JSON.parse(cachedListsRaw) : cachedListsRaw;
          if (Array.isArray(parsed) && parsed.length > 0) {
            setLists(parsed);
          }
        } catch {}
      }
      if (cachedHabitsRaw) {
        try {
          const parsed = typeof cachedHabitsRaw === "string" ? JSON.parse(cachedHabitsRaw) : cachedHabitsRaw;
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHabits(parsed);
          }
        } catch {}
      }
      if (savedToken) {
        setToken(String(savedToken));
        try {
          const nextUser = await api<User>("/auth/me", {}, String(savedToken));
          if (!active) return;
          const parsedSaved = savedProfile ? (typeof savedProfile === "string" ? JSON.parse(savedProfile) : savedProfile) : null;
          const mergedUser: User = {
            ...(parsedSaved || {}),
            ...(nextUser || {}),
          };
          if (mergedUser.email || mergedUser.id) {
            setUser(mergedUser as User);
          }
        } catch (authErr: any) {
          // Token may have expired on server; try silent re-authentication with saved credentials
          const refreshedToken = await silentReauth();
          if (!refreshedToken) {
            console.warn("[TickTrack] Initial /auth/me check failed; staying logged in with offline profile:", authErr);
          }
        }
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [silentReauth]);

  useEffect(() => { if (token) void refresh(); }, [token, refresh]);

  // Handle 401 Unauthorized by attempting silent re-authentication with saved credentials.
  // Never automatically signOut() on network failures or temporary auth issues; only explicit user logout signs out.
  useEffect(() => {
    let reauthInFlight = false;
    setOnUnauthorized(() => {
      if (reauthInFlight) return;
      reauthInFlight = true;
      void (async () => {
        try {
          await silentReauth();
        } catch (e) {
          console.warn("[TickTrack] Background silent reauth failed:", e);
        } finally {
          reauthInFlight = false;
        }
      })();
    });
    return () => {
      setOnUnauthorized(null);
    };
  }, [silentReauth]);

  // Periodic auto-sync for background sync when device reconnects
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      // Only while the app is on screen; waking a backgrounded app every 15s drains battery and
      // makes Samsung Device Care flag it. The resume refresh flushes the queue anyway.
      if (AppState.currentState === "active") void syncOfflineQueue();
    }, 15000);
    return () => clearInterval(timer);
  }, [token, syncOfflineQueue]);

  // Register push notifications with backend when user is authenticated
  useEffect(() => {
    if (!token) return;
    void registerForPushNotificationsAsync().then((pushToken) => {
      if (pushToken && token) {
        api("/user-alerts/push-token", {
          method: "PUT",
          body: JSON.stringify({ pushToken }),
        }, token).catch((e) => {
          console.warn("Could not register push token with backend:", e);
        });
      }
    });
  }, [token]);

  const signIn = async (email: string, password: string) => {
    setError(null);
    const result = await postJson<{ access_token?: string; token?: string; user: User }>("/auth/login", { email, password });
    const tokenReceived = result.access_token || result.token || (result as any).accessToken;
    if (!tokenReceived) {
      throw new Error("Authentication failed: No token received from server");
    }
    const now = Date.now();
    const today = getTodayDateString();
    await storage.secureSet("ticktrack_token", tokenReceived);
    await storage.secureSet("ticktrack_saved_creds", JSON.stringify({ email: email.trim(), password }));
    await storage.setItem("ticktrack_last_email", email.trim());
    await storage.setItem("ticktrack_login_date", today);
    await storage.setItem("ticktrack_login_time", now);
    setToken(tokenReceived);
    const savedProfile = await storage.getItem<any>("ticktrack_user_profile", null);
    const parsedSaved = savedProfile ? (typeof savedProfile === "string" ? JSON.parse(savedProfile) : savedProfile) : null;
    const mergedUser: User = {
      ...result.user,
      ...(parsedSaved?.avatarUrl ? { avatarUrl: parsedSaved.avatarUrl } : {}),
      ...(parsedSaved?.name ? { name: parsedSaved.name } : {}),
    };
    setUser(mergedUser);
    void storage.setItem("ticktrack_user_profile", JSON.stringify(mergedUser));
  };

  const signOut = async () => {
    if (token) {
      void api("/user-alerts/push-token", {
        method: "PUT",
        body: JSON.stringify({ pushToken: null }),
      }, token).catch(() => {});
    }
    await storage.secureRemove("ticktrack_token");
    // Preserve ticktrack_saved_creds in secure storage so the user can log back in with Fingerprint / Face ID.
    await storage.removeItem("ticktrack_login_date");
    await storage.removeItem("ticktrack_login_time");
    // Cancel all pending notifications so they don't fire / re-duplicate on next sign-in
    await cancelAllTaskNotifications();
    setToken(null); setUser(null); setTasks([]); setHabits([]); setReminders([]); setLists([]); setTodayAttendance(undefined);
  };

  const markOnboarded = async () => { await storage.setItem("ticktrack_onboarded", true); setOnboarded(true); };

  // The backend has no /reminders module (task reminders are scheduled locally as notifications),
  // so this is a no-op kept to avoid touching every call site.
  const refreshReminders = useCallback(async () => {}, []);

  const addTask = async (payload: Record<string, unknown>) => {
    const assigneeIdsPayload: string[] = Array.isArray(payload.assigneeIds)
      ? (payload.assigneeIds as any[]).map(String).filter(Boolean)
      : payload.assignee_id
        ? [String(payload.assignee_id)]
        : payload.assigneeId
          ? [String(payload.assigneeId)]
          : [];

    const dueStr = payload.due_date ? String(payload.due_date) : null;
    const hasTime = Boolean(dueStr && dueStr.includes("T"));
    const startAt = dueStr ? (hasTime ? toIsoTimestamp(dueStr) : `${dueStr}T12:00:00.000Z`) : new Date().toISOString();
    // An explicit end time ("HH:mm", same day) from the Duration tab wins over the zero-length default.
    const endTimeStr = typeof payload.end_time === "string" ? payload.end_time : null;
    const endAt = dueStr
      ? (hasTime
          ? toIsoTimestamp(endTimeStr ? `${dueStr.slice(0, 10)}T${endTimeStr}:00` : dueStr)
          : `${dueStr}T18:00:00.000Z`)
      : new Date(Date.now() + 3600000).toISOString();

    const isRecurring = Boolean(payload.recurrence && payload.recurrence !== "none");
    let frequency: "DAILY" | "WEEKLY" | "MONTHLY" = "DAILY";
    let interval = 1;
    let byWeekday: number[] | undefined = undefined;

    if (isRecurring) {
      const rec = String(payload.recurrence).toLowerCase();
      if (rec === "daily") {
        frequency = "DAILY";
      } else if (rec === "weekdays") {
        frequency = "WEEKLY";
        byWeekday = [1, 2, 3, 4, 5];
      } else if (rec === "weekly") {
        frequency = "WEEKLY";
        const selectedDateObj = payload.due_date ? new Date(String(payload.due_date)) : new Date();
        const defaultDay = isNaN(selectedDateObj.getTime()) ? new Date().getDay() : selectedDateObj.getDay();
        byWeekday = Array.isArray(payload.repeatDays) && (payload.repeatDays as number[]).length > 0
          ? (payload.repeatDays as number[])
          : [defaultDay];
      } else if (rec === "fortnightly") {
        frequency = "WEEKLY";
        interval = 2;
        const selectedDateObj = payload.due_date ? new Date(String(payload.due_date)) : new Date();
        const defaultDay = isNaN(selectedDateObj.getTime()) ? new Date().getDay() : selectedDateObj.getDay();
        byWeekday = Array.isArray(payload.repeatDays) && (payload.repeatDays as number[]).length > 0
          ? (payload.repeatDays as number[])
          : [defaultDay];
      } else if (rec === "monthly") {
        frequency = "MONTHLY";
      } else {
        frequency = "DAILY";
      }
    }

    // A voice note has to reach the server before the task can reference it, so this throws (and the
    // composer stays open) rather than silently saving the task without it. Repeating series don't
    // store one.
    const voice = !isRecurring ? (payload.voice as VoiceNote | undefined) : undefined;
    const voiceFile = voice?.uri && token ? await uploadVoiceNote(voice.uri, token) : null;

    const endpoint = isRecurring ? "/activities/recurring" : "/activities";
    const body: Record<string, unknown> = {
      name: String(payload.title).trim(),
      ...(payload.notes ? { description: String(payload.notes).trim() } : {}),
      ...(voiceFile ? { descriptionAudioFile: voiceFile, descriptionAudioSec: Math.max(1, voice!.durationSec) } : {}),
      startAt,
      endAt,
      allDay: !hasTime,
      ...(isRecurring
        ? {
            frequency,
            interval,
            ...(byWeekday && byWeekday.length > 0 ? { byWeekday } : {}),
          }
        : {}),
      ...(assigneeIdsPayload.length ? { assigneeIds: assigneeIdsPayload } : {}),
      // Recurring series don't store "assigned by" yet, so only one-off tasks send it.
      ...(!isRecurring && payload.assignedById ? { assignedById: String(payload.assignedById) } : {}),
      // Informers and escalators, like assignedBy, are stored on one-off tasks only.
      ...(!isRecurring && Array.isArray(payload.informerIds) && payload.informerIds.length ? { informerIds: (payload.informerIds as any[]).map(String) } : {}),
      ...(!isRecurring && Array.isArray(payload.escalatorIds) && payload.escalatorIds.length ? { escalatorIds: (payload.escalatorIds as any[]).map(String) } : {}),
    };

    const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const dateStr = toLocalDateString(startAt);
    const optimisticTask: Task = {
      id: tempId,
      title: String(payload.title).trim(),
      notes: payload.notes ? String(payload.notes).trim() : "",
      descriptionAudio: voiceFile ? { file: voiceFile, durationSec: voice!.durationSec } : null,
      due_date: dateStr,
      startAt,
      endAt,
      window: hasTime ? undefined : "All Day",
      postponeCount: 0,
      priority: (payload.priority as any) || "medium",
      completed: false,
      status: "PENDING",
      recurrence: isRecurring ? String(payload.recurrence) : "none",
      reminders: Array.isArray(payload.reminders) ? (payload.reminders as string[]) : [],
      assigneeId: assigneeIdsPayload[0] || null,
      assigneeIds: assigneeIdsPayload,
      assigneeName: user?.name || "Me",
      source: "activity",
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdById: user?.id || null,
      createdBy: user,
      createdByName: user?.name || "Me",
      assignedById: payload.assignedById ? String(payload.assignedById) : null,
      assignedByName: payload.assignedById
        ? (() => {
            const u = assignableUsers.find((usr) => usr.id === payload.assignedById);
            return u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || null : null;
          })()
        : null,
      actions: [],
    };

    // Optimistically update memory and cache
    setTasks((current) => {
      const next = [optimisticTask, ...current];
      cacheTasks(next);
      return next;
    });
    void scheduleTaskNotification(optimisticTask);

    inFlightTempIdsRef.current.add(tempId);
    let synced = false;
    if (token) {
      try {
        const createdRaw = await postJson<any>(endpoint, body, token);
        if (createdRaw) {
          synced = true;
          if (!isRecurring) {
            let created = normalizeActivity(createdRaw);
            const remarkText = typeof payload.remark === "string" ? payload.remark.trim() : "";
            const pendingFiles = Array.isArray(payload.attachments) ? (payload.attachments as LocalAttachment[]) : [];
            if ((remarkText || pendingFiles.length) && created.id) {
              // Stored as a normal remark so it shows in the task's history like any other.
              const withRemark = await (async () => {
                const uploaded = pendingFiles.length ? await uploadFiles(pendingFiles, token) : [];
                return api<any>(
                  `/activities/${created.id}/remark`,
                  {
                    method: "PATCH",
                    body: JSON.stringify({
                      ...(remarkText ? { remarks: remarkText } : {}),
                      ...(uploaded.length ? { attachments: uploaded } : {}),
                    }),
                  },
                  token
                );
              })().catch((err) => {
                console.warn("create remark failed", err);
                return null;
              });
              if (withRemark) created = normalizeActivity(withRemark);
            }
            setTasks((current) => {
              const next = current.map((t) => (t.id === tempId ? created : t));
              cacheTasks(next);
              return next;
            });
            void scheduleTaskNotification(created);
            // State already holds the new task; a full reload would redraw every list.
            inFlightTempIdsRef.current.delete(tempId);
            return;
          } else {
            setTasks((current) => {
              const next = current.filter((t) => t.id !== tempId);
              cacheTasks(next);
              return next;
            });
          }
          void refresh();
        }
      } catch (netErr: any) {
        console.log("[TickTrack] Network unreachable, task saved offline:", netErr?.message);
      }
    }

    if (!synced) {
      const queueItem: OfflineTaskQueueItem = {
        tempId,
        isRecurring,
        endpoint,
        body,
        createdAt: Date.now(),
      };
      const existingQueueRaw = await storage.getItem<any>(STORAGE_OFFLINE_QUEUE, []);
      const existingQueue: OfflineTaskQueueItem[] = Array.isArray(existingQueueRaw)
        ? existingQueueRaw
        : typeof existingQueueRaw === "string"
        ? JSON.parse(existingQueueRaw || "[]")
        : [];
      existingQueue.push(queueItem);
      await storage.setItem(STORAGE_OFFLINE_QUEUE, JSON.stringify(existingQueue));
      setOfflineQueueCount(existingQueue.length);
      console.log(`[TickTrack] Task saved offline. Total queued: ${existingQueue.length}`);
    }
    inFlightTempIdsRef.current.delete(tempId);
  };

  const editTask = async (task: Task, payload: UpdateTaskPayload) => {
    if (!token) return;
    let completed = false;
    // A plain edit already swaps the returned task into state, so only changes that
    // touch a series (or spawn one) need the full reload.
    let needsFullRefresh = false;
    try {
      const isSeries = task.source === "recurring_series" || task.id.startsWith("recurrence_");
      needsFullRefresh = isSeries || (!!payload.recurrence && payload.recurrence.toLowerCase() !== "none");
      const seriesId: string | null = isSeries
        ? task.id.replace("recurrence_", "")
        : ((task as any).recurrenceId ?? null);
      if (__DEV__) console.log("[repeat-debug] editTask", { id: task.id, source: task.source, seriesId, isSeries, from: { recurrence: task.recurrence, repeatDays: task.repeatDays }, to: { recurrence: payload.recurrence, repeatDays: payload.repeatDays } });

      // The PATCH response is the saved series; remember its rule so a failed refresh can't revert it.
      const cacheSeries = (raw: any) => {
        if (__DEV__) console.log("[repeat-debug] series PATCH response", { id: raw?.id, frequency: raw?.frequency, interval: raw?.interval, byWeekday: raw?.byWeekday, summary: raw?.summary });
        if (!raw?.id) return;
        const s = normalizeRecurringSeries(raw);
        seriesInfoRef.current.set(String(raw.id), { recurrence: s.recurrence ?? "repeat", recurrenceRule: s.recurrenceRule, repeatDays: s.repeatDays });
      };

      // Series notes carry a "🔁 summary" display line that must never be written back.
      const SERIES_NOTE_PREFIX = /^🔁[^\n]*\n\n/;
      // Maps the edit modal's repeat choice onto the series rule the API stores.
      const buildSeriesBody = (): Record<string, unknown> => {
        const body: Record<string, unknown> = {};
        if (payload.title !== undefined) body.name = payload.title.trim();
        if (payload.notes !== undefined) body.description = payload.notes.trim();
        if (payload.assigneeIds !== undefined) body.assigneeIds = payload.assigneeIds;
        const rec = payload.recurrence?.toLowerCase();
        if (rec === "daily") {
          body.frequency = "DAILY";
          body.interval = 1;
        } else if (rec === "weekdays") {
          body.frequency = "WEEKLY";
          body.interval = 1;
          body.byWeekday = [1, 2, 3, 4, 5];
        } else if (rec === "weekly") {
          body.frequency = "WEEKLY";
          body.interval = 1;
          // The backend stores exactly what it is given; an empty list would generate nothing.
          if (Array.isArray(payload.repeatDays) && payload.repeatDays.length > 0) {
            body.byWeekday = payload.repeatDays;
          } else {
            const ref = payload.due_date ? new Date(String(payload.due_date)) : new Date(task.due_date ?? Date.now());
            body.byWeekday = [isNaN(ref.getTime()) ? new Date().getDay() : ref.getDay()];
          }
        } else if (rec === "fortnightly") {
          body.frequency = "WEEKLY";
          body.interval = 2;
          if (Array.isArray(payload.repeatDays) && payload.repeatDays.length > 0) {
            body.byWeekday = payload.repeatDays;
          } else {
            const ref = payload.due_date ? new Date(String(payload.due_date)) : new Date(task.due_date ?? Date.now());
            body.byWeekday = [isNaN(ref.getTime()) ? new Date().getDay() : ref.getDay()];
          }
        } else if (rec === "monthly") {
          body.frequency = "MONTHLY";
          body.interval = 1;
        }
        return body;
      };

      // "Doesn't repeat" on a series row stops the series.
      if (isSeries && seriesId && payload.recurrence?.toLowerCase() === "none") {
        await api(
          `/activities/recurring/${seriesId}/cancel`,
          { method: "PATCH", body: JSON.stringify({ remarks: "Repeat removed via mobile app" }) },
          token
        );
      } else if (isSeries && seriesId) {
        const body = buildSeriesBody();
        if (payload.notes !== undefined) body.description = payload.notes.replace(SERIES_NOTE_PREFIX, "").trim();
        cacheSeries(await api<any>(`/activities/recurring/${seriesId}`, { method: "PATCH", body: JSON.stringify(body) }, token));
      } else if (task.source === "activity") {
        const body: Record<string, unknown> = {};
        if (payload.title !== undefined) body.name = payload.title.trim();
        if (payload.notes !== undefined) body.description = payload.notes.trim();
        if (payload.voice?.uri) {
          body.descriptionAudioFile = await uploadVoiceNote(payload.voice.uri, token);
          body.descriptionAudioSec = Math.max(1, payload.voice.durationSec);
        } else if (payload.removeVoice) {
          body.removeDescriptionAudio = true;
        }
        if (payload.assigneeIds !== undefined) body.assigneeIds = payload.assigneeIds;
        if (payload.informerIds !== undefined) body.informerIds = payload.informerIds;
        if (payload.escalatorIds !== undefined) body.escalatorIds = payload.escalatorIds;
        if (payload.due_date !== undefined) {
          if (payload.due_date) {
            const hasTime = payload.due_date.includes("T");
            body.startAt = hasTime ? toIsoTimestamp(payload.due_date) : `${payload.due_date}T09:00:00.000Z`;
            body.endAt = hasTime ? toIsoTimestamp(payload.due_date) : `${payload.due_date}T18:00:00.000Z`;
            body.allDay = !hasTime;
          }
        }
        const updatedRaw = await api<any>(
          `/activities/${task.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          },
          token
        );
        if (updatedRaw) {
          const updated = normalizeActivity(updatedRaw);
          if (payload.recurrence !== undefined) updated.recurrence = payload.recurrence;
          if (payload.repeatDays !== undefined) updated.repeatDays = payload.repeatDays;
          setTasks((current) => current.map((t) => (t.id === task.id ? updated : t)));
        }

        // A one-off activity given a repeat becomes a new series; the one-off is
        // cancelled because the series generates its own first occurrence.
        if (!seriesId && payload.recurrence && payload.recurrence !== "none") {
          const startAt = (body.startAt as string | undefined) ?? (task.due_date ? toIsoTimestamp(task.due_date) : new Date().toISOString());
          const endAt = (body.endAt as string | undefined) ?? startAt;
          const seriesBody = buildSeriesBody();
          if (!seriesBody.name) seriesBody.name = task.title;
          if (!seriesBody.assigneeIds && Array.isArray((task as any).assignees)) {
            const ids = (task as any).assignees.map((a: any) => a.id || a.userId).filter(Boolean);
            if (ids.length > 0) seriesBody.assigneeIds = ids;
          }
          await api(
            "/activities/recurring",
            { method: "POST", body: JSON.stringify({ interval: 1, ...seriesBody, startAt, endAt, allDay: body.allDay ?? false }) },
            token
          );
          await api(`/activities/${task.id}/cancel`, { method: "PATCH", body: JSON.stringify({ remarks: "Converted to a repeating activity" }) }, token).catch(() => {});
        }

        // Changing the repeat rule of an occurrence edits its whole series. Done
        // after the occurrence PATCH because regenerating the series deletes
        // upcoming occurrences, which would 404 that PATCH.
        const sameDays =
          JSON.stringify([...(payload.repeatDays ?? [])].sort()) ===
          JSON.stringify([...(task.repeatDays ?? [])].sort());
        if (
          seriesId &&
          payload.recurrence !== undefined &&
          payload.recurrence !== "none" &&
          (payload.recurrence !== (task.recurrence ?? "none") || !sameDays)
        ) {
          const seriesBody = buildSeriesBody();
          delete seriesBody.name;
          delete seriesBody.description;
          delete seriesBody.assigneeIds;
          cacheSeries(await api<any>(`/activities/recurring/${seriesId}`, { method: "PATCH", body: JSON.stringify(seriesBody) }, token));
        }

        // "Doesn't repeat" on an occurrence stops its whole series. Without this the server rule
        // never changed, so the next refresh brought the old repeat back.
        if (seriesId && payload.recurrence?.toLowerCase() === "none") {
          await api(
            `/activities/recurring/${seriesId}/cancel`,
            { method: "PATCH", body: JSON.stringify({ remarks: "Repeat removed via mobile app", keepActivityId: task.id }) },
            token
          );
          seriesInfoRef.current.delete(seriesId);
          needsFullRefresh = true;
        }
      } else {
        const body: Record<string, unknown> = {};
        if (payload.title !== undefined) body.title = payload.title.trim();
        if (payload.notes !== undefined) body.description = payload.notes.trim();
        if (payload.priority !== undefined) {
          const priorityMap: Record<string, string> = { low: "LOW", medium: "MEDIUM", high: "HIGH", critical: "CRITICAL", none: "MEDIUM" };
          body.priority = priorityMap[payload.priority.toLowerCase()] ?? "MEDIUM";
        }
        if (payload.due_date !== undefined) {
          body.endDate = payload.due_date ? toIsoTimestamp(payload.due_date) : null;
        }
        if (payload.assigneeIds !== undefined) {
          body.assigneeIds = payload.assigneeIds;
          body.assigneeId = payload.assigneeIds[0] ?? null;
        }
        const updatedRaw = await api<any>(
          `/tasks/${task.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          },
          token
        );
        if (updatedRaw) {
          const updated = normalizeTask(updatedRaw);
          setTasks((current) => current.map((t) => (t.id === task.id ? updated : t)));
        }
      }
      completed = true;
    } finally {
      if (needsFullRefresh || !completed) await refresh();
    }
  };

  const toggleTask = async (task: Task, remarks?: string) => {
    if (!token) return;
    const newCompleted = !task.completed;
    const nowIso = new Date().toISOString();
    const optimisticTask: Task = {
      ...task,
      completed: newCompleted,
      status: newCompleted ? "COMPLETED" : "WIP",
      completedAt: newCompleted ? (task.completedAt || nowIso) : null,
    };

    // Optimistically update memory and record recent toggle
    recentTogglesRef.current.set(task.id, {
      completed: newCompleted,
      completedAt: optimisticTask.completedAt ?? null,
      time: Date.now(),
    });

    setTasks((current) => current.map((item) => (item.id === task.id ? optimisticTask : item)));

    if (newCompleted) {
      void cancelTaskNotification(task.id);
    } else {
      void scheduleTaskNotification(optimisticTask);
    }

    // Persist completed dates map locally
    try {
      const savedRaw = await storage.getItem<string>("ticktrack_completed_task_dates", "");
      let savedCompletedDates: Record<string, string> = {};
      if (savedRaw) {
        try {
          savedCompletedDates = typeof savedRaw === "string" ? JSON.parse(savedRaw) : (savedRaw as any);
        } catch {}
      }
      if (newCompleted) {
        savedCompletedDates[task.id] = optimisticTask.completedAt || nowIso;
      } else {
        delete savedCompletedDates[task.id];
      }
      await storage.setItem("ticktrack_completed_task_dates", JSON.stringify(savedCompletedDates));
    } catch {}

    if (task.id.startsWith("offline_")) {
      setTasks((current) => {
        const next = current.map((item) => (item.id === task.id ? optimisticTask : item));
        cacheTasks(next);
        return next;
      });
      return;
    }

    let updatedTaskObj: Task | null = null;
    try {
      if (task.source === "activity") {
        const path = newCompleted ? `/activities/${task.id}/complete` : `/activities/${task.id}/status`;
        const trimmedRemarks = remarks?.trim();
        const body = newCompleted ? (trimmedRemarks ? { remarks: trimmedRemarks } : {}) : { status: "PENDING" };
        let res: any;
        try {
          res = await api<any>(path, { method: "PATCH", body: JSON.stringify(body) }, token);
        } catch (actErr: any) {
          // If complete endpoint had an issue or activity wasn't in PENDING state, try status patch
          if (newCompleted) {
            res = await api<any>(`/activities/${task.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "COMPLETED", ...(trimmedRemarks ? { remarks: trimmedRemarks } : {}) }) }, token);
          } else {
            throw actErr;
          }
        }
        if (res) {
          updatedTaskObj = normalizeActivity(res);
        }
      } else {
        const newStatus = newCompleted ? "COMPLETED" : "WIP";
        const res = await api<any>(
          `/tasks/${task.id}`,
          { method: "PATCH", body: JSON.stringify({ status: newStatus, progressPct: newCompleted ? 100 : 0 }) },
          token
        );
        if (res) {
          updatedTaskObj = normalizeTask(res);
        }
      }

      // If backend succeeded, sync final authoritative task object
      if (updatedTaskObj) {
        const finalTask = updatedTaskObj;
        if (newCompleted && !finalTask.completedAt) {
          finalTask.completedAt = optimisticTask.completedAt || nowIso;
        }
        recentTogglesRef.current.set(task.id, {
          completed: finalTask.completed,
          completedAt: finalTask.completedAt ?? null,
          time: Date.now(),
        });
        setTasks((current) => current.map((item) => (item.id === task.id ? finalTask : item)));
      }
      void refreshReminders();
    } catch (err: any) {
      // Revert optimistic update on backend rejection
      recentTogglesRef.current.delete(task.id);
      setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));

      // Revert stored completed date
      try {
        const savedRaw = await storage.getItem<string>("ticktrack_completed_task_dates", "");
        let savedCompletedDates: Record<string, string> = {};
        if (savedRaw) {
          try {
            savedCompletedDates = typeof savedRaw === "string" ? JSON.parse(savedRaw) : (savedRaw as any);
          } catch {}
        }
        if (task.completed) {
          savedCompletedDates[task.id] = task.completedAt || nowIso;
        } else {
          delete savedCompletedDates[task.id];
        }
        await storage.setItem("ticktrack_completed_task_dates", JSON.stringify(savedCompletedDates));
      } catch {}

      if (task.completed) {
        void cancelTaskNotification(task.id);
      } else {
        void scheduleTaskNotification(task);
      }

      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        "Could not update task status. Please check your permissions or subtasks.";
      Alert.alert(
        "Unable to update task",
        Array.isArray(errorMessage) ? errorMessage.join("\n") : String(errorMessage)
      );
    }
  };

  const postponeTask = async (
    task: Task,
    payload: { endDate: string; startDate?: string; startTime?: string; endTime?: string; remarks?: string; voice?: VoiceNote }
  ) => {
    if (!token) throw new Error("Not authenticated");
    const { endDate, remarks } = payload;
    const voiceFile = payload.voice?.uri ? await uploadVoiceNote(payload.voice.uri, token) : null;
    const voiceBody = voiceFile ? { audioFile: voiceFile, audioSec: Math.max(1, payload.voice!.durationSec) } : {};
    if (!endDate) throw new Error("Please select an end date");

    // Extract local start/end times if available
    let origStartTime = payload.startTime;
    let origEndTime = payload.endTime;

    if (!origStartTime && task.startAt) {
      try {
        const d = new Date(task.startAt);
        if (!isNaN(d.getTime())) {
          origStartTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
      } catch {}
    }
    if (!origEndTime && task.endAt) {
      try {
        const d = new Date(task.endAt);
        if (!isNaN(d.getTime())) {
          origEndTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
      } catch {}
    }

    if (!origStartTime) origStartTime = "09:00";
    if (!origEndTime) origEndTime = "18:00";

    const startDate = payload.startDate || endDate;

    let startAt = toIsoDateTime(startDate, origStartTime) || `${startDate}T09:00:00.000Z`;
    let endAt = toIsoDateTime(endDate, origEndTime, true) || `${endDate}T18:00:00.000Z`;

    // Ensure endAt is strictly after startAt
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      const s = new Date(startAt);
      endAt = new Date(s.getTime() + 60 * 60 * 1000).toISOString();
    }

    let updatedTaskObj: Task | null = null;
    let lastError: any = null;

    if (task.source === "activity") {
      try {
        const res = await api<any>(
          `/activities/${task.id}/postpone`,
          {
            method: "PATCH",
            body: JSON.stringify({
              startAt,
              endAt,
              allDay: false,
              remarks: remarks?.trim() || undefined,
              ...voiceBody,
            }),
          },
          token
        );
        if (res) {
          updatedTaskObj = normalizeActivity(res);
        }
      } catch (err: any) {
        lastError = err;
        // Fallback: try PATCH /activities/:id directly if /postpone fails (e.g. status was not pending)
        try {
          const res = await api<any>(
            `/activities/${task.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                startAt,
                endAt,
                allDay: false,
              }),
            },
            token
          );
          if (res) {
            updatedTaskObj = normalizeActivity(res);
            lastError = null;
          }
        } catch {}
      }
    } else {
      let taskStartDate = payload.startDate;
      if (!taskStartDate && task.startAt) {
        try {
          const d = new Date(task.startAt);
          if (!isNaN(d.getTime())) {
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            taskStartDate = `${d.getFullYear()}-${m}-${day}`;
          }
        } catch {}
      }
      if (!taskStartDate || taskStartDate > endDate) {
        taskStartDate = endDate;
      }

      const taskStartIso = toIsoDateTime(taskStartDate, origStartTime) || `${taskStartDate}T09:00:00.000Z`;
      const taskEndIso = toIsoDateTime(endDate, origEndTime, true) || `${endDate}T18:00:00.000Z`;

      try {
        const res = await api<any>(
          `/tasks/${task.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              startDate: taskStartIso,
              endDate: taskEndIso,
            }),
          },
          token
        );
        if (res) {
          updatedTaskObj = normalizeTask(res);
        }
      } catch (err: any) {
        lastError = err;
        // Fallback: if task not found in /tasks, try /activities/:id/postpone in case it was an activity
        try {
          const actRes = await api<any>(
            `/activities/${task.id}/postpone`,
            {
              method: "PATCH",
              body: JSON.stringify({
                startAt,
                endAt,
                allDay: false,
                remarks: remarks?.trim() || undefined,
              }),
            },
            token
          );
          if (actRes) {
            updatedTaskObj = normalizeActivity(actRes);
            lastError = null;
          }
        } catch {}
      }
    }

    if (lastError && !updatedTaskObj) {
      throw lastError;
    }

    if (updatedTaskObj) {
      setTasks((current) => current.map((item) => (item.id === task.id ? updatedTaskObj! : item)));
    } else {
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                due_date: endDate,
                endAt,
                startAt,
                postponeCount: (item.postponeCount ?? 0) + 1,
              }
            : item
        )
      );
    }

    // The returned activity is already in state; reload only if the fallback guess was used.
    if (!updatedTaskObj) await refresh();
  };

  /** List responses carry only the latest few actions; pull the full history when a task is opened. */
  const loadTaskDetail = async (task: Task) => {
    if (!token || task.source !== "activity" || task.id.startsWith("offline_")) return;
    const res = await api<any>(`/activities/${task.id}`, {}, token).catch(() => null);
    if (!res) return;
    const full = normalizeActivity(res);
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, actions: full.actions } : item)));
  };

  const loadFollowing = async () => {
    if (!token) return { informed: [] as Task[], escalations: [] as Task[] };
    const [w, e] = await Promise.all([
      api<{ data?: any[] }>("/activities/informed?limit=100", {}, token).catch(() => null),
      api<{ data?: any[] }>("/activities/escalations?limit=100", {}, token).catch(() => null),
    ]);
    const parse = (res: any) => ((res?.data ?? []) as any[]).map(normalizeActivity);
    return { informed: parse(w), escalations: parse(e) };
  };

  const loadEscalations = async () => {
    if (!token) return [] as Task[];
    const res = await api<{ data?: any[] }>("/activities/escalations?limit=100", {}, token).catch(() => null);
    return ((res?.data ?? []) as any[]).map(normalizeActivity);
  };

  const escalateTask = async (task: Task, remarks?: string) => {
    if (!token) return;
    await api<any>(
      `/activities/${task.id}/escalate`,
      { method: "PATCH", body: JSON.stringify(remarks?.trim() ? { remarks: remarks.trim() } : {}) },
      token
    );
  };

  const addRemark = async (task: Task, remarks: string, voice?: VoiceNote, files?: LocalAttachment[]) => {
    if (!token) return;
    const trimmed = remarks.trim();
    if (!trimmed && !voice && !files?.length) return;

    if (task.source === "activity") {
      const voiceFile = voice?.uri ? await uploadVoiceNote(voice.uri, token) : null;
      const uploaded = files?.length ? await uploadFiles(files, token) : [];
      const res = await api<any>(
        `/activities/${task.id}/remark`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...(trimmed ? { remarks: trimmed } : {}),
            ...(voiceFile ? { audioFile: voiceFile, audioSec: Math.max(1, voice!.durationSec) } : {}),
            ...(uploaded.length ? { attachments: uploaded } : {}),
          }),
        },
        token
      ).catch((err) => {
        console.warn("addRemark failed", err);
        throw err;
      });
      if (res) {
        const norm = normalizeActivity(res);
        setTasks((current) => current.map((item) => (item.id === task.id ? norm : item)));
      }
    } else {
      if (!trimmed) return;
      const timestamp = new Date().toLocaleString();
      const currentNotes = task.notes || "";
      const newNotes = currentNotes
        ? `${currentNotes}\n\n[Remark (${timestamp})]: ${trimmed}`
        : `[Remark (${timestamp})]: ${trimmed}`;
      await editTask(task, { notes: newNotes });
    }
  };

  const dismissReminder = async (task: Task, reminderKey: string) => {
    if (!token) return;
    const nextDismissed = Array.from(new Set([...(task.dismissed_reminders ?? []), reminderKey]));
    const updated = await api<Task>(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ dismissed_reminders: nextDismissed }) }, token);
    setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
    setReminders((current) => current.filter((item) => !(item.task_id === task.id && item.reminder_key === reminderKey)));
  };

  const addHabit = async (habit: CatalogHabit | { name: string; category: string }) => {
    if (!token) return;
    const created = await postJson<Habit>("/habits", { name: habit.name, category: habit.category }, token);
    setHabits((current) => [...current, created]);
  };

  const toggleHabit = async (habit: Habit) => {
    if (!token) return;
    const updated = await postJson<Habit>(`/habits/${habit.id}/complete`, {}, token);
    setHabits((current) => current.map((item) => item.id === habit.id ? updated : item));
  };

  const addList = async (payload: { name: string; emoji?: string; color?: string }) => {
    if (!token) throw new Error("Not signed in");
    const created = await postJson<TaskList>("/lists", payload, token);
    setLists((current) => [...current, created]);
    return created;
  };

  const deleteList = async (listId: string) => {
    if (!token) return;
    await api(`/lists/${listId}`, { method: "DELETE" }, token);
    setLists((current) => current.filter((item) => item.id !== listId));
    setTasks((current) =>
      current.map((task) =>
        task.list_id === listId || task.projectId === listId
          ? { ...task, list_id: null, projectId: null }
          : task
      )
    );
  };

  const reorderLists = async (orderedListIds: string[]) => {
    if (!token) return;
    setLists((current) => {
      const map = new Map(current.map((item) => [item.id, item]));
      const newLists: TaskList[] = [];
      orderedListIds.forEach((id, idx) => {
        const item = map.get(id);
        if (item) {
          newLists.push({ ...item, order: idx });
        }
      });
      current.forEach((item) => {
        if (!orderedListIds.includes(item.id)) {
          newLists.push(item);
        }
      });
      return newLists;
    });

    await Promise.all(
      orderedListIds.map((id, idx) =>
        api(`/lists/${id}`, { method: "PATCH", body: JSON.stringify({ order: idx }) }, token).catch(() => {})
      )
    );
  };

  const updateUser = (updated: Partial<User>) => {
    setUser((prev) => {
      const nextUser = prev
        ? { ...prev, ...updated }
        : { id: "preview-user-id-1001", email: updated.email || "user@example.com", name: updated.name || "Preview User" };
      void storage.setItem("ticktrack_user_profile", JSON.stringify(nextUser));
      return nextUser;
    });
  };

  const fetchAttendance = useCallback(async () => {
    if (!token) {
      setTodayAttendance(null);
      return null;
    }
    try {
      const tz = getDeviceTimeZone();
      const res = await api<Attendance>(`/attendance/today?timeZone=${encodeURIComponent(tz)}`, {}, token);
      setTodayAttendance(res || null);
      return res || null;
    } catch {
      setTodayAttendance(null);
      return null;
    }
  }, [token]);

  const checkIn = useCallback(async (data?: { remarks?: string; isWfh?: boolean }) => {
    if (!token) throw new Error("Please sign in to check in");
    setAttendanceLoading(true);
    try {
      const tz = getDeviceTimeZone();
      const res = await api<Attendance>("/attendance/check-in", {
        method: "POST",
        body: JSON.stringify({
          remarks: data?.remarks?.trim() || undefined,
          isWfh: Boolean(data?.isWfh),
          timeZone: tz,
        }),
      }, token);
      setTodayAttendance(res);
      return res;
    } finally {
      setAttendanceLoading(false);
    }
  }, [token]);

  const checkOut = useCallback(async (data?: { remarks?: string }) => {
    if (!token) throw new Error("Please sign in to check out");
    setAttendanceLoading(true);
    try {
      const tz = getDeviceTimeZone();
      const res = await api<Attendance>("/attendance/check-out", {
        method: "POST",
        body: JSON.stringify({
          remarks: data?.remarks?.trim() || undefined,
          timeZone: tz,
        }),
      }, token);
      setTodayAttendance(res);
      return res;
    } finally {
      setAttendanceLoading(false);
    }
  }, [token]);

  // Handle interactive notification actions (Complete / Snooze 15m)
  useEffect(() => {
    if (!Notifications?.addNotificationResponseReceivedListener) return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const actionId = response?.actionIdentifier;
      const data = response?.notification?.request?.content?.data;
      const taskId = data?.taskId;

      if (actionId === ACTION_COMPLETE_TASK && taskId) {
        const target = tasks.find((t) => t.id === taskId);
        if (target) {
          void toggleTask(target);
        }
      } else if (actionId === ACTION_SNOOZE_TASK && taskId) {
        const target = tasks.find((t) => t.id === taskId);
        void snoozeTaskNotification(taskId, target?.title);
      } else if (data && token) {
        void refresh();
      }
    });
    return () => {
      subscription?.remove?.();
    };
  }, [token, tasks, refresh, toggleTask]);

  // Tag crash reports with who was signed in.
  useEffect(() => {
    setCrashUser(user ? { id: user.id, email: user.email } : null);
  }, [user?.id, user?.email]);

  // Sync once when the app returns to the foreground. refresh() already flushes the offline
  // queue. Resuming used to fire two full refreshes (about 14 requests each) at the moment
  // Android is reclaiming memory, so resumes are throttled and the refresh is deferred briefly
  // to let the app finish waking up first.
  useEffect(() => {
    let lastState: AppStateStatus = AppState.currentState;
    let lastResumeRefresh = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (lastState.match(/inactive|background/) && nextState === "active" && token) {
        const now = Date.now();
        if (now - lastResumeRefresh > 20000) {
          lastResumeRefresh = now;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = null;
            refresh().catch(() => {});
          }, 600);
        }
      }
      lastState = nextState;
    });
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [token, refresh]);

  // Live Auto-Sync: Active-window heartbeat poll every 25 seconds
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      if (AppState.currentState === "active") {
        void refresh();
      }
    }, 25000);
    return () => clearInterval(timer);
  }, [token, refresh]);

  const value = useMemo(
    () => ({
      token,
      user,
      tasks,
      habits,
      catalog,
      reminders,
      lists,
      assignableUsers,
      notifications,
      unreadNotificationCount,
      offlineQueueCount,
      loading,
      onboarded,
      error,
      signIn,
      signOut,
      markOnboarded,
      addTask,
      editTask,
      toggleTask,
      deleteTask,
      postponeTask,
      addRemark,
      loadTaskDetail,
      loadFollowing,
      loadEscalations,
      escalateTask,
      dismissReminder,
      markNotificationRead,
      markAllNotificationsRead,
      addHabit,
      toggleHabit,
      addList,
      deleteList,
      reorderLists,
      updateUser,
      refresh,
      todayAttendance,
      attendanceLoading,
      fetchAttendance,
      checkIn,
      checkOut,
    }),
    [
      token,
      user,
      tasks,
      habits,
      catalog,
      reminders,
      lists,
      assignableUsers,
      notifications,
      unreadNotificationCount,
      offlineQueueCount,
      loading,
      onboarded,
      error,
      refresh,
      todayAttendance,
      attendanceLoading,
      fetchAttendance,
      checkIn,
      checkOut,
    ]
  );
  return (
    <Context.Provider value={value}>
      {children}
      <DeleteRepeatModal
        visible={Boolean(deletePrompt)}
        title={deletePrompt?.title}
        onChoose={(choice) => deletePrompt?.resolve(choice)}
      />
    </Context.Provider>
  );
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
