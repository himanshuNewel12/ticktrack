import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { addDays, formatDistanceToNow, isBefore, isSameDay, parseISO, startOfDay, format } from "date-fns";
import { router } from "expo-router";
import { FollowingView } from "@/src/components/following-view";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { ActivityIndicator, Alert, Animated, ColorValue, Image, Modal, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Share, Switch, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const isImageUri = (url?: string | null) => {
  if (!url) return false;
  return url.startsWith("file://") || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:");
};

import * as Haptics from "expo-haptics";
import { SkeletonTaskList } from "@/src/components/skeleton-task-card";
import { Fab } from "@/src/components/fab";
import { ClockWidget } from "@/src/components/clock-widget";
import { TaskComposer, type ComposerKind } from "@/src/components/task-composer";
import { ConfirmDeleteModal } from "@/src/components/confirm-delete-modal";
import { ConfirmSignOutModal } from "@/src/components/confirm-sign-out-modal";
import { TaskDetailModal } from "@/src/components/task-detail-modal";
import { TaskEditModal } from "@/src/components/task-edit-modal";
import { NotificationsModal } from "@/src/components/notifications-modal";
import { PostponeActivityModal } from "@/src/components/postpone-activity-modal";
import { useApp } from "@/src/app-context";
import { makeStyles, useTheme } from "@/src/theme";
import type { Reminder, Task, TaskList } from "@/src/types";
import { playPopSound } from "@/src/utils/sound";
import { parseTaskDate, getTaskTimestamp, getUpcomingTaskTimestamp, formatTaskDueDateDisplay } from "@/src/utils/date-utils";

type LooseIconProps = { name: string; size: number; color?: ColorValue; style?: any };
const Ionicons = BaseIonicons as unknown as ComponentType<LooseIconProps>;

const REMINDER_LABELS: Record<string, string> = {
  on_due: "At due time",
  "1_hour_before": "1 hour before",
  "1_day_before": "1 day before",
  "3_days_before": "3 days before",
};
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

type SmartKey = "today" | "tomorrow" | "next7" | "all" | "recurring" | "completed";
type SmartList = { key: SmartKey; label: string; icon: string; hint: string; empty: { title: string; copy: string } };

const SMART_LISTS: SmartList[] = [
  { key: "today", label: "Today", icon: "sunny-outline", hint: "Due today & overdue", empty: { title: "You're all clear for today", copy: "Enjoy the calm or capture a fresh idea." } },
  { key: "tomorrow", label: "Tomorrow", icon: "partly-sunny-outline", hint: "Due tomorrow", empty: { title: "Nothing lined up tomorrow", copy: "A soft landing awaits." } },
  { key: "next7", label: "Next 7 Days", icon: "calendar-outline", hint: "Due in the next week", empty: { title: "A gentle week ahead", copy: "Plan what matters when you're ready." } },
  { key: "completed", label: "Completed", icon: "checkmark-done-outline", hint: "Recently finished", empty: { title: "No wins yet", copy: "Every finished task will land here." } },
];

type Selection = { kind: "smart"; key: SmartKey } | { kind: "list"; id: string };

const getTaskAssigneeIds = (t: Task): string[] => {
  const ids = new Set<string>();
  if (Array.isArray(t.assigneeIds)) {
    for (const id of t.assigneeIds) {
      if (id) ids.add(String(id));
    }
  }
  if (Array.isArray(t.assignees)) {
    for (const a of t.assignees) {
      const aid = a?.id ?? (a as any)?.userId;
      if (aid) ids.add(String(aid));
    }
  }
  if (t.assigneeId) ids.add(String(t.assigneeId));
  if (t.assignee_id) ids.add(String(t.assignee_id));
  if (t.assignee?.id) ids.add(String(t.assignee.id));
  return Array.from(ids);
};

const EXPANDED_PAGE = 30;

export default function TasksScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    user,
    tasks,
    reminders,
    lists,
    assignableUsers,
    toggleTask,
    deleteTask,
    editTask,
    postponeTask,
    dismissReminder,
    signOut,
    deleteList,
    notifications,
    unreadNotificationCount,
    todayAttendance,
    refresh,
    loading,
    loadEscalations,
    escalateTask,
  } = useApp();
  const [clockModal, setClockModal] = useState(false);
  const [composer, setComposer] = useState<ComposerKind | null>(null);
  const inboxList = useMemo(() => lists.find((item) => item.system), [lists]);
  const [selection, setSelection] = useState<Selection>({ kind: "smart", key: "today" });
  const [allDatesScope, setAllDatesScope] = useState<"all" | "mine" | "other">("mine");
  const [selectedOtherAssignee, setSelectedOtherAssignee] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  // "Informed & Escalations" is a view inside this screen so it shares the header and sidebar.
  const [showFollowing, setShowFollowing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsModal, setNotificationsModal] = useState(false);

  // Tasks where I am an escalator. They are not part of `tasks`, so they are fetched on their
  // own and shown as an Escalations section in the Today and Next 7 Days views.
  const [escalationTasks, setEscalationTasks] = useState<Task[]>([]);
  // Collapse / "view more" are remembered per view (keyed by selection) instead of reset in an effect.
  const [escalationsCollapsedFor, setEscalationsCollapsedFor] = useState<string | null>(null);
  const [escalationsExpandedFor, setEscalationsExpandedFor] = useState<string | null>(null);
  const [escalationDetail, setEscalationDetail] = useState<Task | null>(null);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  // Ref so the effects below don't re-run every time the context value is rebuilt.
  const loadEscalationsRef = useRef(loadEscalations);
  useEffect(() => {
    loadEscalationsRef.current = loadEscalations;
  }, [loadEscalations]);
  const showsEscalations =
    !showFollowing && selection.kind === "smart" && (selection.key === "today" || selection.key === "next7");

  const reloadEscalations = useCallback(async () => {
    setEscalationTasks(await loadEscalationsRef.current());
  }, []);

  useEffect(() => {
    if (!showsEscalations || !user?.id) return;
    void reloadEscalations();
    const timer = setInterval(() => void reloadEscalations(), 20000);
    return () => clearInterval(timer);
  }, [showsEscalations, user?.id, reloadEscalations]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), showsEscalations ? reloadEscalations() : Promise.resolve()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, showsEscalations, reloadEscalations]);

  // Periodic background refresh every 20s so new tasks from planner frontend appear automatically
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Menu action modals
  const [filterModal, setFilterModal] = useState(false);
  const [viewOptionsModal, setViewOptionsModal] = useState(false);
  const [arrangeModal, setArrangeModal] = useState(false);
  const [employeeSearchModal, setEmployeeSearchModal] = useState(false);

  // Filters & Arrange state
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [arrangeBy, setArrangeBy] = useState<"due_date" | "priority" | "title" | "created">("created");

  // Next 7 Days is a date-range view: default to due date ascending whenever it is opened
  const selectionKey = selection.kind === "smart" ? selection.key : `list:${selection.id}`;
  useEffect(() => {
    if (selectionKey === "next7") setArrangeBy("due_date");
  }, [selectionKey]);

  // View Options state
  const [showOverdueSection, setShowOverdueSection] = useState(true);
  const [showTodaySection, setShowTodaySection] = useState(true);
  const [showCompletedSection, setShowCompletedSection] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [showTime, setShowTime] = useState(true);

  const displayName = useMemo(() => {
    if (!user) return "User";
    if (user.name && user.name.trim() && user.name !== "Preview") return user.name.trim();
    const full = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
    if (full) return full;
    if (user.email) {
      const handle = user.email.split("@")[0];
      return handle.charAt(0).toUpperCase() + handle.slice(1);
    }
    return "User";
  }, [user]);

  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const detailTask = useMemo(() => tasks.find((t) => t.id === detailTaskId) ?? null, [tasks, detailTaskId]);
  const setDetailTask = useCallback((t: Task | null) => setDetailTaskId(t ? t.id : null), []);
  const canDeleteTask = useCallback(
    (t: Task) =>
      Boolean(
        user?.id &&
          (t.createdById === user.id ||
            t.createdBy?.id === user.id ||
            t.assignedById === user.id ||
            user.role === "ADMIN")
      ),
    [user]
  );
  const [editModalTask, setEditModalTask] = useState<Task | null>(null);
  const [postponeModalTask, setPostponeModalTask] = useState<Task | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; taskId: string | null; action: "completed" | "restored" }>({ visible: false, taskId: null, action: "completed" });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSeeOtherTasks = user?.role === "ADMIN" || user?.role === "TL" || user?.role === "PM";

  const isTaskMine = useCallback(
    (t: Task) => {
      if (!user?.id) return true;
      const ids = getTaskAssigneeIds(t);
      if (ids.length > 0) {
        return ids.includes(user.id);
      }
      return Boolean(t.createdById === user.id || t.createdBy?.id === user.id);
    },
    [user?.id]
  );

  const hasOtherAssignee = useCallback(
    (t: Task) => {
      if (!user?.id) return false;
      const ids = getTaskAssigneeIds(t);
      if (ids.length > 0) {
        return ids.some((id) => id !== user.id);
      }
      if (t.createdById && t.createdById !== user.id) return true;
      if (t.createdBy?.id && t.createdBy.id !== user.id) return true;
      if (t.assigneeName && (!user.name || t.assigneeName !== user.name)) return true;
      return false;
    },
    [user?.id, user?.name]
  );

  const isTaskOther = useCallback(
    (t: Task) => {
      if (!user?.id) return false;
      if (!hasOtherAssignee(t)) return false;

      if (selectedOtherAssignee) {
        const ids = getTaskAssigneeIds(t);
        if (ids.includes(selectedOtherAssignee)) return true;

        const name = t.assignee ? `${t.assignee.firstName ?? ""} ${t.assignee.lastName ?? ""}`.trim() : t.assigneeName;
        if (name === selectedOtherAssignee) return true;

        if (Array.isArray(t.assignees) && t.assignees.some((a) => a.id === selectedOtherAssignee || a.name === selectedOtherAssignee)) {
          return true;
        }

        const creatorName = t.createdBy ? `${t.createdBy.firstName ?? ""} ${t.createdBy.lastName ?? ""}`.trim() : t.createdByName;
        if (t.createdById === selectedOtherAssignee || t.createdBy?.id === selectedOtherAssignee || creatorName === selectedOtherAssignee) {
          return true;
        }

        if (t.assignedById === selectedOtherAssignee || t.assignedByName === selectedOtherAssignee) {
          return true;
        }

        return false;
      }

      return true;
    },
    [user?.id, selectedOtherAssignee, hasOtherAssignee]
  );

  const otherAssignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const t of tasks) {
      if (t.completed) continue;
      if (!isTaskInSmartWindow(t, selection)) continue;
      if (!hasOtherAssignee(t)) continue;

      const assignedList: { id: string; name: string }[] = [];
      const seenForThisTask = new Set<string>();

      if (Array.isArray(t.assignees) && t.assignees.length > 0) {
        for (const a of t.assignees) {
          const aid = a?.id ?? (a as any)?.userId;
          if (!aid || aid === user?.id || seenForThisTask.has(aid)) continue;
          seenForThisTask.add(aid);
          assignedList.push({ id: aid, name: a.name || a.email || "Unknown" });
        }
      }

      if (Array.isArray(t.assigneeIds) && t.assigneeIds.length > 0) {
        for (const aid of t.assigneeIds) {
          if (!aid || aid === user?.id || seenForThisTask.has(aid)) continue;
          seenForThisTask.add(aid);
          const u = assignableUsers.find((usr) => usr.id === aid);
          const name = u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : "Unknown";
          assignedList.push({ id: aid, name });
        }
      }

      if (t.assignee && t.assignee.id && t.assignee.id !== user?.id && !seenForThisTask.has(t.assignee.id)) {
        seenForThisTask.add(t.assignee.id);
        const name = `${t.assignee.firstName ?? ""} ${t.assignee.lastName ?? ""}`.trim() || t.assignee.email || t.assigneeName || "Unknown";
        assignedList.push({ id: t.assignee.id, name });
      }

      const singleAid = t.assigneeId || t.assignee_id;
      if (singleAid && singleAid !== user?.id && !seenForThisTask.has(singleAid)) {
        seenForThisTask.add(singleAid);
        const u = assignableUsers.find((usr) => usr.id === singleAid);
        const name = u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : t.assigneeName || "Unknown";
        assignedList.push({ id: singleAid, name });
      }

      if (assignedList.length === 0 && t.assigneeName && (!user?.name || t.assigneeName !== user.name)) {
        assignedList.push({ id: t.assigneeName, name: t.assigneeName });
      }

      if (assignedList.length === 0 && t.createdById && t.createdById !== user?.id) {
        const creatorName = (t.createdBy ? `${t.createdBy.firstName ?? ""} ${t.createdBy.lastName ?? ""}`.trim() || t.createdBy.email : t.createdByName) || "Unknown";
        assignedList.push({ id: t.createdById, name: creatorName });
      }

      for (const a of assignedList) {
        const existing = map.get(a.id);
        if (existing) {
          existing.count++;
        } else {
          map.set(a.id, { id: a.id, name: a.name, count: 1 });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, user?.id, user?.name, assignableUsers, selection, hasOtherAssignee]);

  const activeListDoc = selection.kind === "list" ? lists.find((item) => item.id === selection.id) : null;
  const activeSmart = selection.kind === "smart" ? SMART_LISTS.find((item) => item.key === selection.key) : null;
  const headerTitle = useMemo(() => {
    if (selection.kind === "list") return activeListDoc?.name ?? "Tasks";
    if (selection.key === "today" || selection.key === "tomorrow" || selection.key === "next7") {
      if (canSeeOtherTasks && allDatesScope === "other" && selectedOtherAssignee) {
        const found = otherAssignees.find(
          (a) => a.id === selectedOtherAssignee || a.name === selectedOtherAssignee
        );
        return found?.name ?? selectedOtherAssignee;
      }
      return selection.key === "today" ? "Today" : activeSmart?.label ?? "Tasks";
    }
    if (selection.key === "all") {
      if (canSeeOtherTasks && allDatesScope === "other" && selectedOtherAssignee) {
        const found = otherAssignees.find(
          (a) => a.id === selectedOtherAssignee || a.name === selectedOtherAssignee
        );
        return found?.name ?? selectedOtherAssignee;
      }
      return "All Tasks";
    }
    if (selection.key === "recurring") return "Recurring";
    return activeSmart?.label ?? "Tasks";
  }, [selection, activeListDoc, activeSmart, canSeeOtherTasks, allDatesScope, selectedOtherAssignee, otherAssignees]);

  const { assignedToMeCount, otherCount } = useMemo(() => {
    let mine = 0;
    let other = 0;
    for (const t of tasks) {
      if (t.completed) continue;
      if (!isTaskInSmartWindow(t, selection)) continue;
      if (isTaskMine(t)) {
        mine++;
      }
      if (hasOtherAssignee(t)) {
        other++;
      }
    }
    return { assignedToMeCount: mine, otherCount: other };
  }, [tasks, selection, isTaskMine, hasOtherAssignee]);

  const composerDefaultAssigneeIds = useMemo(() => {
    return [];
  }, []);

  const activeTasks = useMemo(() => {
    let result = filterActiveTasks(tasks, selection, user?.id);

    // If not ADMIN or TL, always force "mine"
    const effectiveScope = canSeeOtherTasks ? allDatesScope : "mine";

    if (effectiveScope === "mine") {
      result = result.filter(isTaskMine);
    } else if (effectiveScope === "other") {
      result = result.filter(isTaskOther);
    }

    // Filter by Priority
    if (filterPriority !== "all") {
      result = result.filter((t) => (t.priority || "none").toLowerCase() === filterPriority);
    }

    // Filter by Assignee
    if (filterAssignee !== "all") {
      result = result.filter((t) => {
        const name = t.assignee ? `${t.assignee.firstName ?? ""} ${t.assignee.lastName ?? ""}`.trim() : t.assigneeName;
        const matchesId =
          t.assigneeId === filterAssignee ||
          t.assignee_id === filterAssignee ||
          t.assignee?.id === filterAssignee ||
          getTaskAssigneeIds(t).includes(filterAssignee);
        const matchesName =
          name === filterAssignee ||
          (Array.isArray(t.assignees) && t.assignees.some((a) => a.name === filterAssignee));
        return matchesName || matchesId;
      });
    }

    // Overdue tasks should always appear on top
    const sortWithOverdueOnTop = (arr: Task[], compareFn: (a: Task, b: Task) => number) => {
      return [...arr].sort((a, b) => {
        const aOver = isTaskOverdue(a);
        const bOver = isTaskOverdue(b);
        if (aOver && !bOver) return -1;
        if (!aOver && bOver) return 1;
        return compareFn(a, b);
      });
    };

    // Arrange / Sort
    if (arrangeBy === "priority") {
      const pRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
      result = sortWithOverdueOnTop(result, (a, b) => (pRank[(b.priority || "none").toLowerCase()] ?? 0) - (pRank[(a.priority || "none").toLowerCase()] ?? 0));
    } else if (arrangeBy === "title") {
      result = sortWithOverdueOnTop(result, (a, b) => a.title.localeCompare(b.title));
    } else if (arrangeBy === "created") {
      result = sortWithOverdueOnTop(result, (a, b) => getTaskTimestamp(b) - getTaskTimestamp(a));
    } else {
      result = sortWithOverdueOnTop(result, (a, b) => getUpcomingTaskTimestamp(a) - getUpcomingTaskTimestamp(b));
    }

    return result;
  }, [
    tasks,
    selection,
    user?.id,
    canSeeOtherTasks,
    allDatesScope,
    isTaskMine,
    isTaskOther,
    filterPriority,
    filterAssignee,
    arrangeBy,
  ]);

  const { overdueTasks, regularTasks } = useMemo(() => {
    if (selection.kind === "smart" && selection.key === "completed") {
      return { overdueTasks: [], regularTasks: activeTasks };
    }
    const overdue: Task[] = [];
    const regular: Task[] = [];
    for (const t of activeTasks) {
      if (isTaskOverdue(t)) {
        overdue.push(t);
      } else {
        regular.push(t);
      }
    }
    return { overdueTasks: overdue, regularTasks: regular };
  }, [activeTasks, selection]);

  const completedTasks = useMemo(() => {
    let result = filterCompletedTasks(tasks, selection);
    const effectiveScope = canSeeOtherTasks ? allDatesScope : "mine";
    if (effectiveScope === "mine") {
      result = result.filter(isTaskMine);
    } else if (effectiveScope === "other") {
      result = result.filter(isTaskOther);
    }
    return result;
  }, [tasks, selection, canSeeOtherTasks, allDatesScope, isTaskMine, isTaskOther]);

  // For Today view: Today's tasks and Completed Marked Today
  const todayTasks = useMemo(() => {
    if (selection.kind === "smart" && selection.key === "today") {
      return regularTasks.filter(isTaskForToday);
    }
    return regularTasks;
  }, [regularTasks, selection]);

  const completedTodayTasks = useMemo(() => {
    let result = tasks.filter(isTaskCompletedToday);
    const effectiveScope = canSeeOtherTasks ? allDatesScope : "mine";

    if (selection.kind === "smart" && selection.key === "today") {
      if (effectiveScope === "mine") {
        result = result.filter(isTaskMine);
      } else if (effectiveScope === "other") {
        result = result.filter(isTaskOther);
      }
    }
    return result;
  }, [tasks, selection, canSeeOtherTasks, allDatesScope, isTaskMine, isTaskOther]);

  // Expanded sections render in pages so hundreds of cards never mount at once.
  const [expandedCount, setExpandedCount] = useState(EXPANDED_PAGE);
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [showAllRegular, setShowAllRegular] = useState(false);
  const [showAllToday, setShowAllToday] = useState(false);
  const [showAllCompletedToday, setShowAllCompletedToday] = useState(false);

  useEffect(() => {
    setShowAllOverdue(false);
    setShowAllRegular(false);
    setShowAllToday(false);
    setShowAllCompletedToday(false);
  }, [selection, allDatesScope, selectedOtherAssignee]);

  // Default open rule for Today view:
  // Overdue and Today stay open by default; Completed is collapsed by default
  useEffect(() => {
    if (selection.kind === "smart" && selection.key === "today") {
      setShowOverdueSection(true);
      setShowTodaySection(true);
      setShowCompletedSection(false);
    }
  }, [selection, allDatesScope, selectedOtherAssignee]);

  useEffect(() => {
    if (!showAllOverdue && !showAllRegular && !showAllToday && !showAllCompletedToday) setExpandedCount(EXPANDED_PAGE);
  }, [showAllOverdue, showAllRegular, showAllToday, showAllCompletedToday]);

  const displayedOverdueTasks = useMemo(() => {
    return showAllOverdue ? overdueTasks.slice(0, expandedCount) : overdueTasks.slice(0, 5);
  }, [overdueTasks, showAllOverdue, expandedCount]);

  const displayedRegularTasks = useMemo(() => {
    return showAllRegular ? regularTasks.slice(0, expandedCount) : regularTasks.slice(0, 5);
  }, [regularTasks, showAllRegular, expandedCount]);

  const displayedTodayTasks = useMemo(() => {
    return showAllToday ? todayTasks.slice(0, expandedCount) : todayTasks.slice(0, 5);
  }, [todayTasks, showAllToday, expandedCount]);

  const displayedCompletedTodayTasks = useMemo(() => {
    return showAllCompletedToday ? completedTodayTasks.slice(0, expandedCount) : completedTodayTasks.slice(0, 5);
  }, [completedTodayTasks, showAllCompletedToday, expandedCount]);

  // Pending escalation tasks inside the active view's date window, earliest due first.
  const escalationSectionTasks = useMemo(() => {
    if (!showsEscalations || selection.kind !== "smart") return [];
    const inWindow =
      selection.key === "today" ? (t: Task) => isTaskOverdue(t) || isTaskForToday(t) : isTaskForNext7Days;
    const due = (t: Task) => parseTaskDate(t.due_date ?? "")?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return escalationTasks
      .filter((t) => !t.completed && String(t.status || "PENDING").toUpperCase() === "PENDING" && inWindow(t))
      .sort((a, b) => due(a) - due(b));
  }, [escalationTasks, showsEscalations, selection]);

  const showEscalationSection = escalationsCollapsedFor !== selectionKey;
  const showAllEscalations = escalationsExpandedFor === selectionKey;
  const displayedEscalationTasks = showAllEscalations ? escalationSectionTasks : escalationSectionTasks.slice(0, 5);

  const confirmEscalate = (task: Task) => {
    Alert.alert("Escalate task", `Notify the creator and assignees that "${task.title}" needs attention?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Escalate",
        style: "destructive",
        onPress: async () => {
          setEscalatingId(task.id);
          try {
            await escalateTask(task);
            await reloadEscalations();
            Alert.alert("Escalated", "The task owners have been notified.");
          } catch (err: any) {
            Alert.alert("Could not escalate", err?.message || "Please try again.");
          } finally {
            setEscalatingId(null);
          }
        },
      },
    ]);
  };

  const handleShareList = async () => {
    setMenu(false);
    try {
      const itemsText = activeTasks.length
        ? activeTasks
            .map((t, idx) => `${idx + 1}. [ ] ${t.title}${t.due_date ? ` (${formatTaskDueDateDisplay(t.due_date)})` : ""}`)
            .join("\n")
        : "No tasks in this list.";
      const msg = `📋 ${headerTitle} (${activeTasks.length} tasks)\n\n${itemsText}\n\nShared via TickTrack`;
      await Share.share({
        message: msg,
        title: `${headerTitle} - Tasks`,
      });
    } catch {}
  };

  const firedReminders = useMemo(() => reminders.filter((item) => item.fired).slice(0, 3), [reminders]);
  const listCounts = useMemo(() => {
    const map: Record<string, number> = {};
    const effectiveScope = canSeeOtherTasks ? allDatesScope : "mine";
    const scopedTasks = effectiveScope === "mine"
      ? tasks.filter(isTaskMine)
      : effectiveScope === "other"
      ? tasks.filter(isTaskOther)
      : tasks;

    lists.forEach((list) => {
      map[list.id] = scopedTasks.filter(
        (task) =>
          !task.completed &&
          (task.list_id === list.id ||
            task.projectId === list.id ||
            (list.id === "inbox" && (!task.list_id || task.list_id === "inbox" || task.list_id === "personal" || task.list_id === "work")) ||
            (list.system && list.name.toLowerCase() === "inbox" && (!task.list_id || task.list_id === "inbox" || task.list_id === "personal" || task.list_id === "work")))
      ).length;
    });
    return map;
  }, [tasks, lists, canSeeOtherTasks, allDatesScope, isTaskMine, isTaskOther]);
  const smartCounts = useMemo(() => {
    const map: Record<SmartKey, number> = { today: 0, tomorrow: 0, next7: 0, all: 0, recurring: 0, completed: 0 };
    const effectiveScope = canSeeOtherTasks ? allDatesScope : "mine";
    const scopedTasks = effectiveScope === "mine"
      ? tasks.filter(isTaskMine)
      : effectiveScope === "other"
      ? tasks.filter(isTaskOther)
      : tasks;

    SMART_LISTS.forEach((sl) => { map[sl.key] = filterActiveTasks(scopedTasks, { kind: "smart", key: sl.key }, user?.id).length; });
    map.completed = scopedTasks.filter((t) => t.completed).length;
    return map;
  }, [tasks, canSeeOtherTasks, allDatesScope, isTaskMine, isTaskOther, user?.id]);

  const [signOutModal, setSignOutModal] = useState(false);

  const doSignOut = () => {
    setMenu(false);
    setSignOutModal(true);
  };

  const handleConfirmSignOut = async () => {
    setSignOutModal(false);
    await signOut();
    router.replace("/");
  };

  const handlePressPostponeOverdue = () => {
    if (overdueTasks.length === 0) return;
    Alert.alert(
      "Postpone Overdue",
      `Postpone ${overdueTasks.length} overdue ${overdueTasks.length === 1 ? "task" : "tasks"} to today?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Postpone to Today",
          onPress: async () => {
            const todayStr = format(new Date(), "yyyy-MM-dd");
            for (const t of overdueTasks) {
              await postponeTask(t, { endDate: todayStr });
            }
            await refresh();
          },
        },
      ]
    );
  };

  const handleToggleTask = (task: Task, remarks?: string) => {
    const isCompleting = !task.completed;
    if (isCompleting) {
      playPopSound();
      setShowCompletedSection(true);
    }
    void toggleTask(task, remarks);

    setToast({ visible: true, taskId: task.id, action: isCompleting ? "completed" : "restored" });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 4000);
  };

  const handleUndo = () => {
    if (toast.taskId) {
      const currentTask = tasks.find((t) => t.id === toast.taskId);
      if (currentTask) {
        playPopSound();
        void toggleTask(currentTask);
      }
      setToast({ visible: false, taskId: null, action: "completed" });
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingList, setDeletingList] = useState(false);

  const handleDeleteList = (listId: string, listName: string) => {
    setDeleteTarget({ id: listId, name: listName });
  };

  const isCompletedSmartKey = selection.kind === "smart" && selection.key === "completed";

  const drawerSheet = (
    <DrawerSheet
      visible={drawer}
      selection={selection}
    followingActive={showFollowing}
      lists={lists}
      listCounts={listCounts}
      smartCounts={smartCounts}
      allDatesScope={allDatesScope}
      assignedToMeCount={assignedToMeCount}
      otherCount={otherCount}
      userName={displayName}
      userEmail={user?.email ?? ""}
      onSelectSmart={(key) => {
        setShowFollowing(false);
        setSelection({ kind: "smart", key });
        if (key === "all") {
          setAllDatesScope("mine");
          setSelectedOtherAssignee(null);
        }
        setDrawer(false);
      }}
      onSelectAllDatesScope={(scope) => {
        setShowFollowing(false);
        setSelection({ kind: "smart", key: "all" });
        setAllDatesScope(scope);
        setSelectedOtherAssignee(null);
        setDrawer(false);
      }}
      onSelectList={(id) => { setShowFollowing(false); setSelection({ kind: "list", id }); setDrawer(false); }}
      onDeleteList={(id, name) => handleDeleteList(id, name)}
      onNavigateFocus={() => { setDrawer(false); router.push("/(tabs)/focus"); }}
      onNavigateHabits={() => { setDrawer(false); router.push("/(tabs)/habits"); }}
      onNavigateFollowing={() => { setDrawer(false); setShowFollowing(true); }}
      onClose={() => setDrawer(false)}
      styles={styles}
      colors={colors}
    />
  );

  const escalationSection =
    escalationSectionTasks.length > 0 ? (
      <View style={styles.simpleSectionCard}>
        <Pressable
          testID="toggle-escalation-section"
          onPress={() => setEscalationsCollapsedFor(showEscalationSection ? selectionKey : null)}
          style={[styles.simpleSectionHeader, showEscalationSection && styles.simpleSectionHeaderExpanded]}
        >
          <Text style={styles.simpleSectionTitle}>Escalations</Text>
          <View style={styles.simpleSectionRight}>
            <Text style={styles.simpleSectionCount}>{escalationSectionTasks.length}</Text>
            <Ionicons name={showEscalationSection ? "chevron-down" : "chevron-forward"} size={16} color={colors.muted} />
          </View>
        </Pressable>

        {showEscalationSection ? (
          <View style={styles.simpleSectionBody}>
            {displayedEscalationTasks.map((task, index) => (
              <EscalationRow
                key={task.id}
                task={task}
                busy={escalatingId === task.id}
                onPress={setEscalationDetail}
                onEscalate={confirmEscalate}
                isLast={index === displayedEscalationTasks.length - 1 && escalationSectionTasks.length <= 5}
                styles={styles}
                colors={colors}
              />
            ))}
            {escalationSectionTasks.length > 5 ? (
              <Pressable
                testID="toggle-all-escalations"
                onPress={() => setEscalationsExpandedFor(showAllEscalations ? null : selectionKey)}
                style={styles.viewMoreButton}
              >
                <Text style={styles.viewMoreButtonText}>
                  {showAllEscalations ? "Show less" : `View more (${escalationSectionTasks.length - 5} more)`}
                </Text>
                <Ionicons name={showAllEscalations ? "chevron-up" : "chevron-down"} size={15} color={colors.brandPrimary} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    ) : null;

  if (showFollowing) {
    return (
      <View style={styles.screen}>
        <View style={[styles.headerBar, { paddingTop: insets.top + 6 }]}>
          <Pressable testID="open-drawer" onPress={() => setDrawer(true)} style={styles.iconButton}>
            <Ionicons name="menu" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>Informed & Escalations</Text>
        </View>
        <FollowingView />
        {drawerSheet}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 6 }]}>
        <Pressable testID="open-drawer" onPress={() => setDrawer(true)} style={styles.iconButton}>
          <Ionicons name="menu" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {activeListDoc ? `${activeListDoc.emoji} ${activeListDoc.name}` : headerTitle}
        </Text>
        {activeListDoc && !activeListDoc.system ? (
          <Pressable
            testID="delete-active-list"
            onPress={() => handleDeleteList(activeListDoc.id, activeListDoc.name)}
            style={styles.iconButton}
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        ) : null}
        <Pressable
          testID="manual-refresh-btn"
          onPress={handleRefresh}
          disabled={refreshing}
          style={styles.iconButton}
          hitSlop={6}
        >
          <Ionicons
            name={refreshing ? "sync" : "refresh-outline"}
            size={21}
            color={refreshing ? colors.brandPrimary : colors.onSurface}
          />
        </Pressable>
        <Pressable
          testID="open-clock-btn"
          onPress={() => setClockModal(true)}
          style={[styles.iconButton, { position: "relative" }]}
          hitSlop={6}
        >
          <Ionicons
            name={
              todayAttendance?.checkOut
                ? "time"
                : todayAttendance?.checkIn
                ? "time"
                : "time-outline"
            }
            size={22}
            color={
              todayAttendance?.checkOut
                ? "#10B981"
                : todayAttendance?.checkIn
                ? colors.brandPrimary
                : colors.onSurface
            }
          />
          {!todayAttendance ? (
            <View
              style={{
                position: "absolute",
                top: 7,
                right: 7,
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: "#F59E0B",
              }}
            />
          ) : todayAttendance.checkIn && !todayAttendance.checkOut ? (
            <View
              style={{
                position: "absolute",
                top: 7,
                right: 7,
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: "#10B981",
              }}
            />
          ) : null}
        </Pressable>
        <Pressable
          testID="open-notifications-btn"
          onPress={() => setNotificationsModal(true)}
          style={[styles.iconButton, { position: "relative" }]}
          hitSlop={6}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.onSurface} />
          {unreadNotificationCount > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable testID="open-menu" onPress={() => setMenu(true)} style={styles.iconButton}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {/* Scope Selector inside All Dates: Assigned to me | Other (ADMIN and TL only) */}
      {canSeeOtherTasks && selection.kind === "smart" && SCOPE_SMART_KEYS.includes(selection.key) ? (
        <View style={styles.allDatesScopeContainer}>
          <View style={styles.allDatesSegmentedControl}>
            <Pressable
              testID="scope-mine"
              onPress={() => {
                setAllDatesScope("mine");
                setSelectedOtherAssignee(null);
              }}
              style={[
                styles.scopeSegment,
                allDatesScope === "mine" && styles.scopeSegmentActive,
              ]}
            >
              <Text
                style={[
                  styles.scopeSegmentText,
                  allDatesScope === "mine" && styles.scopeSegmentTextActive,
                ]}
                numberOfLines={1}
              >
                Assigned to me
              </Text>
              <View
                style={[
                  styles.scopeBadge,
                  allDatesScope === "mine" && styles.scopeBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.scopeBadgeText,
                    allDatesScope === "mine" && styles.scopeBadgeTextActive,
                  ]}
                >
                  {assignedToMeCount}
                </Text>
              </View>
            </Pressable>

            <Pressable
              testID="scope-other"
              onPress={() => setAllDatesScope("other")}
              style={[
                styles.scopeSegment,
                allDatesScope === "other" && styles.scopeSegmentActive,
              ]}
            >
              <Text
                style={[
                  styles.scopeSegmentText,
                  allDatesScope === "other" && styles.scopeSegmentTextActive,
                ]}
              >
                Other
              </Text>
              <View
                style={[
                  styles.scopeBadge,
                  allDatesScope === "other" && styles.scopeBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.scopeBadgeText,
                    allDatesScope === "other" && styles.scopeBadgeTextActive,
                  ]}
                >
                  {otherCount}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Top Filter Bar: Select by employee name or All */}
      {canSeeOtherTasks && selection.kind === "smart" && SCOPE_SMART_KEYS.includes(selection.key) && allDatesScope === "other" && otherAssignees.length > 0 ? (
        <View style={styles.assigneeFilterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.assigneeFilterScroll}
          >
            {/* Search Button to quickly find employee if list is long */}
            <Pressable
              testID="filter-other-search-btn"
              onPress={() => setEmployeeSearchModal(true)}
              style={styles.assigneeSearchBtn}
            >
              <Ionicons name="search" size={13} color={colors.brandPrimary} />
              <Text style={styles.assigneeSearchBtnText}>Search</Text>
            </Pressable>

            {/* All option */}
            <Pressable
              testID="filter-other-all"
              onPress={() => setSelectedOtherAssignee(null)}
              style={[
                styles.assigneeChip,
                !selectedOtherAssignee && styles.assigneeChipActive,
              ]}
            >
              <Ionicons
                name="people"
                size={14}
                color={!selectedOtherAssignee ? colors.brandPrimary : colors.muted}
              />
              <Text
                style={[
                  styles.assigneeChipText,
                  !selectedOtherAssignee && styles.assigneeChipTextActive,
                ]}
              >
                All
              </Text>
              <Text
                style={[
                  styles.assigneeChipCount,
                  !selectedOtherAssignee && styles.assigneeChipCountActive,
                ]}
              >
                {otherCount}
              </Text>
            </Pressable>

            {/* Individual employees with active tasks */}
            {otherAssignees.map((assignee) => {
              const isSelected = selectedOtherAssignee === assignee.id;
              return (
                <Pressable
                  key={assignee.id}
                  testID={`filter-other-${assignee.id}`}
                  onPress={() => setSelectedOtherAssignee(isSelected ? null : assignee.id)}
                  style={[
                    styles.assigneeChip,
                    isSelected && styles.assigneeChipActive,
                  ]}
                >
                  <Ionicons
                    name="person"
                    size={13}
                    color={isSelected ? colors.brandPrimary : colors.muted}
                  />
                  <Text
                    style={[
                      styles.assigneeChipText,
                      isSelected && styles.assigneeChipTextActive,
                    ]}
                  >
                    {assignee.name}
                  </Text>
                  <Text
                    style={[
                      styles.assigneeChipCount,
                      isSelected && styles.assigneeChipCountActive,
                    ]}
                  >
                    {assignee.count}
                  </Text>
                  {isSelected ? (
                    <Ionicons name="close-circle" size={14} color={colors.brandPrimary} style={{ marginLeft: 2 }} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="tasks-scroll"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brandPrimary}
            colors={[colors.brandPrimary]}
          />
        }
      >
        {firedReminders.length ? (
          <View style={styles.remindersBlock} testID="reminders-block">
            <View style={styles.remindersHeader}>
              <Ionicons name="notifications" size={16} color={colors.warning} />
              <Text style={styles.sectionTitle}>Nudges</Text>
              <Text style={styles.count}>{firedReminders.length}</Text>
            </View>
            {firedReminders.map((reminder) => (
              <ReminderCard
                key={`${reminder.task_id}-${reminder.reminder_key}`}
                reminder={reminder}
                onDismiss={() => {
                  const task = tasks.find((item) => item.id === reminder.task_id);
                  if (task) void dismissReminder(task, reminder.reminder_key);
                }}
                styles={styles}
                colors={colors}
              />
            ))}
          </View>
        ) : null}

        {loading && tasks.length === 0 ? (
          <SkeletonTaskList count={6} />
        ) : (selection.kind === "smart" && selection.key === "today" ? (
          overdueTasks.length === 0 &&
          todayTasks.length === 0 &&
          completedTodayTasks.length === 0 &&
          escalationSectionTasks.length === 0
        ) : (
          activeTasks.length === 0 && completedTasks.length === 0 && escalationSectionTasks.length === 0
        )) ? (
          <EmptyState title={activeListDoc ? "No tasks" : activeSmart?.empty.title ?? "No tasks"} copy={activeListDoc ? "Captures all your tasks and ideas" : activeSmart?.empty.copy ?? ""} icon={activeListDoc?.emoji ?? null} styles={styles} colors={colors} />
        ) : (
          <>
            {/* Overdue Box on Top */}
            {overdueTasks.length > 0 ? (
              <View style={styles.simpleSectionCard}>
                <Pressable
                  testID="toggle-overdue-section"
                  onPress={() => setShowOverdueSection((val) => !val)}
                  style={[styles.simpleSectionHeader, showOverdueSection && styles.simpleSectionHeaderExpanded]}
                >
                  <Text style={styles.simpleSectionTitle}>Overdue</Text>
                  <View style={styles.simpleSectionRight}>
                    <Pressable
                      testID="postpone-all-overdue"
                      onPress={handlePressPostponeOverdue}
                      hitSlop={8}
                      style={styles.postponeButton}
                    >
                      <Text style={styles.postponeButtonText}>Postpone</Text>
                    </Pressable>
                    <Text style={styles.simpleSectionCount}>{overdueTasks.length}</Text>
                    <Ionicons
                      name={showOverdueSection ? "chevron-down" : "chevron-forward"}
                      size={16}
                      color={colors.muted}
                    />
                  </View>
                </Pressable>

                {showOverdueSection ? (
                  <View style={styles.simpleSectionBody}>
                    {displayedOverdueTasks.map((task, index) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        canDelete={canDeleteTask(task)}
                        onPress={(t) => setDetailTask(t)}
                        onToggle={() => handleToggleTask(task)}
                        onDelete={() => {
                          if (canDeleteTask(task)) deleteTask(task.id);
                        }}
                        onPostpone={(t) => setPostponeModalTask(t)}
                        listsById={lists}
                        isLast={index === displayedOverdueTasks.length - 1 && overdueTasks.length <= 5}
                        showDetails={showDetails}
                        showTime={showTime}
                        styles={styles}
                        colors={colors}
                      />
                    ))}
                    {showAllOverdue && overdueTasks.length > expandedCount ? (
                      <Pressable
                        testID="load-more-overdue"
                        onPress={() => setExpandedCount((c) => c + EXPANDED_PAGE)}
                        style={styles.viewMoreButton}
                      >
                        <Text style={styles.viewMoreButtonText}>{`Load more (${overdueTasks.length - expandedCount} left)`}</Text>
                      </Pressable>
                    ) : null}
                    {overdueTasks.length > 5 ? (
                      <Pressable
                        testID="toggle-all-overdue"
                        onPress={() => setShowAllOverdue((prev) => !prev)}
                        style={styles.viewMoreButton}
                      >
                        <Text style={styles.viewMoreButtonText}>
                          {showAllOverdue
                            ? "Show less"
                            : `View more (${overdueTasks.length - 5} more)`}
                        </Text>
                        <Ionicons
                          name={showAllOverdue ? "chevron-up" : "chevron-down"}
                          size={15}
                          color={colors.brandPrimary}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {selection.kind === "smart" && selection.key === "today" ? (
              <>
                {/* Today's Tasks Group */}
                {todayTasks.length > 0 ? (
                  <View style={styles.simpleSectionCard}>
                    <Pressable
                      testID="toggle-today-section"
                      onPress={() => setShowTodaySection((val) => !val)}
                      style={[styles.simpleSectionHeader, showTodaySection && styles.simpleSectionHeaderExpanded]}
                    >
                      <Text style={styles.simpleSectionTitle}>Today</Text>
                      <View style={styles.simpleSectionRight}>
                        <Text style={styles.simpleSectionCount}>{todayTasks.length}</Text>
                        <Ionicons
                          name={showTodaySection ? "chevron-down" : "chevron-forward"}
                          size={16}
                          color={colors.muted}
                        />
                      </View>
                    </Pressable>

                    {showTodaySection ? (
                      <View style={styles.simpleSectionBody}>
                        {displayedTodayTasks.map((task, index) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            canDelete={canDeleteTask(task)}
                            onPress={(t) => setDetailTask(t)}
                            onToggle={() => handleToggleTask(task)}
                            onDelete={() => {
                              if (canDeleteTask(task)) deleteTask(task.id);
                            }}
                            onPostpone={(t) => setPostponeModalTask(t)}
                            listsById={lists}
                            isLast={index === displayedTodayTasks.length - 1 && todayTasks.length <= 5}
                            hideDueDate
                            showDetails={showDetails}
                            showTime={showTime}
                            styles={styles}
                            colors={colors}
                          />
                        ))}
                        {showAllToday && todayTasks.length > expandedCount ? (
                          <Pressable
                            testID="load-more-today"
                            onPress={() => setExpandedCount((c) => c + EXPANDED_PAGE)}
                            style={styles.viewMoreButton}
                          >
                            <Text style={styles.viewMoreButtonText}>{`Load more (${todayTasks.length - expandedCount} left)`}</Text>
                          </Pressable>
                        ) : null}
                        {todayTasks.length > 5 ? (
                          <Pressable
                            testID="toggle-all-today"
                            onPress={() => setShowAllToday((prev) => !prev)}
                            style={styles.viewMoreButton}
                          >
                            <Text style={styles.viewMoreButtonText}>
                              {showAllToday
                                ? "Show less"
                                : `View more (${todayTasks.length - 5} more)`}
                            </Text>
                            <Ionicons
                              name={showAllToday ? "chevron-up" : "chevron-down"}
                              size={15}
                              color={colors.brandPrimary}
                            />
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {escalationSection}

                {/* Completed Marked Today Section (at the last) */}
                {completedTodayTasks.length > 0 ? (
                  <View style={styles.simpleSectionCard}>
                    <Pressable
                      testID="toggle-completed-today-section"
                      onPress={() => setShowCompletedSection((val) => !val)}
                      style={[styles.simpleSectionHeader, showCompletedSection && styles.simpleSectionHeaderExpanded]}
                    >
                      <Text style={styles.simpleSectionTitle}>Completed</Text>
                      <View style={styles.simpleSectionRight}>
                        <Text style={styles.simpleSectionCount}>{completedTodayTasks.length}</Text>
                        <Ionicons
                          name={showCompletedSection ? "chevron-down" : "chevron-forward"}
                          size={16}
                          color={colors.muted}
                        />
                      </View>
                    </Pressable>

                    {showCompletedSection ? (
                      <View style={styles.simpleSectionBody}>
                        {displayedCompletedTodayTasks.map((task, index) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            canDelete={canDeleteTask(task)}
                            onPress={(t) => setDetailTask(t)}
                            onToggle={() => handleToggleTask(task)}
                            onDelete={() => {
                              if (canDeleteTask(task)) deleteTask(task.id);
                            }}
                            listsById={lists}
                            isLast={index === displayedCompletedTodayTasks.length - 1 && completedTodayTasks.length <= 5}
                            showDetails={showDetails}
                            showTime={showTime}
                            styles={styles}
                            colors={colors}
                          />
                        ))}
                        {showAllCompletedToday && completedTodayTasks.length > expandedCount ? (
                          <Pressable
                            testID="load-more-completed-today"
                            onPress={() => setExpandedCount((c) => c + EXPANDED_PAGE)}
                            style={styles.viewMoreButton}
                          >
                            <Text style={styles.viewMoreButtonText}>{`Load more (${completedTodayTasks.length - expandedCount} left)`}</Text>
                          </Pressable>
                        ) : null}
                        {completedTodayTasks.length > 5 ? (
                          <Pressable
                            testID="toggle-all-completed-today"
                            onPress={() => setShowAllCompletedToday((prev) => !prev)}
                            style={styles.viewMoreButton}
                          >
                            <Text style={styles.viewMoreButtonText}>
                              {showAllCompletedToday
                                ? "Show less"
                                : `View more (${completedTodayTasks.length - 5} more)`}
                            </Text>
                            <Ionicons
                              name={showAllCompletedToday ? "chevron-up" : "chevron-down"}
                              size={15}
                              color={colors.brandPrimary}
                            />
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : (
              <>
              {/* Regular Tasks Group for other views */}
              {regularTasks.length > 0 ? (
                <View style={styles.cardGroup}>
                  {displayedRegularTasks.map((task, index) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      canDelete={canDeleteTask(task)}
                      onPress={(t) => setDetailTask(t)}
                      onToggle={() => handleToggleTask(task)}
                      onDelete={() => {
                        if (canDeleteTask(task)) deleteTask(task.id);
                      }}
                      onPostpone={(t) => setPostponeModalTask(t)}
                      listsById={lists}
                      isLast={index === displayedRegularTasks.length - 1 && regularTasks.length <= 5}
                      hideDueDate={selection.kind === "smart" && selection.key === "tomorrow"}
                      showDetails={showDetails}
                      showTime={showTime}
                      styles={styles}
                      colors={colors}
                    />
                  ))}
                  {showAllRegular && regularTasks.length > expandedCount ? (
                    <Pressable
                      testID="load-more-regular"
                      onPress={() => setExpandedCount((c) => c + EXPANDED_PAGE)}
                      style={styles.viewMoreButton}
                    >
                      <Text style={styles.viewMoreButtonText}>{`Load more (${regularTasks.length - expandedCount} left)`}</Text>
                    </Pressable>
                  ) : null}
                  {regularTasks.length > 5 ? (
                    <Pressable
                      testID="toggle-all-regular"
                      onPress={() => setShowAllRegular((prev) => !prev)}
                      style={styles.viewMoreButton}
                    >
                      <Text style={styles.viewMoreButtonText}>
                        {showAllRegular
                          ? "Show less"
                          : `View more (${regularTasks.length - 5} more)`}
                      </Text>
                      <Ionicons
                        name={showAllRegular ? "chevron-up" : "chevron-down"}
                        size={12}
                        color={colors.brandPrimary}
                      />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {escalationSection}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Undo Banner on Bottom Left */}
      {toast.visible && toast.taskId ? (
        <View style={[styles.undoToast, { bottom: insets.bottom + 70 }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.undoToastText} numberOfLines={1}>
            {toast.action === "completed" ? "Completed" : "Restored"}
          </Text>
          <Pressable testID="undo-button" onPress={handleUndo} style={styles.undoButton}>
            <Text style={styles.undoButtonText}>Undo</Text>
          </Pressable>
        </View>
      ) : null}

      <Fab onPress={() => setComposer("task")} testID="add-task-fab" />

      <TaskComposer
        kind={composer}
        onClose={() => setComposer(null)}
        defaultDue={selection.kind === "smart" && (selection.key === "today" || selection.key === "tomorrow") ? format(selection.key === "today" ? new Date() : addDays(new Date(), 1), "yyyy-MM-dd") : undefined}
        defaultListId={selection.kind === "list" ? selection.id : inboxList?.id ?? null}
        defaultAssigneeIds={composerDefaultAssigneeIds}
      />

      {drawerSheet}

      <MenuSheet
        visible={menu}
        onSignOut={doSignOut}
        onClose={() => setMenu(false)}
        onOpenVoice={() => { setMenu(false); setComposer("voice"); }}
        onOpenFilter={() => { setMenu(false); setFilterModal(true); }}
        onOpenViewOptions={() => { setMenu(false); setViewOptionsModal(true); }}
        onOpenArrange={() => { setMenu(false); setArrangeModal(true); }}
        onShareList={handleShareList}
        styles={styles}
        colors={colors}
      />

      <EmployeeSearchModal
        visible={employeeSearchModal}
        onClose={() => setEmployeeSearchModal(false)}
        employees={otherAssignees}
        selectedId={selectedOtherAssignee}
        onSelect={(id) => setSelectedOtherAssignee(id)}
        totalCount={otherCount}
        styles={styles}
        colors={colors}
      />

      <TaskFilterModal
        visible={filterModal}
        filterPriority={filterPriority}
        setFilterPriority={setFilterPriority}
        filterAssignee={filterAssignee}
        setFilterAssignee={setFilterAssignee}
        assignees={
          otherAssignees.length > 0 || (user && assignedToMeCount > 0)
            ? [
                ...(user && assignedToMeCount > 0 ? [{ id: user.id, name: `${displayName} (Me)`, count: assignedToMeCount }] : []),
                ...otherAssignees.map((a) => ({ id: a.id, name: a.name, count: a.count })),
              ]
            : assignableUsers.map((u) => ({
                id: u.id,
                name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
              }))
        }
        onClose={() => setFilterModal(false)}
        styles={styles}
        colors={colors}
      />

      <TaskViewOptionsModal
        visible={viewOptionsModal}
        showCompletedSection={showCompletedSection}
        setShowCompletedSection={setShowCompletedSection}
        showDetails={showDetails}
        setShowDetails={setShowDetails}
        showTime={showTime}
        setShowTime={setShowTime}
        onClose={() => setViewOptionsModal(false)}
        styles={styles}
        colors={colors}
      />

      <TaskArrangeModal
        visible={arrangeModal}
        arrangeBy={arrangeBy}
        setArrangeBy={setArrangeBy}
        onClose={() => setArrangeModal(false)}
        styles={styles}
        colors={colors}
      />

      <ConfirmDeleteModal
        visible={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete list?"}
        message="Are you sure you want to delete this list? Tasks in this list will remain available in All Dates."
        loading={deletingList}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeletingList(true);
          try {
            if (selection.kind === "list" && selection.id === deleteTarget.id) {
              setSelection({ kind: "smart", key: "all" });
            }
            await deleteList(deleteTarget.id);
          } finally {
            setDeletingList(false);
            setDeleteTarget(null);
          }
        }}
      />

      <TaskDetailModal
        task={detailTask}
        visible={Boolean(detailTask)}
        onClose={() => setDetailTask(null)}
        onToggle={handleToggleTask}
        onDelete={deleteTask}
        onPostpone={(t) => setPostponeModalTask(t)}
        onEdit={(t) => setEditModalTask(t)}
        lists={lists}
      />
      {/* Escalation tasks belong to other people, so their detail view is read-only. */}
      <TaskDetailModal
        task={escalationDetail}
        visible={Boolean(escalationDetail)}
        onClose={() => setEscalationDetail(null)}
        onToggle={() => {}}
        onDelete={() => {}}
        onPostpone={() => {}}
        onEdit={() => {}}
        lists={lists}
      />
      <TaskEditModal
        task={editModalTask}
        visible={Boolean(editModalTask)}
        onClose={() => setEditModalTask(null)}
        onSave={editTask}
      />
      <PostponeActivityModal
        task={postponeModalTask}
        visible={Boolean(postponeModalTask)}
        onClose={() => setPostponeModalTask(null)}
        onPostponed={() => {
          setPostponeModalTask(null);
          void refresh();
        }}
      />
      <ConfirmSignOutModal
        visible={signOutModal}
        onClose={() => setSignOutModal(false)}
        onConfirm={handleConfirmSignOut}
      />
      <NotificationsModal
        visible={notificationsModal}
        onClose={() => setNotificationsModal(false)}
        onSelectTask={(task) => setDetailTask(task)}
      />
      {clockModal && (
        <Modal
          visible={clockModal}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setClockModal(false)}
        >
          <Pressable onPress={() => setClockModal(false)} style={styles.modalBackdrop}>
            <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 360 }}>
              <ClockWidget variant="card" onClose={() => setClockModal(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

export function isTaskOverdue(task: Task): boolean {
  if (task.completed || !task.due_date) return false;
  const parsed = parseTaskDate(task.due_date);
  if (!parsed) return false;
  return parsed.getTime() < startOfDay(new Date()).getTime();
}

export function isTaskForToday(task: Task): boolean {
  if (task.completed) return false;
  const now = new Date();
  const today = startOfDay(now);
  if (!task.due_date) {
    const createdTime = task.created_at || task.createdAt;
    if (createdTime) {
      const createdDate = startOfDay(new Date(createdTime));
      return createdDate.getTime() <= today.getTime();
    }
    return true;
  }
  const parsed = parseTaskDate(task.due_date);
  if (!parsed) return true;
  return startOfDay(parsed).getTime() === today.getTime();
}

const SCOPE_SMART_KEYS: SmartKey[] = ["all", "today", "tomorrow", "next7"];

// Whether a task falls inside the date window of the active smart list, used for scope (mine/other) counts.
function isTaskInSmartWindow(task: Task, selection: Selection): boolean {
  if (selection.kind !== "smart") return true;
  switch (selection.key) {
    case "today":
      return isTaskOverdue(task) || isTaskForToday(task);
    case "tomorrow":
      return isTaskForTomorrow(task);
    case "next7":
      return isTaskForNext7Days(task);
    default:
      return true;
  }
}

export function isTaskForTomorrow(task: Task): boolean {
  if (task.completed || !task.due_date) return false;
  const parsed = parseTaskDate(task.due_date);
  if (!parsed) return false;
  const tomorrow = startOfDay(addDays(new Date(), 1));
  return startOfDay(parsed).getTime() === tomorrow.getTime();
}

export function isTaskForNext7Days(task: Task): boolean {
  if (task.completed || !task.due_date) return false;
  const parsed = parseTaskDate(task.due_date);
  if (!parsed) return false;
  const now = new Date();
  const taskDate = startOfDay(parsed);
  const afterTomorrow = startOfDay(addDays(now, 2));
  const in7 = startOfDay(addDays(now, 7));
  return taskDate.getTime() >= afterTomorrow.getTime() && taskDate.getTime() <= in7.getTime();
}

export function isTaskLater(task: Task): boolean {
  if (task.completed || !task.due_date) return false;
  const parsed = parseTaskDate(task.due_date);
  if (!parsed) return false;
  const now = new Date();
  const taskDate = startOfDay(parsed);
  const in7 = startOfDay(addDays(now, 7));
  return taskDate.getTime() > in7.getTime();
}

export function isTaskCompletedToday(task: Task): boolean {
  if (!task.completed) return false;
  const today = startOfDay(new Date());

  // 1. Actions array check (audit logs / activity actions)
  if (Array.isArray(task.actions)) {
    const hasCompletedActionToday = task.actions.some((a) => {
      const isCompleteAction = (a.type || "").toUpperCase() === "COMPLETED";
      if (!isCompleteAction || !a.createdAt) return false;
      return isSameDay(new Date(a.createdAt), today);
    });
    if (hasCompletedActionToday) return true;
  }

  // 2. completedAt / completed_at timestamp
  const completedAt = task.completedAt || (task as any).completed_at;
  if (completedAt) {
    try {
      if (isSameDay(new Date(completedAt), today)) return true;
    } catch {}
  }

  // 3. updatedAt / updated_at timestamp
  const updatedAt = task.updatedAt || (task as any).updated_at;
  if (updatedAt) {
    try {
      if (isSameDay(new Date(updatedAt), today)) return true;
    } catch {}
  }

  // 4. Due date is today
  if (task.due_date) {
    const parsed = parseTaskDate(task.due_date);
    if (parsed && isSameDay(parsed, today)) return true;
  }

  // 5. endAt / startAt falls on today
  if (task.endAt) {
    try {
      if (isSameDay(new Date(task.endAt), today)) return true;
    } catch {}
  }
  if (task.startAt) {
    try {
      if (isSameDay(new Date(task.startAt), today)) return true;
    } catch {}
  }

  return false;
}

function filterActiveTasks(tasks: Task[], selection: Selection, userId?: string): Task[] {
  let result: Task[] = [];
  if (selection.kind === "list") {
    result = tasks.filter(
      (task) =>
        !task.completed &&
        (task.list_id === selection.id ||
          task.projectId === selection.id ||
          (selection.id === "inbox" && (!task.list_id || task.list_id === "inbox" || task.list_id === "personal" || task.list_id === "work")))
    );
  } else {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = startOfDay(addDays(now, 1));
    const in7 = startOfDay(addDays(now, 7));
    switch (selection.key) {
      case "today": {
        const seen = new Set<string>();
        result = tasks.filter((task) => {
          if (task.completed) return false;
          if (task.source === "recurring_series") return false;
          if (!isTaskOverdue(task) && !isTaskForToday(task)) return false;
          const dedupKey = `${task.title.trim().toLowerCase()}_${task.due_date?.slice(0, 10) || ""}`;
          if (task.id.startsWith("offline_") && seen.has(dedupKey)) return false;
          seen.add(dedupKey);
          return true;
        });
        break;
      }
      case "tomorrow":
        result = tasks.filter((task) => !task.completed && task.source !== "recurring_series" && isTaskForTomorrow(task));
        break;
      case "next7":
        result = tasks.filter((task) => !task.completed && task.source !== "recurring_series" && isTaskForNext7Days(task));
        break;
      case "all":
        result = tasks.filter((task) => !task.completed && task.source !== "recurring_series");
        break;
      case "recurring":
        result = tasks.filter((task) => {
          if (task.completed) return false;
          return (
            task.source === "recurring_series" ||
            (task.recurrence && task.recurrence !== "none") ||
            Boolean(task.repeatDays && task.repeatDays.length > 0)
          );
        });
        break;
      case "completed":
        result = tasks.filter((task) => task.completed);
        break;
      default:
        result = [];
    }
  }
  return result.sort((a, b) => {
    const aOver = isTaskOverdue(a);
    const bOver = isTaskOverdue(b);
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    return getTaskTimestamp(b) - getTaskTimestamp(a);
  });
}

function filterCompletedTasks(tasks: Task[], selection: Selection): Task[] {
  let result: Task[] = [];
  if (selection.kind === "list") {
    result = tasks.filter(
      (task) =>
        task.completed &&
        (task.list_id === selection.id ||
          task.projectId === selection.id ||
          (selection.id === "inbox" && (!task.list_id || task.list_id === "inbox" || task.list_id === "personal" || task.list_id === "work")))
    );
  } else {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = startOfDay(addDays(now, 1));
    const in7 = startOfDay(addDays(now, 7));
    switch (selection.key) {
      case "today":
        result = tasks.filter((task) => isTaskCompletedToday(task));
        break;
      case "all":
      case "completed":
        result = tasks.filter((task) => task.completed);
        break;
      case "recurring":
        result = tasks.filter((task) => {
          if (!task.completed) return false;
          return (
            task.source === "recurring_series" ||
            (task.recurrence && task.recurrence !== "none") ||
            Boolean(task.repeatDays && task.repeatDays.length > 0)
          );
        });
        break;
      default:
        result = [];
    }
  }
  return result.sort((a, b) => getTaskTimestamp(b) - getTaskTimestamp(a));
}

function EmptyState({ title, copy, icon, styles, colors }: { title: string; copy: string; icon: string | null; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIllustration}>
        <View style={styles.emptyBlob} />
        <View style={styles.emptyTray}>
          {icon ? <Text style={{ fontSize: 40 }}>{icon}</Text> : <Ionicons name="file-tray-outline" size={44} color={colors.brandPrimary} />}
        </View>
        <View style={styles.starOne} />
        <View style={styles.starTwo} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </View>
  );
}

function ReminderCard({ reminder, onDismiss, styles, colors }: { reminder: Reminder; onDismiss: () => void; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  let relative = "";
  try { relative = formatDistanceToNow(parseISO(reminder.trigger_at), { addSuffix: true }); } catch { relative = ""; }
  return (
    <View style={styles.reminderCard} testID={`reminder-card-${reminder.task_id}`}>
      <View style={styles.reminderPulse}><Ionicons name="notifications" size={15} color={colors.onWarning} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.reminderTitle} numberOfLines={1}>{reminder.title}</Text>
        <Text style={styles.reminderMeta}>{REMINDER_LABELS[reminder.reminder_key] ?? "Reminder"} · {relative || "now"}</Text>
      </View>
      <Pressable testID={`dismiss-${reminder.task_id}-${reminder.reminder_key}`} onPress={onDismiss} style={styles.reminderDismiss}>
        <Text style={styles.reminderDismissText}>Got it</Text>
      </Pressable>
    </View>
  );
}

// A task I may escalate: view-only (no complete/delete), with an Escalate action.
function EscalationRow({
  task,
  busy,
  onPress,
  onEscalate,
  isLast,
  styles,
  colors,
}: {
  task: Task;
  busy: boolean;
  onPress: (task: Task) => void;
  onEscalate: (task: Task) => void;
  isLast?: boolean;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const due = formatTaskDueDateDisplay(task.due_date);
  return (
    <Pressable
      testID={`escalation-row-${task.id}`}
      onPress={() => onPress(task)}
      style={({ pressed }) => [styles.escalationRow, !isLast && styles.escalationRowDivider, pressed && { opacity: 0.75 }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={styles.escalationTitle}>{task.title}</Text>
        <Text numberOfLines={1} style={styles.escalationMeta}>
          {task.assigneeName ? `To ${task.assigneeName}` : "Unassigned"}
          {due ? <Text style={isTaskOverdue(task) ? styles.escalationOverdue : null}>{` · ${due}`}</Text> : null}
        </Text>
      </View>
      <Pressable
        testID={`escalate-${task.id}`}
        onPress={() => onEscalate(task)}
        disabled={busy}
        hitSlop={6}
        style={({ pressed }) => [styles.escalateButton, pressed && { opacity: 0.8 }]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.onBrandPrimary} />
        ) : (
          <>
            <Ionicons name="arrow-up-circle-outline" size={15} color={colors.onBrandPrimary} />
            <Text style={styles.escalateButtonText}>Escalate</Text>
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

function TaskRow({
  task,
  canDelete = true,
  onPress,
  onToggle,
  onDelete,
  onPostpone,
  listsById,
  isLast,
  showDetails = true,
  showTime = true,
  hideDueDate = false,
  styles,
  colors,
}: {
  task: Task;
  canDelete?: boolean;
  onPress: (task: Task) => void;
  onToggle: () => void;
  onDelete: () => void;
  onPostpone?: (task: Task) => void;
  listsById: TaskList[];
  isLast?: boolean;
  showDetails?: boolean;
  showTime?: boolean;
  hideDueDate?: boolean;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const isOverdue = isTaskOverdue(task);

  const dueDateLabel = useMemo(() => {
    if (!task.due_date) return null;
    const parsed = parseTaskDate(task.due_date);
    if (!parsed) return null;
    const today = new Date();
    const tomorrow = addDays(today, 1);
    if (isSameDay(parsed, today)) return "Today";
    if (isSameDay(parsed, tomorrow)) return "Tomorrow";
    return format(parsed, "d MMM");
  }, [task.due_date]);

  // Due date text color: red if overdue, blue (#3B82F6 / brandPrimary) if scheduled
  const dateColor = (() => {
    if (task.completed || !task.due_date) return null;
    if (isOverdue) return "#EF4444";
    return colors.brandPrimary || "#3B82F6";
  })();

  const latestRemark = useMemo(() => {
    // 1. Check task.actions (ActivityAction[])
    if (Array.isArray(task.actions) && task.actions.length > 0) {
      const sorted = [...task.actions].sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });

      const actionWithRemark = sorted.find(
        (a) => typeof a.remarks === "string" && a.remarks.trim().length > 0
      );
      if (actionWithRemark && actionWithRemark.remarks) {
        return actionWithRemark.remarks.trim();
      }
    }

    // 2. Check task.auditLogs if present
    if (Array.isArray(task.auditLogs) && task.auditLogs.length > 0) {
      const sorted = [...task.auditLogs].sort((a: any, b: any) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });
      const logWithRemark = sorted.find(
        (l: any) =>
          (typeof l.remarks === "string" && l.remarks.trim().length > 0) ||
          (typeof l.reason === "string" && l.reason.trim().length > 0)
      );
      if (logWithRemark) {
        const rem = logWithRemark.remarks || logWithRemark.reason;
        if (typeof rem === "string" && rem.trim().length > 0) {
          return rem.trim();
        }
      }
    }

    // 3. Direct remarks field if present on task object
    if (typeof (task as any).remarks === "string" && (task as any).remarks.trim().length > 0) {
      return (task as any).remarks.trim();
    }

    // 4. Fallback: check if task.notes has [Remark (...)]: ...
    if (typeof task.notes === "string" && task.notes.includes("[Remark")) {
      const remarkMatches = [...task.notes.matchAll(/\[Remark\s*(\([^)]*\))?\]:\s*([^\n]+)/gi)];
      if (remarkMatches.length > 0) {
        const last = remarkMatches[remarkMatches.length - 1];
        if (last && last[2]) {
          return last[2].trim();
        }
      }
    }

    return null;
  }, [task.actions, task.auditLogs, (task as any).remarks, task.notes]);

  const checkScale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  const handleCheck = () => {
    Animated.sequence([
      Animated.timing(checkScale, {
        toValue: 0.65,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
    void playPopSound();
    onToggle();
  };

  const hasHapticCrossed = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (!canDelete && gestureState.dx < -12) return false;
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dy) < 15;
      },
      onPanResponderGrant: () => {
        hasHapticCrossed.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        if (!canDelete && gestureState.dx < 0) {
          translateX.setValue(0);
          return;
        }
        translateX.setValue(gestureState.dx);
        if (Math.abs(gestureState.dx) > 80 && !hasHapticCrossed.current) {
          hasHapticCrossed.current = true;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else if (Math.abs(gestureState.dx) < 70) {
          hasHapticCrossed.current = false;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const SWIPE_THRESHOLD = 80;
        if (gestureState.dx > SWIPE_THRESHOLD) {
          // Swipe Right -> Complete Task
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Animated.timing(translateX, {
            toValue: 400,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            handleCheck();
            translateX.setValue(0);
          });
        } else if (gestureState.dx < -SWIPE_THRESHOLD && canDelete) {
          // Swipe Left -> Delete Task
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.timing(translateX, {
            toValue: -400,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            onDelete();
            translateX.setValue(0);
          });
        } else {
          // Spring back
          Animated.spring(translateX, {
            toValue: 0,
            friction: 7,
            tension: 140,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const leftOpacity = translateX.interpolate({
    inputRange: [0, 40, 90],
    outputRange: [0, 0.5, 1],
    extrapolate: "clamp",
  });

  const rightOpacity = translateX.interpolate({
    inputRange: [-90, -40, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: "clamp",
  });

  const leftScale = translateX.interpolate({
    inputRange: [0, 90],
    outputRange: [0.6, 1.1],
    extrapolate: "clamp",
  });

  const rightScale = translateX.interpolate({
    inputRange: [-90, 0],
    outputRange: [1.1, 0.6],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.swipeContainer}>
      {/* Left Action (Swipe Right -> Complete) */}
      <Animated.View style={[styles.swipeActionLeft, { opacity: leftOpacity }]}>
        <Animated.View style={{ transform: [{ scale: leftScale }], flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
          <Text style={styles.swipeActionText}>{task.completed ? "Uncomplete" : "Complete"}</Text>
        </Animated.View>
      </Animated.View>

      {/* Right Action (Swipe Left -> Delete) */}
      {canDelete ? (
        <Animated.View style={[styles.swipeActionRight, { opacity: rightOpacity }]}>
          <Animated.View style={{ transform: [{ scale: rightScale }], flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.swipeActionText}>Delete</Text>
            <Ionicons name="trash" size={20} color="#FFFFFF" />
          </Animated.View>
        </Animated.View>
      ) : null}

      {/* Main Task Row */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.taskRow,
          isLast && styles.taskRowLast,
          { transform: [{ translateX }], backgroundColor: colors.surface }
        ]}
      >
        <Pressable
          testID={`task-row-${task.id}`}
          onPress={() => onPress(task)}
          style={({ pressed }) => [
            styles.taskRowInner,
            pressed && styles.rowPressed,
            latestRemark ? { alignItems: "flex-start" } : null,
          ]}
        >
          {/* Checkbox with bounce */}
          <Pressable
            testID={`toggle-${task.id}`}
            onPress={handleCheck}
            style={[styles.checkboxTouch, latestRemark ? { marginTop: 1 } : null]}
          >
            <Animated.View style={[styles.checkbox, task.completed && styles.checkboxDone, { transform: [{ scale: checkScale }] }]}>
              {task.completed ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
            </Animated.View>
          </Pressable>

          {/* Main Content (Title & Latest Remark) */}
          <View style={styles.taskContent}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              {/* {(task.recurrence && task.recurrence !== "none") || task.source === "recurring_series" || (task.repeatDays && task.repeatDays.length > 0) ? (
                <Ionicons name="repeat-outline" size={13} color={colors.brandPrimary} />
              ) : null} */}
              <Text style={[styles.taskTitle, task.completed && styles.taskDone, { flex: 1 }]} numberOfLines={1}>
                {task.title}
              </Text>
            </View>
            {latestRemark ? (
              <View style={styles.taskRemarkRow}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={12}
                  color={colors.muted}
                  style={styles.taskRemarkIcon}
                />
                <Text style={[styles.taskRemarkText, task.completed && styles.taskRemarkDone]}>
                  {latestRemark}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Right: Date */}
          {dueDateLabel && !hideDueDate ? (
            <Text
              style={[
                styles.taskDateText,
                { color: dateColor || colors.brandPrimary },
                latestRemark ? { marginTop: 1 } : null,
              ]}
              numberOfLines={1}
            >
              {dueDateLabel}
            </Text>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const ITEM_HEIGHT = 52;

function DraggableListSection({
  lists,
  activeListId,
  listCounts,
  onSelectList,
  onDeleteList,
  onReorder,
  onDragStart,
  onDragEnd,
  styles,
  colors,
}: {
  lists: TaskList[];
  activeListId: string | null;
  listCounts: Record<string, number>;
  onSelectList: (id: string) => void;
  onDeleteList?: (id: string, name: string) => void;
  onReorder: (ids: string[]) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const [items, setItems] = useState(lists);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragY = useRef(new Animated.Value(0)).current;

  // Animated offset values for each slot
  const animOffsets = useRef<Animated.Value[]>([]).current;
  if (animOffsets.length !== lists.length) {
    animOffsets.length = 0;
    lists.forEach(() => animOffsets.push(new Animated.Value(0)));
  }

  const draggingIndexRef = useRef<number | null>(null);
  const hoverIndexRef = useRef<number | null>(null);
  const itemsRef = useRef(lists);
  itemsRef.current = items;

  useEffect(() => {
    setItems(lists);
  }, [lists]);

  const updateNeighborOffsets = (dragIdx: number, hoverIdx: number) => {
    itemsRef.current.forEach((_, idx) => {
      if (idx === dragIdx) return;
      let targetY = 0;
      if (hoverIdx > dragIdx) {
        if (idx > dragIdx && idx <= hoverIdx) {
          targetY = -ITEM_HEIGHT;
        }
      } else if (hoverIdx < dragIdx) {
        if (idx < dragIdx && idx >= hoverIdx) {
          targetY = ITEM_HEIGHT;
        }
      }
      if (animOffsets[idx]) {
        Animated.spring(animOffsets[idx], {
          toValue: targetY,
          friction: 9,
          tension: 90,
          useNativeDriver: true,
        }).start();
      }
    });
  };

  const resetAllOffsets = () => {
    animOffsets.forEach((anim) => {
      anim.setValue(0);
    });
  };

  const getPanResponder = (index: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        draggingIndexRef.current = index;
        hoverIndexRef.current = index;
        setDraggingIndex(index);
        dragY.setValue(0);
        resetAllOffsets();
        onDragStart();
      },
      onPanResponderMove: (_, gestureState) => {
        dragY.setValue(gestureState.dy);
        const curItems = itemsRef.current;
        const startIndex = draggingIndexRef.current ?? index;
        const dy = gestureState.dy;

        let delta = 0;
        if (dy > 0) {
          delta = Math.floor((dy + ITEM_HEIGHT * 0.35) / ITEM_HEIGHT);
        } else {
          delta = Math.ceil((dy - ITEM_HEIGHT * 0.35) / ITEM_HEIGHT);
        }

        const nextHover = Math.max(0, Math.min(curItems.length - 1, startIndex + delta));

        if (nextHover !== hoverIndexRef.current) {
          hoverIndexRef.current = nextHover;
          updateNeighborOffsets(startIndex, nextHover);
        }
      },
      onPanResponderRelease: () => {
        const startIndex = draggingIndexRef.current;
        const targetIndex = hoverIndexRef.current;
        const curItems = [...itemsRef.current];

        if (startIndex !== null && targetIndex !== null && startIndex !== targetIndex) {
          const [movedItem] = curItems.splice(startIndex, 1);
          curItems.splice(targetIndex, 0, movedItem);
          setItems(curItems);
          onReorder(curItems.map((item) => item.id));
        }

        draggingIndexRef.current = null;
        hoverIndexRef.current = null;
        setDraggingIndex(null);
        dragY.setValue(0);
        resetAllOffsets();
        onDragEnd();
      },
      onPanResponderTerminate: () => {
        draggingIndexRef.current = null;
        hoverIndexRef.current = null;
        setDraggingIndex(null);
        dragY.setValue(0);
        resetAllOffsets();
        onDragEnd();
      },
    });

  return (
    <View style={{ marginVertical: 2 }}>
      {items.map((list, index) => {
        const isDragging = draggingIndex === index;
        const panResponder = getPanResponder(index);
        const animOffset = animOffsets[index] || new Animated.Value(0);

        return (
          <Animated.View
            key={list.id}
            style={[
              styles.drawerRow,
              activeListId === list.id && styles.drawerRowActive,
              isDragging
                ? {
                    transform: [{ translateY: dragY }],
                    zIndex: 99,
                    backgroundColor: colors.surfaceSecondary,
                    shadowColor: "#000",
                    shadowOpacity: 0.2,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 8,
                  }
                : {
                    transform: [{ translateY: animOffset }],
                  },
            ]}
          >
            <Pressable
              testID={`user-list-${list.id}`}
              onPress={() => onSelectList(list.id)}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View style={styles.drawerIconEmoji}>
                <Text style={{ fontSize: 20 }}>{list.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.drawerLabel, activeListId === list.id && styles.drawerLabelActive]}>
                  {list.name}
                </Text>
                {list.system ? <Text style={styles.drawerHint}>System list</Text> : null}
              </View>
              <Text style={styles.drawerCount}>{listCounts[list.id] ?? 0}</Text>
            </Pressable>

            {!list.system && onDeleteList ? (
              <Pressable
                testID={`delete-list-${list.id}`}
                onPress={() => onDeleteList(list.id, list.name)}
                style={{ paddingHorizontal: 6, paddingVertical: 4 }}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            ) : null}

            <View
              {...panResponder.panHandlers}
              style={[styles.dragHandle, { touchAction: "none", userSelect: "none" } as any]}
              testID={`drag-handle-${list.id}`}
            >
              <Ionicons name="reorder-three-outline" size={24} color={isDragging ? colors.brandPrimary : colors.muted} />
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const formatClockTime = (iso?: string | null) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
};

function DrawerSheet(props: {
  visible: boolean;
  selection: Selection;
  lists: TaskList[];
  listCounts: Record<string, number>;
  smartCounts: Record<SmartKey, number>;
  allDatesScope: "all" | "mine" | "other";
  assignedToMeCount: number;
  otherCount: number;
  userName: string;
  userEmail: string;
  onSelectSmart: (key: SmartKey) => void;
  onSelectAllDatesScope: (scope: "all" | "mine" | "other") => void;
  onSelectList: (id: string) => void;
  onDeleteList?: (id: string, name: string) => void;
  onNavigateFocus: () => void;
  onNavigateHabits: () => void;
  onNavigateFollowing: () => void;
  followingActive: boolean;
  onClose: () => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const insets = useSafeAreaInsets();
  const { user, reorderLists, todayAttendance } = useApp();
  const [isDragging, setIsDragging] = useState(false);
  const [attendanceModal, setAttendanceModal] = useState(false);

  const {
    visible,
    selection,
    lists,
    listCounts,
    smartCounts,
    allDatesScope,
    assignedToMeCount,
    otherCount,
    userName,
    userEmail,
    onSelectSmart,
    onSelectAllDatesScope,
    onSelectList,
    onDeleteList,
    onNavigateFocus,
    onNavigateHabits,
    onNavigateFollowing,
    followingActive,
    onClose,
    styles,
    colors,
  } = props;
  const activeListId = selection.kind === "list" ? selection.id : null;
  const activeSmart = selection.kind === "smart" && !followingActive ? selection.key : null;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.drawerBackdrop}>
        <Pressable
          onPress={() => { /* trap */ }}
          style={[
            styles.drawerPanel,
            {
              paddingTop: Math.max(insets.top + 12, 44),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
          testID="drawer-panel"
        >
          <View style={styles.drawerHeader}>
            <View style={styles.drawerAvatar}>
              {isImageUri(user?.avatarUrl) ? (
                <Image source={{ uri: user!.avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
              ) : user?.avatarUrl ? (
                <Text style={{ fontSize: 22 }}>{user.avatarUrl}</Text>
              ) : (
                <Text style={styles.drawerAvatarText}>{(userName || "T").slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.drawerName}>{userName}</Text>
              <Text style={styles.drawerEmail} numberOfLines={1}>{userEmail}</Text>
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={!isDragging}>
            <Text style={[styles.drawerSection, { marginTop: 8 }]}>Smart lists</Text>
            {SMART_LISTS.map((list) => {
              if (list.key === "tomorrow") {
                return (
                  <Pressable
                    key="following"
                    testID="drawer-following"
                    onPress={onNavigateFollowing}
                    style={({ pressed }) => [
                      styles.drawerRow,
                      followingActive && styles.drawerRowActive,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <View style={[styles.drawerIcon, followingActive && styles.drawerIconActive]}>
                      <Ionicons
                        name="eye-outline"
                        size={18}
                        color={followingActive ? colors.onBrandPrimary : colors.brandPrimary}
                      />
                    </View>
                    <Text style={[styles.drawerLabel, { flex: 1 }, followingActive && styles.drawerLabelActive]}>
                      Informed & Escalations
                    </Text>
                  </Pressable>
                );
              }
              const isSmartActive = activeSmart === list.key;

              return (
                <Pressable
                  key={list.key}
                  testID={`smart-${list.key}`}
                  onPress={() => onSelectSmart(list.key)}
                  style={({ pressed }) => [
                    styles.drawerRow,
                    isSmartActive && styles.drawerRowActive,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.drawerIcon,
                      isSmartActive && styles.drawerIconActive,
                    ]}
                  >
                    <Ionicons
                      name={list.icon as never}
                      size={18}
                      color={
                        isSmartActive
                          ? colors.onBrandPrimary
                          : colors.brandPrimary
                      }
                    />
                  </View>
                  <Text
                    style={[
                      styles.drawerLabel,
                      { flex: 1 },
                      isSmartActive && styles.drawerLabelActive,
                    ]}
                  >
                    {list.label}
                  </Text>
                  <Text
                    style={[
                      styles.drawerCount,
                      isSmartActive && {
                        color: colors.brandPrimary,
                        fontWeight: "600",
                      },
                    ]}
                  >
                    {smartCounts[list.key]}
                  </Text>
                </Pressable>
              );
            })}

            {/* <View style={styles.drawerSectionHeader}>
              <Text style={styles.drawerSection}>Lists</Text>
            </View> */}

            {/* <DraggableListSection
              lists={lists}
              activeListId={activeListId}
              listCounts={listCounts}
              onSelectList={(id) => onSelectList(id)}
              onDeleteList={onDeleteList}
              onReorder={(newIds) => void reorderLists(newIds)}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={() => setIsDragging(false)}
              styles={styles}
              colors={colors}
            /> */}

            <View style={styles.drawerSectionHeader}>
              <Text style={styles.drawerSection}>Tools</Text>
            </View>
            <Pressable
              testID="drawer-attendance"
              onPress={() => setAttendanceModal(true)}
              style={({ pressed }) => [styles.drawerRow, pressed && styles.rowPressed]}
            >
              <View
                style={[
                  styles.drawerIcon,
                  todayAttendance?.checkOut
                    ? { backgroundColor: "rgba(16, 185, 129, 0.12)" }
                    : todayAttendance?.checkIn
                    ? { backgroundColor: "rgba(59, 130, 246, 0.12)" }
                    : null,
                ]}
              >
                <Ionicons
                  name={todayAttendance?.checkOut ? "checkmark-circle-outline" : todayAttendance?.checkIn ? "time" : "time-outline"}
                  size={18}
                  color={todayAttendance?.checkOut ? "#10B981" : todayAttendance?.checkIn ? "#3B82F6" : colors.brandPrimary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerLabel}>Attendance & Clock</Text>
                <Text style={styles.drawerHint}>
                  {todayAttendance?.checkOut
                    ? `Clocked out · ${formatClockTime(todayAttendance.checkOut)}`
                    : todayAttendance?.checkIn
                    ? `Clocked in · ${formatClockTime(todayAttendance.checkIn)}`
                    : "Tap to clock in for today"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
            <Pressable testID="drawer-focus" onPress={onNavigateFocus} style={({ pressed }) => [styles.drawerRow, pressed && styles.rowPressed]}>
              <View style={styles.drawerIcon}><Ionicons name="timer-outline" size={18} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerLabel}>Focus timer</Text>
                <Text style={styles.drawerHint}>Pomodoro 25 · beat procrastination</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
            {/* <Pressable testID="drawer-habits" onPress={onNavigateHabits} style={({ pressed }) => [styles.drawerRow, pressed && styles.rowPressed]}>
              <View style={styles.drawerIcon}><Ionicons name="leaf-outline" size={18} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerLabel}>Habit tracker</Text>
                <Text style={styles.drawerHint}>60+ ideas · streaks & rituals</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable> */}
          </ScrollView>
        </Pressable>
      </Pressable>

      {attendanceModal && (
        <Modal
          visible={attendanceModal}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setAttendanceModal(false)}
        >
          <Pressable onPress={() => setAttendanceModal(false)} style={styles.modalBackdrop}>
            <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 360 }}>
              <ClockWidget variant="card" onClose={() => setAttendanceModal(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Modal>
  );
}

function MenuSheet(props: {
  visible: boolean;
  onSignOut: () => void;
  onClose: () => void;
  onOpenVoice: () => void;
  onOpenFilter: () => void;
  onOpenViewOptions: () => void;
  onOpenArrange: () => void;
  onShareList: () => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const insets = useSafeAreaInsets();
  const { visible, onSignOut, onClose, onOpenVoice, onOpenFilter, onOpenViewOptions, onOpenArrange, onShareList, styles, colors } = props;
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.menuBackdrop}>
        <Pressable onPress={() => { /* trap */ }} style={[styles.menuCard, { top: insets.top + 44 }]} testID="menu-card">
          <MenuItem icon="mic-outline" label="Voice capture" onPress={onOpenVoice} styles={styles} colors={colors} testID="menu-voice" />
          <MenuItem icon="funnel-outline" label="Filter" onPress={onOpenFilter} styles={styles} colors={colors} testID="menu-filter" />
          <MenuItem icon="options-outline" label="View options" onPress={onOpenViewOptions} styles={styles} colors={colors} testID="menu-view" />
          <MenuItem icon="swap-vertical-outline" label="Arrange tasks" onPress={onOpenArrange} styles={styles} colors={colors} testID="menu-arrange" />
          <MenuItem icon="share-social-outline" label="Share list" onPress={onShareList} styles={styles} colors={colors} testID="menu-share" />
          <View style={styles.menuDivider} />
          <MenuItem icon="log-out-outline" label="Sign out" onPress={onSignOut} tone="danger" styles={styles} colors={colors} testID="menu-sign-out" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuItem({ icon, label, onPress, tone = "default", styles, colors, testID }: { icon: string; label: string; onPress: () => void; tone?: "default" | "danger"; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"]; testID: string }) {
  const color = tone === "danger" ? colors.error : colors.onSurface;
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && styles.rowPressed]}>
      <Ionicons name={icon as never} size={18} color={color} />
      <Text style={[styles.menuLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function EmployeeSearchModal(props: {
  visible: boolean;
  onClose: () => void;
  employees: { id: string; name: string; count: number }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  totalCount: number;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const { visible, onClose, employees, selectedId, onSelect, totalCount, styles, colors } = props;
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (visible) {
      setQuery("");
    }
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q));
  }, [employees, query]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable onPress={() => {}} style={[styles.modalCard, { maxHeight: 520 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter by Employee</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {/* Search Box */}
          <View style={styles.modalSearchBox}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search employee name..."
              placeholderTextColor={colors.muted}
              style={styles.modalSearchInput}
              returnKeyType="search"
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={6}>
                <Ionicons name="close-circle" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {/* All Others option */}
            {!query ? (
              <Pressable
                onPress={() => {
                  onSelect(null);
                  onClose();
                }}
                style={styles.modalOptionRow}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Ionicons name="people-outline" size={16} color={!selectedId ? colors.brandPrimary : colors.muted} />
                  <Text style={[styles.modalOptionText, !selectedId && styles.modalOptionTextActive, { flex: 1 }]}>
                    All Others
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "600", marginRight: 6 }}>
                    {totalCount} tasks
                  </Text>
                </View>
                {!selectedId ? (
                  <Ionicons name="checkmark" size={18} color={colors.brandPrimary} />
                ) : null}
              </Pressable>
            ) : null}

            {/* Filtered employee list */}
            {filtered.map((emp) => {
              const isSelected = selectedId === emp.id;
              return (
                <Pressable
                  key={emp.id}
                  onPress={() => {
                    onSelect(emp.id);
                    onClose();
                  }}
                  style={styles.modalOptionRow}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    <Ionicons name="person-outline" size={15} color={isSelected ? colors.brandPrimary : colors.muted} />
                    <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextActive, { flex: 1 }]} numberOfLines={1}>
                      {emp.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "600", marginRight: 6 }}>
                      {emp.count} {emp.count === 1 ? "task" : "tasks"}
                    </Text>
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={18} color={colors.brandPrimary} />
                  ) : null}
                </Pressable>
              );
            })}

            {filtered.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>No employees found</Text>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TaskFilterModal(props: {
  visible: boolean;
  filterPriority: string;
  setFilterPriority: (p: string) => void;
  filterAssignee: string;
  setFilterAssignee: (a: string) => void;
  assignees: { id: string; name: string; count?: number }[];
  onClose: () => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const { visible, filterPriority, setFilterPriority, filterAssignee, setFilterAssignee, assignees, onClose, styles, colors } = props;
  const [tempPriority, setTempPriority] = useState(filterPriority);
  const [tempAssignee, setTempAssignee] = useState(filterAssignee);

  useEffect(() => {
    if (visible) {
      setTempPriority(filterPriority);
      setTempAssignee(filterAssignee);
    }
  }, [visible, filterPriority, filterAssignee]);

  const priorities = [
    { key: "all", label: "All Priorities" },
    { key: "critical", label: "🔴 Critical" },
    { key: "high", label: "🔴 High" },
    { key: "medium", label: "🟡 Medium" },
    { key: "low", label: "🔵 Low" },
    { key: "none", label: "⚪ No Priority" },
  ];

  const handleApply = () => {
    setFilterPriority(tempPriority);
    setFilterAssignee(tempAssignee);
    onClose();
  };

  const handleReset = () => {
    setTempPriority("all");
    setTempAssignee("all");
    setFilterPriority("all");
    setFilterAssignee("all");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable onPress={() => {}} style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter Tasks by Priority</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
            {priorities.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setTempPriority(item.key)}
                style={styles.modalOptionRow}
              >
                <Text style={[styles.modalOptionText, tempPriority === item.key && styles.modalOptionTextActive]}>
                  {item.label}
                </Text>
                {tempPriority === item.key ? (
                  <Ionicons name="checkmark" size={18} color={colors.brandPrimary} />
                ) : null}
              </Pressable>
            ))}

          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable onPress={handleReset} style={styles.modalButton}>
              <Text style={styles.modalButtonText}>Reset</Text>
            </Pressable>
            <Pressable onPress={handleApply} style={[styles.modalButton, styles.modalButtonPrimary]}>
              <Text style={styles.modalButtonPrimaryText}>Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TaskViewOptionsModal(props: {
  visible: boolean;
  showCompletedSection: boolean;
  setShowCompletedSection: (v: boolean) => void;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  showTime: boolean;
  setShowTime: (v: boolean) => void;
  onClose: () => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const { visible, showCompletedSection, setShowCompletedSection, showDetails, setShowDetails, showTime, setShowTime, onClose, styles, colors } = props;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable onPress={() => {}} style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>View Options</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <View style={styles.modalOptionRow}>
            <View style={styles.modalOptionLeft}>
              <Ionicons name="checkmark-done-outline" size={20} color={colors.brandPrimary} />
              <Text style={styles.modalOptionText}>Show Completed Section</Text>
            </View>
            <Switch
              value={showCompletedSection}
              onValueChange={setShowCompletedSection}
              trackColor={{ false: colors.border, true: colors.brandPrimary }}
            />
          </View>

          <View style={styles.modalOptionRow}>
            <View style={styles.modalOptionLeft}>
              <Ionicons name="person-outline" size={20} color={colors.brandPrimary} />
              <Text style={styles.modalOptionText}>Show Assignee & List</Text>
            </View>
            <Switch
              value={showDetails}
              onValueChange={setShowDetails}
              trackColor={{ false: colors.border, true: colors.brandPrimary }}
            />
          </View>

          <View style={[styles.modalOptionRow, { borderBottomWidth: 0 }]}>
            <View style={styles.modalOptionLeft}>
              <Ionicons name="time-outline" size={20} color={colors.brandPrimary} />
              <Text style={styles.modalOptionText}>Show Date & Alarm</Text>
            </View>
            <Switch
              value={showTime}
              onValueChange={setShowTime}
              trackColor={{ false: colors.border, true: colors.brandPrimary }}
            />
          </View>

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.modalButton, styles.modalButtonPrimary]}>
              <Text style={styles.modalButtonPrimaryText}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TaskArrangeModal(props: {
  visible: boolean;
  arrangeBy: "due_date" | "priority" | "title" | "created";
  setArrangeBy: (v: "due_date" | "priority" | "title" | "created") => void;
  onClose: () => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const { visible, arrangeBy, setArrangeBy, onClose, styles, colors } = props;

  const options: { key: "due_date" | "priority" | "title" | "created"; label: string; icon: string }[] = [
    { key: "due_date", label: "By Due Date", icon: "calendar-outline" },
    { key: "priority", label: "By Priority (High to Low)", icon: "alert-circle-outline" },
    { key: "title", label: "By Title (A - Z)", icon: "text-outline" },
    { key: "created", label: "By Creation Time (Newest)", icon: "time-outline" },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable onPress={() => {}} style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Arrange Tasks</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {options.map((opt, idx) => (
            <Pressable
              key={opt.key}
              onPress={() => {
                setArrangeBy(opt.key);
                onClose();
              }}
              style={[styles.modalOptionRow, idx === options.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={styles.modalOptionLeft}>
                <Ionicons name={opt.icon as never} size={18} color={arrangeBy === opt.key ? colors.brandPrimary : colors.muted} />
                <Text style={[styles.modalOptionText, arrangeBy === opt.key && styles.modalOptionTextActive]}>
                  {opt.label}
                </Text>
              </View>
              {arrangeBy === opt.key ? (
                <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
              ) : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surfaceSecondary },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8, gap: 4, backgroundColor: colors.surfaceSecondary },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "600", flex: 1, marginLeft: 4 },
  headerCount: { color: colors.muted, fontSize: 13, fontWeight: "500" },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  notificationBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: "#EF4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
  },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 },

  /* Clean modern section cards (Overdue, Today, Completed, Upcoming) */
  simpleSectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.01,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 12,
  },
  simpleSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  simpleSectionHeaderExpanded: {
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  simpleSectionTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "600",
  },
  simpleSectionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  postponeButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  postponeButtonText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "600",
  },
  simpleSectionCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  simpleSectionBody: {
    paddingTop: 2,
  },
  escalationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  escalationRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  escalationTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "500",
  },
  escalationMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  escalationOverdue: {
    color: "#EF4444",
  },
  escalateButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  escalateButtonText: {
    color: colors.onBrandPrimary,
    fontSize: 12,
    fontWeight: "600",
  },

  /* Overdue Box — highlighted card container on top */
  overdueCardGroup: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 14,
  },
  overdueCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginBottom: 4,
  },
  overdueHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overdueCardTitle: {
    color: "#EF4444",
    fontSize: 15,
    fontWeight: "700",
  },
  overdueCountBadge: {
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  overdueCountBadgeText: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "700",
  },
  overdueListBody: {
    paddingTop: 2,
  },

  /* Task list — clean white card container */
  cardGroup: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 14,
  },
  completedCardGroup: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 16,
  },
  completedCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, marginBottom: 4 },
  completedCardTitle: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  completedCardRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  completedCardCount: { color: colors.muted, fontSize: 13, fontWeight: "500" },
  completedListBody: { paddingTop: 2 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    marginBottom: 6,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionHeaderTitle: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "700",
  },

  remindersBlock: { marginTop: 4, marginBottom: 14 },
  remindersHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  sectionTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  count: { color: colors.muted, fontSize: 12, marginLeft: 4 },
  reminderCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  reminderPulse: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center" },
  reminderTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "600" },
  reminderMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  reminderDismiss: { minHeight: 32, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.brandTertiary, justifyContent: "center" },
  reminderDismissText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "600" },

  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 20 },
  emptyIllustration: { width: 220, height: 200, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  emptyBlob: { position: "absolute", width: 200, height: 130, borderRadius: 100, backgroundColor: colors.surfaceSecondary, top: 40 },
  emptyTray: { width: 100, height: 90, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.onSurface, shadowColor: colors.surfaceInverse, shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  starOne: { position: "absolute", top: 18, right: 30, width: 10, height: 10, borderRadius: 2, backgroundColor: colors.onSurface, transform: [{ rotate: "45deg" }] },
  starTwo: { position: "absolute", bottom: 40, left: 20, width: 6, height: 6, borderRadius: 1, backgroundColor: colors.onSurface, transform: [{ rotate: "45deg" }] },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptyCopy: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20, maxWidth: 260 },

  /* ── Task row (clean card with rounded borders and shadow) ── */
  swipeContainer: { position: "relative", overflow: "hidden" },
  swipeActionLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "100%",
    backgroundColor: "#22C55E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingLeft: 20,
  },
  swipeActionRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "100%",
    backgroundColor: "#EF4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 20,
  },
  swipeActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },

  taskRow: {
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  taskRowInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  taskRowLast: { borderBottomWidth: 0 },
  rowPressed: { opacity: 0.65 },

  checkboxTouch: { padding: 4, margin: -4 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxDone: { backgroundColor: "#CBD5E1", borderColor: "#CBD5E1" },

  taskContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  taskTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 20,
  },
  taskDone: {
    color: "#9CA3AF",
    fontWeight: "400",
  },
  taskRemarkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 3,
    gap: 4,
  },
  taskRemarkIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  taskRemarkText: {
    flex: 1,
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 17,
  },
  taskRemarkDone: {
    color: "#9CA3AF",
    opacity: 0.7,
  },
  taskRightMeta: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
    flexShrink: 0,
    marginLeft: 8,
  },
  overdueBadge: {
    backgroundColor: "#FEE2E2",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: "#EF4444",
    marginBottom: 2,
  },
  overdueBadgeText: {
    color: "#DC2626",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  postponeQuickBtn: {
    padding: 2,
    borderRadius: 4,
  },
  taskDateText: {
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 0,
  },
  alarmIcon: {
    marginTop: 1,
  },

  /* Meta line: person + list */
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "400",
  },
  metaDot: {
    color: colors.muted,
    fontSize: 12,
  },

  viewMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  viewMoreButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.brandPrimary,
  },

  undoToast: { position: "absolute", left: 16, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#1e2230", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 12, elevation: 8, zIndex: 100 },
  undoToastText: { color: "#ffffff", fontSize: 14, fontWeight: "500" },
  undoButton: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.brandPrimary },
  undoButtonText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "700" },

  drawerBackdrop: { flex: 1, backgroundColor: "rgba(20,22,30,0.4)" },
  drawerPanel: { width: 300, height: "100%", backgroundColor: colors.surface, paddingHorizontal: 18 },
  drawerHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14, paddingVertical: 4 },
  drawerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  drawerAvatarText: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  drawerName: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  drawerEmail: { color: colors.muted, fontSize: 12, marginTop: 1 },
  drawerSection: { color: colors.muted, fontSize: 11, fontWeight: "600", letterSpacing: 0.8, textTransform: "capitalize" },
  drawerSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 6 },
  dragHandle: { paddingHorizontal: 8, paddingVertical: 8, justifyContent: "center", alignItems: "center" },
  drawerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12 },
  drawerRowActive: { backgroundColor: colors.brandTertiary },
  drawerIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  drawerIconActive: { backgroundColor: colors.brandPrimary },
  drawerIconEmoji: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  drawerLabel: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  drawerLabelActive: { color: colors.onBrandTertiary },
  drawerHint: { color: colors.muted, fontSize: 11, marginTop: 2 },
  drawerCount: { color: colors.muted, fontSize: 12, fontWeight: "500", minWidth: 20, textAlign: "right" },
  allDatesSubOptions: {
    paddingLeft: 20,
    marginTop: 2,
    marginBottom: 4,
    gap: 2,
  },
  subDrawerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  subDrawerRowActive: {
    backgroundColor: colors.surfaceSecondary,
  },
  subDrawerLabel: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  subDrawerLabelActive: {
    color: colors.brandPrimary,
    fontWeight: "700",
  },
  allDatesScopeContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: colors.surfaceSecondary,
  },
  allDatesSegmentedControl: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeSegment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 5,
  },
  scopeSegmentActive: {
    backgroundColor: colors.brandPrimary,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  scopeSegmentText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  scopeSegmentTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  scopeBadge: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  scopeBadgeActive: {
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
  scopeBadgeText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  scopeBadgeTextActive: {
    color: "#FFFFFF",
  },
  assigneeFilterBar: {
    paddingVertical: 8,
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  assigneeFilterScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  assigneeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  assigneeChipActive: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brandPrimary,
  },
  assigneeChipText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "500",
  },
  assigneeChipTextActive: {
    color: colors.brandPrimary,
    fontWeight: "700",
  },
  assigneeChipCount: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  assigneeChipCountActive: {
    color: colors.brandPrimary,
  },
  assigneeSearchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  assigneeSearchBtnText: {
    color: colors.brandPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  modalSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalSearchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    padding: 0,
  },

  menuBackdrop: { flex: 1, backgroundColor: "transparent" },
  menuCard: { position: "absolute", right: 12, backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 8, minWidth: 220, shadowColor: colors.surfaceInverse, shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  menuLabel: { fontSize: 14, fontWeight: "500" },
  menuDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 4 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.onSurface,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 8,
  },
  modalOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  modalOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  modalOptionText: {
    fontSize: 15,
    color: colors.onSurface,
    fontWeight: "500",
  },
  modalOptionTextActive: {
    color: colors.brandPrimary,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
  },
  modalButtonPrimary: {
    backgroundColor: colors.brandPrimary,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.onSurface,
  },
  modalButtonPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onBrandPrimary,
  },
}));

