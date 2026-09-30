import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, postJson } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { getTaskTimestamp } from "@/src/utils/date-utils";
import { requestNotificationPermissions, scheduleTaskNotification, cancelTaskNotification, syncAllTaskNotifications } from "@/src/utils/notification-service";
import type { AssignableUser, CatalogHabit, Habit, Reminder, Task, TaskList, User } from "@/src/types";

type AppContextValue = {
  token: string | null;
  user: User | null;
  tasks: Task[];
  habits: Habit[];
  catalog: CatalogHabit[];
  reminders: Reminder[];
  lists: TaskList[];
  assignableUsers: AssignableUser[];
  loading: boolean;
  onboarded: boolean;
  error: string | null;
  signIn: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  markOnboarded: () => Promise<void>;
  addTask: (payload: Record<string, unknown>) => Promise<void>;
  toggleTask: (task: Task) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  dismissReminder: (task: Task, reminderKey: string) => Promise<void>;
  addHabit: (habit: CatalogHabit | { name: string; category: string }) => Promise<void>;
  toggleHabit: (habit: Habit) => Promise<void>;
  addList: (payload: { name: string; emoji?: string; color?: string }) => Promise<TaskList>;
  deleteList: (listId: string) => Promise<void>;
  reorderLists: (orderedListIds: string[]) => Promise<void>;
  updateUser: (updated: Partial<User>) => void;
  refresh: () => Promise<void>;
};

const Context = createContext<AppContextValue | null>(null);

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

function normalizeTask(raw: any): Task {
  const rawDate = raw.endDate ?? raw.startDate ?? raw.plannedEnd ?? raw.plannedStart ?? raw.due_date;
  const due_date = toLocalDateString(rawDate);
  const assigneeName = raw.assignee
    ? (raw.assignee.name ?? `${raw.assignee.firstName ?? ""} ${raw.assignee.lastName ?? ""}`).trim()
    : raw.assigneeName ?? null;

  return {
    ...raw,
    id: raw.id,
    title: raw.title,
    notes: raw.description ?? raw.notes ?? "",
    due_date,
    priority: (raw.priority ?? "MEDIUM").toLowerCase() as any,
    completed: raw.completed ?? raw.status === "COMPLETED",
    list_id: raw.projectId ?? raw.list_id ?? "inbox",
    projectId: raw.projectId ?? raw.list_id ?? null,
    assigneeId: raw.assigneeId ?? raw.assignee?.id ?? null,
    assigneeName: assigneeName || null,
    source: "task",
  };
}

function normalizeActivity(act: any): Task {
  const isCompleted = act.status === "COMPLETED";
  const rawAssignee = act.assignees?.[0];
  const primaryAssigneeUser = rawAssignee?.user ?? (rawAssignee?.userId || rawAssignee?.name ? rawAssignee : null);
  const assigneeName = primaryAssigneeUser
    ? (primaryAssigneeUser.name ?? `${primaryAssigneeUser.firstName ?? ""} ${primaryAssigneeUser.lastName ?? ""}`).trim()
    : act.createdByName ?? null;
  const startIso = act.startAt ? String(act.startAt) : null;
  const dateStr = toLocalDateString(startIso);

  return {
    id: act.id,
    title: act.name ?? act.title ?? "Untitled",
    notes: act.description ?? act.notes ?? "",
    due_date: dateStr,
    priority: "medium",
    completed: isCompleted,
    list_id: "inbox",
    assigneeId: primaryAssigneeUser?.id ?? primaryAssigneeUser?.userId ?? null,
    assigneeName: assigneeName || null,
    source: "activity",
    created_at: act.createdAt ?? new Date().toISOString(),
  };
}

import { initAppTheme } from "./theme";

export function AppProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [catalog, setCatalog] = useState<CatalogHabit[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      const [rawTasks, mineRes, assignedRes, nextHabits, nextCatalog, nextReminders, nextLists, nextAssignables, savedDeletedIds] = await Promise.all([
        api<any[]>("/tasks", {}, token).catch(() => []),
        api<{ data?: any[] }>("/activities/mine?limit=100", {}, token).catch(() => ({ data: [] })),
        api<{ data?: any[] }>("/activities/assigned?limit=100", {}, token).catch(() => ({ data: [] })),
        api<Habit[]>("/habits", {}, token).catch(() => []),
        api<CatalogHabit[]>("/habits/catalog").catch(() => []),
        api<Reminder[]>("/reminders/due", {}, token).catch(() => []),
        api<TaskList[]>("/lists", {}, token).catch(() => []),
        api<AssignableUser[]>("/users/assignable", {}, token).catch(() => []),
        storage.getItem<any>("ticktrack_deleted_task_ids", null),
      ]);

      const deletedSet = new Set(Array.isArray(savedDeletedIds) ? savedDeletedIds : typeof savedDeletedIds === "string" ? JSON.parse(savedDeletedIds) : []);
      const normalizedProjectTasks = (rawTasks ?? []).map(normalizeTask);
      const mineActivities = ((mineRes as any)?.data ?? (Array.isArray(mineRes) ? mineRes : [])).map(normalizeActivity);
      const assignedActivities = ((assignedRes as any)?.data ?? (Array.isArray(assignedRes) ? assignedRes : [])).map(normalizeActivity);

      const taskMap = new Map<string, Task>();
      [...normalizedProjectTasks, ...mineActivities, ...assignedActivities].forEach((item) => {
        if (item && item.id && !deletedSet.has(item.id)) taskMap.set(item.id, item);
      });

      const allTasks = Array.from(taskMap.values()).sort((a, b) => getTaskTimestamp(b) - getTaskTimestamp(a));
      setTasks(allTasks);
      setHabits(nextHabits);
      setCatalog(nextCatalog);
      setReminders(nextReminders);
      setLists(nextLists);
      setAssignableUsers(nextAssignables);
      void syncAllTaskNotifications(allTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync your workspace");
    }
  }, [token]);

  const deleteTask = async (taskId: string) => {
    if (!token) return;
    const target = tasks.find((t) => t.id === taskId);
    if (target?.source === "activity") {
      await api(`/activities/${taskId}/cancel`, { method: "PATCH", body: JSON.stringify({}) }, token).catch(() => {});
    } else {
      await api(`/tasks/${taskId}`, { method: "DELETE" }, token).catch(() => {});
    }

    const rawSaved = await storage.getItem<any>("ticktrack_deleted_task_ids", []);
    const existing: string[] = Array.isArray(rawSaved) ? rawSaved : typeof rawSaved === "string" ? JSON.parse(rawSaved) : [];
    const updatedDeleted = Array.from(new Set([...existing, taskId]));
    await storage.setItem("ticktrack_deleted_task_ids", JSON.stringify(updatedDeleted));

    setTasks((current) => current.filter((item) => item.id !== taskId));
    void cancelTaskNotification(taskId);
    void refreshReminders();
  };

  useEffect(() => {
    let active = true;
    (async () => {
      void initAppTheme();
      void requestNotificationPermissions();
      const [savedToken, seenOnboarding, savedProfile, savedLoginDate] = await Promise.all([
        storage.secureGet("ticktrack_token", null),
        storage.getItem("ticktrack_onboarded", false),
        storage.getItem<any>("ticktrack_user_profile", null),
        storage.getItem<string | null>("ticktrack_login_date", null),
      ]);
      if (!active) return;
      setOnboarded(Boolean(seenOnboarding));
      if (savedProfile) {
        setUser(typeof savedProfile === "string" ? JSON.parse(savedProfile) : savedProfile);
      }
      const todayStr = getTodayDateString();
      if (savedToken) {
        if (savedLoginDate && savedLoginDate !== todayStr) {
          await storage.secureRemove("ticktrack_token");
          await storage.removeItem("ticktrack_login_date");
          setLoading(false);
          return;
        }
        try {
          const nextUser = await api<User>("/auth/me", {}, String(savedToken)).catch(() => null);
          if (!active) return;
          setToken(String(savedToken));
          await storage.setItem("ticktrack_login_date", todayStr);
          const parsedSaved = savedProfile ? (typeof savedProfile === "string" ? JSON.parse(savedProfile) : savedProfile) : null;
          const mergedUser: User = {
            ...(parsedSaved || {}),
            ...(nextUser || {}),
          };
          if (mergedUser.email || mergedUser.id) {
            setUser(mergedUser as User);
          }
        } catch {
          await storage.secureRemove("ticktrack_token");
          await storage.removeItem("ticktrack_login_date");
        }
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => { if (token) void refresh(); }, [token, refresh]);

  // Midnight auto-logout timer: triggers logout at 12:00 AM local time
  useEffect(() => {
    if (!token) return;
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const msUntilMidnight = Math.max(tomorrow.getTime() - now.getTime(), 1000);
    const timer = setTimeout(() => {
      void signOut();
    }, msUntilMidnight);
    return () => clearTimeout(timer);
  }, [token]);

  const signIn = async (email: string, password: string) => {
    setError(null);
    const result = await postJson<{ access_token?: string; token?: string; user: User }>("/auth/login", { email, password });
    const tokenReceived = result.access_token || result.token || (result as any).accessToken;
    if (!tokenReceived) {
      throw new Error("Authentication failed: No token received from server");
    }
    await storage.secureSet("ticktrack_token", tokenReceived);
    await storage.setItem("ticktrack_login_date", getTodayDateString());
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
    await storage.secureRemove("ticktrack_token");
    await storage.removeItem("ticktrack_login_date");
    // Cancel all pending notifications so they don't fire / re-duplicate on next sign-in
    try {
      const Notifications = require("expo-notifications");
      if (Notifications?.cancelAllScheduledNotificationsAsync) {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch {}
    setToken(null); setUser(null); setTasks([]); setHabits([]); setReminders([]); setLists([]);
  };

  const markOnboarded = async () => { await storage.setItem("ticktrack_onboarded", true); setOnboarded(true); };

  const refreshReminders = useCallback(async () => {
    if (!token) return;
    try {
      const next = await api<Reminder[]>("/reminders/due", {}, token);
      setReminders(next);
    } catch {
      /* silent; refresh() will surface errors */
    }
  }, [token]);

  const addTask = async (payload: Record<string, unknown>) => {
    if (!token) return;
    const isProjectList = payload.list_id && payload.list_id !== "inbox" && payload.list_id !== "personal" && payload.list_id !== "work";

    if (isProjectList) {
      const priorityMap: Record<string, string> = {
        low: "LOW",
        medium: "MEDIUM",
        high: "HIGH",
        critical: "CRITICAL",
        none: "MEDIUM",
      };
      const rawPriority = String(payload.priority ?? "medium").toLowerCase();
      const formattedPriority = priorityMap[rawPriority] ?? "MEDIUM";

      const body: Record<string, unknown> = {
        title: String(payload.title),
        projectId: String(payload.list_id),
        priority: formattedPriority,
        ...(payload.notes ? { description: String(payload.notes) } : {}),
        ...(payload.due_date ? { endDate: toIsoTimestamp(String(payload.due_date)) } : {}),
        ...(payload.assignee_id ? { assigneeId: String(payload.assignee_id) } : payload.assigneeId ? { assigneeId: String(payload.assigneeId) } : {}),
      };

      const createdRaw = await postJson<any>("/tasks", body, token);
      const created = normalizeTask(createdRaw);
      setTasks((current) => [created, ...current]);
      void scheduleTaskNotification(created);
    } else {
      const dueStr = payload.due_date ? String(payload.due_date) : null;
      const hasTime = Boolean(dueStr && dueStr.includes("T"));
      const startAt = dueStr ? (hasTime ? toIsoTimestamp(dueStr) : `${dueStr}T12:00:00.000Z`) : new Date().toISOString();
      const endAt = dueStr ? (hasTime ? toIsoTimestamp(dueStr) : `${dueStr}T18:00:00.000Z`) : new Date(Date.now() + 3600000).toISOString();

      const body: Record<string, unknown> = {
        name: String(payload.title),
        ...(payload.notes ? { description: String(payload.notes) } : {}),
        startAt,
        endAt,
        allDay: !hasTime,
        ...(payload.assignee_id ? { assigneeIds: [String(payload.assignee_id)] } : payload.assigneeId ? { assigneeIds: [String(payload.assigneeId)] } : {}),
      };

      const createdRaw = await postJson<any>("/activities", body, token);
      const created = normalizeActivity(createdRaw);
      setTasks((current) => [created, ...current]);
      void scheduleTaskNotification(created);
    }

    await refresh();
  };

  const toggleTask = async (task: Task) => {
    if (!token) return;
    const newCompleted = !task.completed;
    if (task.source === "activity") {
      const path = newCompleted ? `/activities/${task.id}/complete` : `/activities/${task.id}/status`;
      const body = newCompleted ? {} : { status: "PENDING" };
      await api<any>(path, { method: "PATCH", body: JSON.stringify(body) }, token).catch(() => null);
    } else {
      const newStatus = newCompleted ? "COMPLETED" : "WIP";
      await api<any>(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus, progressPct: newCompleted ? 100 : 0 }) }, token).catch(() => null);
    }
    const updatedTask = { ...task, completed: newCompleted };
    setTasks((current) => current.map((item) => item.id === task.id ? updatedTask : item));
    if (newCompleted) {
      void cancelTaskNotification(task.id);
    } else {
      void scheduleTaskNotification(updatedTask);
    }
    void refreshReminders();
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

  const value = useMemo(() => ({ token, user, tasks, habits, catalog, reminders, lists, assignableUsers, loading, onboarded, error, signIn, signOut, markOnboarded, addTask, toggleTask, deleteTask, dismissReminder, addHabit, toggleHabit, addList, deleteList, reorderLists, updateUser, refresh }), [token, user, tasks, habits, catalog, reminders, lists, assignableUsers, loading, onboarded, error, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
