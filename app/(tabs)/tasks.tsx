import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { addDays, formatDistanceToNow, isBefore, parseISO, startOfDay, format } from "date-fns";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Alert, Animated, ColorValue, Image, Modal, PanResponder, Pressable, ScrollView, Text, View } from "react-native";
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
import { useApp } from "@/src/app-context";
import { makeStyles, useTheme } from "@/src/theme";
import type { Reminder, Task, TaskList } from "@/src/types";
import { playPopSound } from "@/src/utils/sound";
import { parseTaskDate, getTaskTimestamp, getUpcomingTaskTimestamp, formatTaskDueDateDisplay } from "@/src/utils/date-utils";

type LooseIconProps = { name: string; size: number; color?: ColorValue };
const Ionicons = BaseIonicons as unknown as ComponentType<LooseIconProps>;

const REMINDER_LABELS: Record<string, string> = {
  on_due: "On due date",
  "1_hour_before": "1 hour before",
  "1_day_before": "1 day before",
  "3_days_before": "3 days before",
};
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

type SmartKey = "today" | "tomorrow" | "next7" | "all" | "completed";
type SmartList = { key: SmartKey; label: string; icon: string; hint: string; empty: { title: string; copy: string } };

const SMART_LISTS: SmartList[] = [
  { key: "today", label: "Today", icon: "sunny-outline", hint: "Due today", empty: { title: "You're all clear for today", copy: "Enjoy the calm or capture a fresh idea." } },
  { key: "tomorrow", label: "Tomorrow", icon: "partly-sunny-outline", hint: "Due tomorrow", empty: { title: "Nothing lined up tomorrow", copy: "A soft landing awaits." } },
  { key: "next7", label: "Next 7 Days", icon: "calendar-outline", hint: "Due in the next week", empty: { title: "A gentle week ahead", copy: "Plan what matters when you're ready." } },
  { key: "all", label: "All Tasks", icon: "layers-outline", hint: "Everything active", empty: { title: "Nothing captured yet", copy: "Tap + to start your first task." } },
  { key: "completed", label: "Completed", icon: "checkmark-done-outline", hint: "Recently finished", empty: { title: "No wins yet", copy: "Every finished task will land here." } },
];

type Selection = { kind: "smart"; key: SmartKey } | { kind: "list"; id: string };

export default function TasksScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, tasks, reminders, lists, toggleTask, deleteTask, dismissReminder, signOut, deleteList } = useApp();
  const [composer, setComposer] = useState<ComposerKind | null>(null);
  const inboxList = useMemo(() => lists.find((item) => item.system), [lists]);
  const [selection, setSelection] = useState<Selection>({ kind: "smart", key: "today" });
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);

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

  const [showCompletedSection, setShowCompletedSection] = useState(true);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; taskId: string | null; action: "completed" | "restored" }>({ visible: false, taskId: null, action: "completed" });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeListDoc = selection.kind === "list" ? lists.find((item) => item.id === selection.id) : null;
  const activeSmart = selection.kind === "smart" ? SMART_LISTS.find((item) => item.key === selection.key) : null;
  const headerTitle = activeListDoc?.name ?? activeSmart?.label ?? "Tasks";

  const activeTasks = useMemo(() => filterActiveTasks(tasks, selection, user?.id), [tasks, selection, user?.id]);
  const completedTasks = useMemo(() => filterCompletedTasks(tasks, selection), [tasks, selection]);

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
        <Pressable testID="open-menu" onPress={() => setMenu(true)} style={styles.iconButton}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} testID="tasks-scroll">
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
            {activeTasks.length > 0 ? (
              <View style={styles.cardGroup}>
                {activeTasks.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onPress={(t) => setDetailTask(t)}
                    onToggle={() => handleToggleTask(task)}
                    onDelete={() => deleteTask(task.id)}
                    listsById={lists}
                    isLast={index === activeTasks.length - 1}
                    styles={styles}
                    colors={colors}
                  />
                ))}
              </View>
            ) : null}

            {/* Completed list card under active list */}
            {completedTasks.length > 0 && !isCompletedSmartKey ? (
              <View style={styles.completedCardGroup}>
                <Pressable
                  testID="toggle-completed-section"
                  onPress={() => setShowCompletedSection((val) => !val)}
                  style={styles.completedCardHeader}
                >
                  <Text style={styles.completedCardTitle}>Completed</Text>
                  <View style={styles.completedCardRight}>
                    <Text style={styles.completedCardCount}>{completedTasks.length}</Text>
                    <Ionicons
                      name={showCompletedSection ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={colors.muted}
                    />
                  </View>
                </Pressable>
                {showCompletedSection ? (
                  <View style={styles.completedListBody}>
                    {completedTasks.map((task, index) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onPress={(t) => setDetailTask(t)}
                        onToggle={() => handleToggleTask(task)}
                        onDelete={() => deleteTask(task.id)}
                        listsById={lists}
                        isLast={index === completedTasks.length - 1}
                        styles={styles}
                        colors={colors}
                      />
                    ))}
                  </View>
                ) : null}
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
      />

      <DrawerSheet
        visible={drawer}
        selection={selection}
        lists={lists}
        listCounts={listCounts}
        smartCounts={smartCounts}
        userName={displayName}
        userEmail={user?.email ?? ""}
        onSelectSmart={(key) => { setSelection({ kind: "smart", key }); setDrawer(false); }}
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
        styles={styles}
        colors={colors}
      />

      <ConfirmDeleteModal
        visible={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete list?"}
        message="Are you sure you want to delete this list? Tasks in this list will remain available in All Tasks."
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
        lists={lists}
      />
      <ConfirmSignOutModal
        visible={signOutModal}
        onClose={() => setSignOutModal(false)}
        onConfirm={handleConfirmSignOut}
      />
    </View>
  );
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
              return createdDate.getTime() === today.getTime();
            }
            return false;
          }
          const parsed = parseTaskDate(task.due_date);
          if (!parsed) return false;
          const taskDate = startOfDay(parsed);
          return taskDate.getTime() === today.getTime();
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
  return result.sort((a, b) => getUpcomingTaskTimestamp(a) - getUpcomingTaskTimestamp(b));
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

function TaskRow({ task, onPress, onToggle, onDelete, listsById, isLast, styles, colors }: { task: Task; onPress: (task: Task) => void; onToggle: () => void; onDelete: () => void; listsById: TaskList[]; isLast?: boolean; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  const taskList = listsById.find((item) => item.id === task.list_id || item.id === task.projectId);
  const assigneeName = task.assignee
    ? `${task.assignee.firstName ?? ""} ${task.assignee.lastName ?? ""}`.trim()
    : task.assigneeName;
  const dueDateLabel = formatTaskDueDateDisplay(task.due_date);

  // Date pill colors: red bg if overdue, orange bg if today, neutral otherwise
  const datePillStyle = (() => {
    if (task.completed || !task.due_date) return null;
    const parsed = parseTaskDate(task.due_date);
    if (!parsed) return null;
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = startOfDay(addDays(now, 1));
    if (parsed.getTime() < todayStart.getTime())
      return { bg: "#FEE2E2", text: "#DC2626" };    // overdue → red
    if (parsed.getTime() < tomorrowStart.getTime())
      return { bg: "#FFEDD5", text: "#EA580C" };     // today → orange
    return null;                                      // future → neutral gray
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
              {task.completed ? <Ionicons name="checkmark" size={14} color={colors.onBrandPrimary} /> : null}
            </Animated.View>
          </Pressable>

          {/* Content */}
          <View style={styles.taskContent}>
            {/* Title */}
            <Text style={[styles.taskTitle, task.completed && styles.taskDone]} numberOfLines={2}>
              {task.title}
            </Text>

            {/* Meta line: date pill + assignee + list */}
            {(dueDateLabel || assigneeName || (taskList && !taskList.system)) ? (
              <View style={styles.metaRow}>
                {/* Colored date pill */}
                {dueDateLabel ? (
                  <View style={[styles.datePill, datePillStyle ? { backgroundColor: datePillStyle.bg } : null]}>
                    <Text style={[styles.datePillText, datePillStyle ? { color: datePillStyle.text } : null]}>
                      {dueDateLabel}
                    </Text>
                  </View>
                ) : null}

                {/* Assignee */}
                {assigneeName ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="person-outline" size={13} color={colors.muted} />
                    <Text style={styles.metaText} numberOfLines={1}>{assigneeName}</Text>
                  </View>
                ) : null}

                {/* List */}
                {taskList && !taskList.system ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="folder" size={13} color="#EAB308" />
                    <Text style={styles.metaText}>{taskList.name}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
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
  userName: string;
  userEmail: string;
  onSelectSmart: (key: SmartKey) => void;
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
  const { visible, selection, lists, listCounts, smartCounts, userName, userEmail, onSelectSmart, onSelectList, onDeleteList, onNavigateFocus, onNavigateHabits, onClose, styles, colors } = props;
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
            {SMART_LISTS.map((list) => (
              <Pressable
                key={list.key}
                testID={`smart-${list.key}`}
                onPress={() => onSelectSmart(list.key)}
                style={({ pressed }) => [styles.drawerRow, activeSmart === list.key && styles.drawerRowActive, pressed && styles.rowPressed]}
              >
                <View style={[styles.drawerIcon, activeSmart === list.key && styles.drawerIconActive]}>
                  <Ionicons name={list.icon as never} size={18} color={activeSmart === list.key ? colors.onBrandPrimary : colors.brandPrimary} />
                </View>
                <Text style={[styles.drawerLabel, { flex: 1 }, activeSmart === list.key && styles.drawerLabelActive]}>{list.label}</Text>
                <Text style={[styles.drawerCount, activeSmart === list.key && { color: colors.brandPrimary, fontWeight: "600" }]}>{smartCounts[list.key]}</Text>
              </Pressable>
            ))}

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

function MenuSheet(props: { visible: boolean; onSignOut: () => void; onClose: () => void; onOpenVoice: () => void; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  const insets = useSafeAreaInsets();
  const { visible, onSignOut, onClose, onOpenVoice, styles, colors } = props;
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.menuBackdrop}>
        <Pressable onPress={() => { /* trap */ }} style={[styles.menuCard, { top: insets.top + 44 }]} testID="menu-card">
          <MenuItem icon="mic-outline" label="Voice capture" onPress={onOpenVoice} styles={styles} colors={colors} testID="menu-voice" />
          <MenuItem icon="funnel-outline" label="Filter" onPress={onClose} styles={styles} colors={colors} testID="menu-filter" />
          <MenuItem icon="options-outline" label="View options" onPress={onClose} styles={styles} colors={colors} testID="menu-view" />
          <MenuItem icon="swap-vertical-outline" label="Arrange tasks" onPress={onClose} styles={styles} colors={colors} testID="menu-arrange" />
          <MenuItem icon="share-social-outline" label="Share list" onPress={onClose} styles={styles} colors={colors} testID="menu-share" />
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

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8, gap: 4 },
  headerTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "700", flex: 1, marginLeft: 4 },
  headerCount: { color: colors.muted, fontSize: 13, fontWeight: "500" },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  content: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 120 },

  /* Task list — no card wrapper, flat on white bg */
  cardGroup: { paddingVertical: 0 },
  completedCardGroup: { paddingTop: 16, paddingBottom: 4, marginBottom: 14, borderTopWidth: 1, borderTopColor: colors.divider },
  completedCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, marginBottom: 2 },
  completedCardTitle: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  completedCardRight: { flexDirection: "row", alignItems: "center", gap: 6 },
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

  /* ── Task row (flat, inside white card) ── */
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

  taskRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  taskRowInner: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  taskRowLast: { borderBottomWidth: 0 },
  rowPressed: { opacity: 0.65 },

  checkboxTouch: { padding: 2, margin: -2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  checkboxDone: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },

  taskContent: { flex: 1, gap: 4 },
  taskTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "500", lineHeight: 22 },
  taskDone: { color: colors.muted, textDecorationLine: "line-through" },

  /* Meta row: date pill + person + list */
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: colors.muted, fontSize: 12, fontWeight: "400" },

  /* Colored date pill */
  datePill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.surfaceSecondary },
  datePillText: { color: colors.muted, fontSize: 11, fontWeight: "600" },

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

  menuBackdrop: { flex: 1, backgroundColor: "transparent" },
  menuCard: { position: "absolute", right: 12, backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 8, minWidth: 220, shadowColor: colors.surfaceInverse, shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  menuLabel: { fontSize: 14, fontWeight: "500" },
  menuDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 4 },
}));
