import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { addDays, formatDistanceToNow, isBefore, parseISO, startOfDay, format } from "date-fns";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Alert, Animated, ColorValue, Image, Modal, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Share, Switch, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const isImageUri = (url?: string | null) => {
  if (!url) return false;
  return url.startsWith("file://") || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:");
};

import { Fab } from "@/src/components/fab";
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
  on_due: "On due date",
  "1_hour_before": "1 hour before",
  "1_day_before": "1 day before",
  "3_days_before": "3 days before",
};
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

type SmartKey = "all" | "today" | "tomorrow" | "next7" | "completed";
type SmartList = { key: SmartKey; label: string; icon: string; hint: string; empty: { title: string; copy: string } };

const SMART_LISTS: SmartList[] = [
  { key: "all", label: "All Dates", icon: "calendar-outline", hint: "All dates", empty: { title: "Nothing captured yet", copy: "Tap + to start your first task." } },
  { key: "today", label: "Today", icon: "sunny-outline", hint: "Due today & overdue", empty: { title: "You're all clear for today", copy: "Enjoy the calm or capture a fresh idea." } },
  { key: "tomorrow", label: "Tomorrow", icon: "partly-sunny-outline", hint: "Due tomorrow", empty: { title: "Nothing lined up tomorrow", copy: "A soft landing awaits." } },
  { key: "next7", label: "Next 7 Days", icon: "calendar-outline", hint: "Due in the next week", empty: { title: "A gentle week ahead", copy: "Plan what matters when you're ready." } },
  { key: "completed", label: "Completed", icon: "checkmark-done-outline", hint: "Recently finished", empty: { title: "No wins yet", copy: "Every finished task will land here." } },
];

type Selection = { kind: "smart"; key: SmartKey } | { kind: "list"; id: string };

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
    dismissReminder,
    signOut,
    deleteList,
    notifications,
    unreadNotificationCount,
    refresh,
  } = useApp();
  const [composer, setComposer] = useState<ComposerKind | null>(null);
  const inboxList = useMemo(() => lists.find((item) => item.system), [lists]);
  const [selection, setSelection] = useState<Selection>({ kind: "smart", key: "all" });
  const [allDatesScope, setAllDatesScope] = useState<"all" | "mine" | "other">("all");
  const [selectedOtherAssignee, setSelectedOtherAssignee] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsModal, setNotificationsModal] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

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
  const [arrangeBy, setArrangeBy] = useState<"due_date" | "priority" | "title" | "created">("due_date");

  // View Options state
  const [showOverdueSection, setShowOverdueSection] = useState(true);
  const [showCompletedSection, setShowCompletedSection] = useState(true);
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
  const [editModalTask, setEditModalTask] = useState<Task | null>(null);
  const [postponeModalTask, setPostponeModalTask] = useState<Task | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; taskId: string | null; action: "completed" | "restored" }>({ visible: false, taskId: null, action: "completed" });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherAssignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const t of tasks) {
      if (t.completed) continue;
      const isMine = Boolean(
        user?.id && (
          t.assigneeId === user.id ||
          t.assignee_id === user.id ||
          t.assignee?.id === user.id ||
          (Array.isArray(t.assigneeIds) && t.assigneeIds.includes(user.id))
        )
      );
      if (isMine) continue;

      const assignedList: { id: string; name: string }[] = [];
      if (t.assignee && t.assignee.id) {
        const name = `${t.assignee.firstName ?? ""} ${t.assignee.lastName ?? ""}`.trim() || t.assignee.email || t.assigneeName || "Unknown";
        assignedList.push({ id: t.assignee.id, name });
      } else if (t.assigneeId || t.assignee_id) {
        const aid = (t.assigneeId || t.assignee_id)!;
        const u = assignableUsers.find((usr) => usr.id === aid);
        const name = u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : t.assigneeName || "Unknown";
        assignedList.push({ id: aid, name });
      } else if (Array.isArray(t.assigneeIds) && t.assigneeIds.length > 0) {
        for (const aid of t.assigneeIds) {
          if (aid === user?.id) continue;
          const u = assignableUsers.find((usr) => usr.id === aid);
          const name = u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : t.assigneeName || "Unknown";
          assignedList.push({ id: aid, name });
        }
      } else if (t.assigneeName) {
        assignedList.push({ id: t.assigneeName, name: t.assigneeName });
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
  }, [tasks, user?.id, assignableUsers]);

  const activeListDoc = selection.kind === "list" ? lists.find((item) => item.id === selection.id) : null;
  const activeSmart = selection.kind === "smart" ? SMART_LISTS.find((item) => item.key === selection.key) : null;
  const headerTitle = useMemo(() => {
    if (selection.kind === "list") return activeListDoc?.name ?? "Tasks";
    if (selection.key === "all") {
      if (allDatesScope === "other" && selectedOtherAssignee) {
        const found = otherAssignees.find(
          (a) => a.id === selectedOtherAssignee || a.name === selectedOtherAssignee
        );
        return found?.name ?? selectedOtherAssignee;
      }
      return "All Dates";
    }
    return activeSmart?.label ?? "Tasks";
  }, [selection, activeListDoc, activeSmart, allDatesScope, selectedOtherAssignee, otherAssignees]);

  const { assignedToMeCount, otherCount } = useMemo(() => {
    let mine = 0;
    let other = 0;
    for (const t of tasks) {
      if (t.completed) continue;
      const isMine = Boolean(
        user?.id && (
          t.assigneeId === user.id ||
          t.assignee_id === user.id ||
          t.assignee?.id === user.id ||
          (Array.isArray(t.assigneeIds) && t.assigneeIds.includes(user.id))
        )
      );
      if (isMine) {
        mine++;
      } else {
        other++;
      }
    }
    return { assignedToMeCount: mine, otherCount: other };
  }, [tasks, user?.id]);

  const activeTasks = useMemo(() => {
    let result = filterActiveTasks(tasks, selection, user?.id);

    // Filter All Dates by Assignee Scope (Assigned to me vs Other)
    if (selection.kind === "smart" && selection.key === "all") {
      if (allDatesScope === "mine" && user?.id) {
        result = result.filter(
          (t) =>
            t.assigneeId === user.id ||
            t.assignee_id === user.id ||
            t.assignee?.id === user.id ||
            (Array.isArray(t.assigneeIds) && t.assigneeIds.includes(user.id))
        );
      } else if (allDatesScope === "other" && user?.id) {
        if (selectedOtherAssignee) {
          result = result.filter((t) => {
            const name = t.assignee ? `${t.assignee.firstName ?? ""} ${t.assignee.lastName ?? ""}`.trim() : t.assigneeName;
            const matchesId =
              t.assigneeId === selectedOtherAssignee ||
              t.assignee_id === selectedOtherAssignee ||
              t.assignee?.id === selectedOtherAssignee ||
              (Array.isArray(t.assigneeIds) && t.assigneeIds.includes(selectedOtherAssignee));
            const matchesName = name === selectedOtherAssignee;
            return matchesId || matchesName;
          });
        } else {
          result = result.filter(
            (t) =>
              t.assigneeId !== user.id &&
              t.assignee_id !== user.id &&
              t.assignee?.id !== user.id &&
              (!Array.isArray(t.assigneeIds) || !t.assigneeIds.includes(user.id))
          );
        }
      }
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
          (Array.isArray(t.assigneeIds) && t.assigneeIds.includes(filterAssignee));
        return name === filterAssignee || matchesId;
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
  }, [tasks, selection, user?.id, allDatesScope, selectedOtherAssignee, filterPriority, filterAssignee, arrangeBy]);

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

  const completedTasks = useMemo(() => filterCompletedTasks(tasks, selection), [tasks, selection]);

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
    lists.forEach((list) => {
      map[list.id] = tasks.filter(
        (task) =>
          !task.completed &&
          (task.list_id === list.id ||
            task.projectId === list.id ||
            (list.id === "inbox" && (!task.list_id || task.list_id === "inbox" || task.list_id === "personal" || task.list_id === "work")) ||
            (list.system && list.name.toLowerCase() === "inbox" && (!task.list_id || task.list_id === "inbox" || task.list_id === "personal" || task.list_id === "work")))
      ).length;
    });
    return map;
  }, [tasks, lists]);
  const smartCounts = useMemo(() => {
    const map: Record<SmartKey, number> = { today: 0, tomorrow: 0, next7: 0, all: 0, completed: 0 };
    SMART_LISTS.forEach((sl) => { map[sl.key] = filterActiveTasks(tasks, { kind: "smart", key: sl.key }, user?.id).length; });
    map.completed = tasks.filter((t) => t.completed).length;
    return map;
  }, [tasks, user?.id]);

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

  const handleToggleTask = (task: Task) => {
    const isCompleting = !task.completed;
    if (isCompleting) {
      playPopSound();
    }
    void toggleTask(task);

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

  return (
    <View style={styles.screen}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 6 }]}>
        <Pressable testID="open-drawer" onPress={() => setDrawer(true)} style={styles.iconButton}>
          <Ionicons name="menu" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {activeListDoc ? `${activeListDoc.emoji} ${activeListDoc.name}` : headerTitle}
        </Text>
        {activeTasks.length > 0 ? (
          <Text style={styles.headerCount}>{activeTasks.length} tasks</Text>
        ) : null}
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

      {/* Scope Selector inside All Dates: All | Assigned to me | Other */}
      {selection.kind === "smart" && selection.key === "all" ? (
        <View style={styles.allDatesScopeContainer}>
          <View style={styles.allDatesSegmentedControl}>
            <Pressable
              testID="scope-all"
              onPress={() => {
                setAllDatesScope("all");
                setSelectedOtherAssignee(null);
              }}
              style={[
                styles.scopeSegment,
                allDatesScope === "all" && styles.scopeSegmentActive,
              ]}
            >
              <Text
                style={[
                  styles.scopeSegmentText,
                  allDatesScope === "all" && styles.scopeSegmentTextActive,
                ]}
              >
                All
              </Text>
              <View
                style={[
                  styles.scopeBadge,
                  allDatesScope === "all" && styles.scopeBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.scopeBadgeText,
                    allDatesScope === "all" && styles.scopeBadgeTextActive,
                  ]}
                >
                  {smartCounts.all}
                </Text>
              </View>
            </Pressable>

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
      {selection.kind === "smart" && selection.key === "all" && allDatesScope === "other" && otherAssignees.length > 0 ? (
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

        {activeTasks.length === 0 && completedTasks.length === 0 ? (
          <EmptyState title={activeListDoc ? "No tasks" : activeSmart?.empty.title ?? "No tasks"} copy={activeListDoc ? "Captures all your tasks and ideas" : activeSmart?.empty.copy ?? ""} icon={activeListDoc?.emoji ?? null} styles={styles} colors={colors} />
        ) : (
          <>
            {/* Overdue Box on Top */}
            {overdueTasks.length > 0 ? (
              <View style={styles.overdueCardGroup}>
                <Pressable
                  testID="toggle-overdue-section"
                  onPress={() => setShowOverdueSection((val) => !val)}
                  style={styles.overdueCardHeader}
                >
                  <View style={styles.overdueHeaderLeft}>
                    <Ionicons name="alert-circle" size={17} color={colors.error} />
                    <Text style={styles.overdueCardTitle}>Overdue</Text>
                    <View style={styles.overdueCountBadge}>
                      <Text style={styles.overdueCountBadgeText}>{overdueTasks.length}</Text>
                    </View>
                  </View>
                  <Ionicons
                    name={showOverdueSection ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>

                {showOverdueSection ? (
                  <View style={styles.overdueListBody}>
                    {overdueTasks.map((task, index) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onPress={(t) => setDetailTask(t)}
                        onToggle={() => handleToggleTask(task)}
                        onDelete={() => deleteTask(task.id)}
                        onPostpone={(t) => setPostponeModalTask(t)}
                        listsById={lists}
                        isLast={index === overdueTasks.length - 1}
                        showDetails={showDetails}
                        showTime={showTime}
                        styles={styles}
                        colors={colors}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Regular Tasks Group */}
            {regularTasks.length > 0 ? (
              <View style={styles.cardGroup}>
                {regularTasks.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onPress={(t) => setDetailTask(t)}
                    onToggle={() => handleToggleTask(task)}
                    onDelete={() => deleteTask(task.id)}
                    onPostpone={(t) => setPostponeModalTask(t)}
                    listsById={lists}
                    isLast={index === regularTasks.length - 1}
                    showDetails={showDetails}
                    showTime={showTime}
                    styles={styles}
                    colors={colors}
                  />
                ))}
              </View>
            ) : null}
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
        defaultAssigneeIds={
          allDatesScope === "mine" && user?.id
            ? [user.id]
            : selectedOtherAssignee
            ? [selectedOtherAssignee]
            : undefined
        }
      />

      <DrawerSheet
        visible={drawer}
        selection={selection}
        lists={lists}
        listCounts={listCounts}
        smartCounts={smartCounts}
        allDatesScope={allDatesScope}
        assignedToMeCount={assignedToMeCount}
        otherCount={otherCount}
        userName={displayName}
        userEmail={user?.email ?? ""}
        onSelectSmart={(key) => {
          setSelection({ kind: "smart", key });
          if (key === "all") {
            setAllDatesScope("all");
            setSelectedOtherAssignee(null);
          }
          setDrawer(false);
        }}
        onSelectAllDatesScope={(scope) => {
          setSelection({ kind: "smart", key: "all" });
          setAllDatesScope(scope);
          setSelectedOtherAssignee(null);
          setDrawer(false);
        }}
        onSelectList={(id) => { setSelection({ kind: "list", id }); setDrawer(false); }}
        onDeleteList={(id, name) => handleDeleteList(id, name)}
        onNavigateFocus={() => { setDrawer(false); router.push("/(tabs)/focus"); }}
        onNavigateHabits={() => { setDrawer(false); router.push("/(tabs)/habits"); }}
        onClose={() => setDrawer(false)}
        styles={styles}
        colors={colors}
      />

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
    </View>
  );
}

export function isTaskOverdue(task: Task): boolean {
  if (task.completed || !task.due_date) return false;
  const parsed = parseTaskDate(task.due_date);
  if (!parsed) return false;
  return parsed.getTime() < startOfDay(new Date()).getTime();
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
      case "today":
        result = tasks.filter((task) => {
          if (task.completed) return false;
          if (!task.due_date) {
            const createdTime = task.created_at || task.createdAt;
            if (createdTime) {
              const createdDate = startOfDay(new Date(createdTime));
              return createdDate.getTime() <= today.getTime();
            }
            return false;
          }
          const parsed = parseTaskDate(task.due_date);
          if (!parsed) return false;
          const taskDate = startOfDay(parsed);
          return taskDate.getTime() <= today.getTime();
        });
        break;
      case "tomorrow":
        result = tasks.filter((task) => {
          if (task.completed || !task.due_date) return false;
          const parsed = parseTaskDate(task.due_date);
          if (!parsed) return false;
          return startOfDay(parsed).getTime() === tomorrow.getTime();
        });
        break;
      case "next7":
        result = tasks.filter((task) => {
          if (task.completed || !task.due_date) return false;
          const parsed = parseTaskDate(task.due_date);
          if (!parsed) return false;
          const taskDate = startOfDay(parsed);
          return isBefore(taskDate, addDays(in7, 1)) && !isBefore(taskDate, today);
        });
        break;
      case "all":
        result = tasks.filter((task) => !task.completed);
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
    return getUpcomingTaskTimestamp(a) - getUpcomingTaskTimestamp(b);
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
        result = tasks.filter((task) => {
          if (!task.completed || !task.due_date) return false;
          const parsed = parseTaskDate(task.due_date);
          if (!parsed) return false;
          const taskDate = startOfDay(parsed);
          return taskDate.getTime() === today.getTime();
        });
        break;
      case "tomorrow":
        result = tasks.filter((task) => {
          if (!task.completed || !task.due_date) return false;
          const parsed = parseTaskDate(task.due_date);
          if (!parsed) return false;
          return startOfDay(parsed).getTime() === tomorrow.getTime();
        });
        break;
      case "next7":
        result = tasks.filter((task) => {
          if (!task.completed || !task.due_date) return false;
          const parsed = parseTaskDate(task.due_date);
          if (!parsed) return false;
          const taskDate = startOfDay(parsed);
          return isBefore(taskDate, addDays(in7, 1)) && !isBefore(taskDate, today);
        });
        break;
      case "all":
        result = tasks.filter((task) => task.completed);
        break;
      case "completed":
        result = tasks.filter((task) => task.completed);
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

function TaskRow({ task, onPress, onToggle, onDelete, onPostpone, listsById, isLast, showDetails = true, showTime = true, styles, colors }: { task: Task; onPress: (task: Task) => void; onToggle: () => void; onDelete: () => void; onPostpone?: (task: Task) => void; listsById: TaskList[]; isLast?: boolean; showDetails?: boolean; showTime?: boolean; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  const taskList = listsById.find((item) => item.id === task.list_id || item.id === task.projectId);
  const assigneeName = task.assignee
    ? `${task.assignee.firstName ?? ""} ${task.assignee.lastName ?? ""}`.trim()
    : task.assigneeName;
  const dueDateLabel = formatTaskDueDateDisplay(task.due_date);
  const isOverdue = isTaskOverdue(task);

  // Due date text color: red if overdue, blue (#3B82F6 / brandPrimary) if scheduled
  const dateColor = (() => {
    if (task.completed || !task.due_date) return null;
    if (isOverdue) return "#EF4444";
    return colors.brandPrimary || "#3B82F6";
  })();

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

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dy) < 15;
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        const SWIPE_THRESHOLD = 80;
        if (gestureState.dx > SWIPE_THRESHOLD) {
          // Swipe Right -> Complete Task
          Animated.timing(translateX, {
            toValue: 400,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            handleCheck();
            translateX.setValue(0);
          });
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Swipe Left -> Delete Task
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
      <Animated.View style={[styles.swipeActionRight, { opacity: rightOpacity }]}>
        <Animated.View style={{ transform: [{ scale: rightScale }], flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.swipeActionText}>Delete</Text>
          <Ionicons name="trash" size={20} color="#FFFFFF" />
        </Animated.View>
      </Animated.View>

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
          onLongPress={onDelete}
          style={({ pressed }) => [styles.taskRowInner, pressed && styles.rowPressed]}
        >
          {/* Checkbox with bounce */}
          <Pressable testID={`toggle-${task.id}`} onPress={handleCheck} style={styles.checkboxTouch}>
            <Animated.View style={[styles.checkbox, task.completed && styles.checkboxDone, { transform: [{ scale: checkScale }] }]}>
              {task.completed ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
            </Animated.View>
          </Pressable>

          {/* Main Content (Title & optional Assignee) */}
          <View style={styles.taskContent}>
            <Text style={[styles.taskTitle, task.completed && styles.taskDone]} numberOfLines={2}>
              {task.title}
            </Text>
            {showDetails && (assigneeName || (taskList && !taskList.system)) ? (
              <View style={styles.metaRow}>
                {assigneeName ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="person-outline" size={11} color={colors.muted} />
                    <Text style={styles.metaText} numberOfLines={1}>{assigneeName}</Text>
                  </View>
                ) : null}

                {assigneeName && taskList && !taskList.system ? (
                  <Text style={styles.metaDot}>·</Text>
                ) : null}

                {taskList && !taskList.system ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="folder-outline" size={11} color="#EAB308" />
                    <Text style={styles.metaText} numberOfLines={1}>{taskList.name}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Right: Date & Time + Alarm / Postpone Icon */}
          {showTime && !task.completed && dueDateLabel ? (
            <View style={styles.taskRightMeta}>
              <Text style={[styles.taskDateText, { color: dateColor || colors.brandPrimary }]} numberOfLines={1}>
                {dueDateLabel}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="alarm-outline" size={13} color="#9CA3AF" style={styles.alarmIcon} />
                {onPostpone ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() => onPostpone(task)}
                    style={styles.postponeQuickBtn}
                    testID={`postpone-task-${task.id}`}
                  >
                    <Ionicons name="time-outline" size={14} color={colors.brandPrimary} />
                  </Pressable>
                ) : null}
              </View>
            </View>
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
  onClose: () => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const insets = useSafeAreaInsets();
  const { user, reorderLists } = useApp();
  const [isDragging, setIsDragging] = useState(false);

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
    onClose,
    styles,
    colors,
  } = props;
  const activeListId = selection.kind === "list" ? selection.id : null;
  const activeSmart = selection.kind === "smart" ? selection.key : null;

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

            <View style={styles.drawerSectionHeader}>
              <Text style={styles.drawerSection}>Lists</Text>
            </View>

            <DraggableListSection
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
            />

            <View style={styles.drawerSectionHeader}>
              <Text style={styles.drawerSection}>Tools</Text>
            </View>
            <Pressable testID="drawer-focus" onPress={onNavigateFocus} style={({ pressed }) => [styles.drawerRow, pressed && styles.rowPressed]}>
              <View style={styles.drawerIcon}><Ionicons name="timer-outline" size={18} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerLabel}>Focus timer</Text>
                <Text style={styles.drawerHint}>Pomodoro 25 · beat procrastination</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
            <Pressable testID="drawer-habits" onPress={onNavigateHabits} style={({ pressed }) => [styles.drawerRow, pressed && styles.rowPressed]}>
              <View style={styles.drawerIcon}><Ionicons name="leaf-outline" size={18} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerLabel}>Habit tracker</Text>
                <Text style={styles.drawerHint}>60+ ideas · streaks & rituals</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
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
            <Text style={styles.modalTitle}>Filter Tasks</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalSectionTitle}>Priority</Text>
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

            {assignees && assignees.length > 0 ? (
              <>
                <Text style={styles.modalSectionTitle}>Assignee</Text>
                <Pressable
                  onPress={() => setTempAssignee("all")}
                  style={styles.modalOptionRow}
                >
                  <Text style={[styles.modalOptionText, tempAssignee === "all" && styles.modalOptionTextActive]}>
                    All Assignees
                  </Text>
                  {tempAssignee === "all" ? (
                    <Ionicons name="checkmark" size={18} color={colors.brandPrimary} />
                  ) : null}
                </Pressable>
                {assignees.map((u) => {
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() => setTempAssignee(u.name)}
                      style={styles.modalOptionRow}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        <Ionicons name="person-outline" size={14} color={colors.muted} />
                        <Text style={[styles.modalOptionText, tempAssignee === u.name && styles.modalOptionTextActive, { flex: 1 }]} numberOfLines={1}>
                          {u.name}
                        </Text>
                        {u.count !== undefined ? (
                          <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "500", marginRight: 6 }}>
                            {u.count}
                          </Text>
                        ) : null}
                      </View>
                      {tempAssignee === u.name ? (
                        <Ionicons name="checkmark" size={18} color={colors.brandPrimary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </>
            ) : null}
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

  /* Overdue Box — highlighted card container on top */
  overdueCardGroup: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#FECACA",
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  taskRowInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  taskRowLast: { borderBottomWidth: 0 },
  rowPressed: { opacity: 0.65 },

  checkboxTouch: { padding: 4, margin: -4 },
  checkbox: {
    width: 19,
    height: 19,
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
    backgroundColor: "rgba(0,0,0,0.45)",
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
    fontSize: 18,
    fontWeight: "700",
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
    gap: 12,
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

