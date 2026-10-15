import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, postJson } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { getTaskTimestamp } from "@/src/utils/date-utils";
import { requestNotificationPermissions, scheduleTaskNotification, cancelTaskNotification, syncAllTaskNotifications, cancelAllTaskNotifications, registerForPushNotificationsAsync, Notifications } from "@/src/utils/notification-service";
import type { AppNotification, AssignableUser, CatalogHabit, Habit, Reminder, Task, TaskAction, TaskList, UpdateTaskPayload, User } from "@/src/types";

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
  loading: boolean;
  onboarded: boolean;
  error: string | null;
  signIn: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  markOnboarded: () => Promise<void>;
  addTask: (payload: Record<string, unknown>) => Promise<void>;
  editTask: (task: Task, payload: UpdateTaskPayload) => Promise<void>;
  toggleTask: (task: Task) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  postponeTask: (task: Task, payload: { endDate: string; startDate?: string; startTime?: string; endTime?: string; remarks?: string }) => Promise<void>;
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
    completed: raw.completed ?? raw.status === "COMPLETED",
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
  const isCompleted = act.status === "COMPLETED";

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
    due_date: dateStr,
    startAt: startIso,
    endAt: endIso,
    window: act.window ?? null,
    postponeCount: act.postponeCount ?? 0,
    priority: "medium",
    completed: isCompleted,
    list_id: "inbox",
    assigneeId: uniqueActAssigneeIds[0] || null,
    assigneeIds: uniqueActAssigneeIds,
    assignees: normalizedAssignees.length > 0 ? normalizedAssignees : null,
    assigneeName: assigneeName || null,
    source: "activity",
    created_at: act.createdAt ?? new Date().toISOString(),
    createdById: act.createdById ?? creatorUser?.id ?? null,
    createdBy: creatorUser,
    createdByName: creatorName,
    actions,
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      const [rawTasks, mineRes, assignedRes, nextHabits, nextCatalog, nextReminders, nextLists, nextAssignables, nextAlerts, savedDeletedIds] = await Promise.all([
        api<any[]>("/tasks", {}, token).catch(() => []),
        api<{ data?: any[] }>("/activities/mine?limit=100", {}, token).catch(() => ({ data: [] })),
        api<{ data?: any[] }>("/activities/assigned?limit=100", {}, token).catch(() => ({ data: [] })),
        api<Habit[]>("/habits", {}, token).catch(() => []),
        api<CatalogHabit[]>("/habits/catalog").catch(() => []),
        api<Reminder[]>("/reminders/due", {}, token).catch(() => []),
        api<TaskList[]>("/lists", {}, token).catch(() => []),
        api<AssignableUser[]>("/users/assignable", {}, token).catch(() => []),
        api<AppNotification[]>("/user-alerts?limit=50", {}, token).catch(() => []),
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
      setNotifications(Array.isArray(nextAlerts) ? nextAlerts : []);
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

  // Listen for push notification interactions (tap / receive)
  useEffect(() => {
    if (!Notifications?.addNotificationResponseReceivedListener) return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response?.notification?.request?.content?.data;
      if (data && token) {
        void refresh();
      }
    });
    return () => {
      subscription?.remove?.();
    };
  }, [token, refresh]);

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
    if (token) {
      void api("/user-alerts/push-token", {
        method: "PUT",
        body: JSON.stringify({ pushToken: null }),
      }, token).catch(() => {});
    }
    await storage.secureRemove("ticktrack_token");
    await storage.removeItem("ticktrack_login_date");
    // Cancel all pending notifications so they don't fire / re-duplicate on next sign-in
    await cancelAllTaskNotifications();
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

    const assigneeIdsPayload: string[] = Array.isArray(payload.assigneeIds)
      ? (payload.assigneeIds as any[]).map(String).filter(Boolean)
      : payload.assignee_id
        ? [String(payload.assignee_id)]
        : payload.assigneeId
          ? [String(payload.assigneeId)]
          : [];

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
        ...(assigneeIdsPayload.length
          ? {
              assigneeId: assigneeIdsPayload[0],
              assigneeIds: assigneeIdsPayload,
            }
          : {}),
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
        ...(assigneeIdsPayload.length ? { assigneeIds: assigneeIdsPayload } : {}),
      };

      const createdRaw = await postJson<any>("/activities", body, token);
      const created = normalizeActivity(createdRaw);
      setTasks((current) => [created, ...current]);
      void scheduleTaskNotification(created);
    }

    await refresh();
  };

  const editTask = async (task: Task, payload: UpdateTaskPayload) => {
    if (!token) return;
    try {
      if (task.source === "activity") {
        const body: Record<string, unknown> = {};
        if (payload.title !== undefined) body.name = payload.title.trim();
        if (payload.notes !== undefined) body.description = payload.notes.trim();
        if (payload.assigneeIds !== undefined) body.assigneeIds = payload.assigneeIds;
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
          setTasks((current) => current.map((t) => (t.id === task.id ? updated : t)));
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
    } finally {
      await refresh();
    }
  };

  const toggleTask = async (task: Task) => {
    if (!token) return;
    const newCompleted = !task.completed;
    let updatedTaskObj: Task | null = null;
    try {
      if (task.source === "activity") {
        const path = newCompleted ? `/activities/${task.id}/complete` : `/activities/${task.id}/status`;
        const body = newCompleted ? {} : { status: "PENDING" };
        const res = await api<any>(path, { method: "PATCH", body: JSON.stringify(body) }, token);
        if (res) {
          updatedTaskObj = normalizeActivity(res);
        }
      } else {
        const newStatus = newCompleted ? "COMPLETED" : "WIP";
        const res = await api<any>(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus, progressPct: newCompleted ? 100 : 0 }) }, token);
        if (res) {
          updatedTaskObj = normalizeTask(res);
        }
      }
    } catch (err) {
      console.warn("toggleTask failed", err);
    }

    const fallbackUpdated = { ...task, completed: newCompleted };
    const finalTask = updatedTaskObj ?? fallbackUpdated;
    setTasks((current) => current.map((item) => (item.id === task.id ? finalTask : item)));
    if (newCompleted) {
      void cancelTaskNotification(task.id);
    } else {
      void scheduleTaskNotification(finalTask);
    }
    void refreshReminders();
    await refresh();
  };

  const postponeTask = async (
    task: Task,
    payload: { endDate: string; startDate?: string; startTime?: string; endTime?: string; remarks?: string }
  ) => {
    if (!token) return;
    const { endDate, remarks } = payload;
    const startDate = payload.startDate || endDate;

    let origStartTime = payload.startTime;
    let origEndTime = payload.endTime;
    if (!origStartTime && task.startAt && task.startAt.includes("T")) {
      origStartTime = task.startAt.split("T")[1]?.slice(0, 5);
    }
    if (!origEndTime && task.endAt && task.endAt.includes("T")) {
      origEndTime = task.endAt.split("T")[1]?.slice(0, 5);
    }

    const startAt = toIsoDateTime(startDate, origStartTime || "09:00") || `${startDate}T09:00:00.000Z`;
    const endAt = toIsoDateTime(endDate, origEndTime || "18:00", true) || `${endDate}T18:00:00.000Z`;

    if (task.source === "activity") {
      const res = await api<any>(
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
      ).catch(() => null);
      if (res) {
        const norm = normalizeActivity(res);
        setTasks((current) => current.map((item) => (item.id === task.id ? norm : item)));
      }
    } else {
      const res = await api<any>(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            startDate: startAt,
            endDate: endAt,
          }),
        },
        token
      ).catch(() => null);
      if (res) {
        const norm = normalizeTask(res);
        setTasks((current) => current.map((item) => (item.id === task.id ? norm : item)));
      }
    }

    await refresh();
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
      loading,
      onboarded,
      error,
      refresh,
    ]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
