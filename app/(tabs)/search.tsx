/* eslint-disable react/no-unescaped-entities */
import { Ionicons } from "@expo/vector-icons";
import { addDays, isBefore, isSameDay, startOfDay } from "date-fns";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  ColorValue,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/app-context";
import { makeStyles, useTheme } from "@/src/theme";
import type { Task, TaskList } from "@/src/types";
import { formatTaskDueDateDisplay, parseTaskDate } from "@/src/utils/date-utils";
import { playPopSound } from "@/src/utils/sound";
import {
  FilterConditionsModal,
  type DateFilter,
  type FilterConditions,
  type FilterTab,
  type PriorityFilter,
  type TypeFilter,
} from "@/src/components/filter-conditions-modal";
import { TaskDetailModal } from "@/src/components/task-detail-modal";

const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No Priority",
};

const DATE_LABELS: Record<DateFilter, string> = {
  all: "Date",
  today: "Today",
  tomorrow: "Tomorrow",
  next7: "Next 7 Days",
  overdue: "Overdue",
  nodate: "No Date",
};

export default function SearchScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { tasks, lists, toggleTask, deleteTask } = useApp();

  const [query, setQuery] = useState("");
  const [conditions, setConditions] = useState<FilterConditions>({
    type: "task",
    priority: "all",
    listId: "all",
    date: "all",
  });

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterModalTab, setFilterModalTab] = useState<FilterTab>("Type");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [savedFilterToast, setSavedFilterToast] = useState(false);

  const trimmed = query.trim().toLowerCase();

  const openFilterTab = (tab: FilterTab) => {
    setFilterModalTab(tab);
    setFilterModalVisible(true);
  };

  // Map lists for fast ID lookups
  const listMap = useMemo(() => {
    const map = new Map<string, TaskList>();
    lists.forEach((l) => map.set(l.id, l));
    return map;
  }, [lists]);

  // Filter tasks based on query and all filter conditions
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // 1. Text Query Filter
      if (trimmed) {
        const titleMatch = task.title.toLowerCase().includes(trimmed);
        const notesMatch = task.notes?.toLowerCase().includes(trimmed);
        const tagsMatch = task.tags?.some((t) => t.toLowerCase().includes(trimmed));
        if (!titleMatch && !notesMatch && !tagsMatch) return false;
      }

      // 2. Type Filter
      if (conditions.type === "task") {
        // All actionable tasks
      } else if (conditions.type === "note") {
        // Tasks that have notes or note format
        if (!task.notes || task.notes.trim() === "") return false;
      }

      // 3. Priority Filter
      if (conditions.priority !== "all") {
        const p = (task.priority ?? "none").toLowerCase();
        if (conditions.priority === "high") {
          if (p !== "high" && p !== "critical") return false;
        } else if (conditions.priority === "medium") {
          if (p !== "medium") return false;
        } else if (conditions.priority === "low") {
          if (p !== "low") return false;
        } else if (conditions.priority === "none") {
          if (p !== "none" && p !== "") return false;
        }
      }

      // 4. List Filter
      if (conditions.listId !== "all") {
        if (conditions.listId === "inbox") {
          if (task.list_id && task.list_id !== "inbox" && !listMap.get(task.list_id)?.system) {
            return false;
          }
        } else {
          if (task.list_id !== conditions.listId && task.projectId !== conditions.listId) {
            return false;
          }
        }
      }

      // 5. Date Filter
      if (conditions.date !== "all") {
        if (conditions.date === "nodate") {
          if (task.due_date) return false;
        } else {
          if (!task.due_date) return false;
          const parsed = parseTaskDate(task.due_date);
          if (!parsed) return false;
          const today = startOfDay(new Date());

          if (conditions.date === "today") {
            if (!isSameDay(parsed, today)) return false;
          } else if (conditions.date === "tomorrow") {
            if (!isSameDay(parsed, addDays(today, 1))) return false;
          } else if (conditions.date === "next7") {
            const next7End = addDays(today, 7);
            if (isBefore(parsed, today) || parsed > next7End) return false;
          } else if (conditions.date === "overdue") {
            if (!isBefore(parsed, today) || task.completed) return false;
          }
        }
      }

      return true;
    });
  }, [tasks, trimmed, conditions, listMap]);

  const selectedListName = useMemo(() => {
    if (conditions.listId === "all") return "List";
    if (conditions.listId === "inbox") return "Inbox";
    const found = listMap.get(conditions.listId);
    return found ? (found.emoji ? `${found.emoji} ${found.name}` : found.name) : "List";
  }, [conditions.listId, listMap]);

  const handleToggle = (task: Task) => {
    if (!task.completed) {
      playPopSound();
    }
    void toggleTask(task);
  };

  const handleSaveFilter = () => {
    setSavedFilterToast(true);
    setTimeout(() => setSavedFilterToast(false), 2500);
  };

  const isFilterActive =
    conditions.type !== "all" ||
    conditions.priority !== "all" ||
    conditions.listId !== "all" ||
    conditions.date !== "all";

  const isInitialEmpty = trimmed === "" && !isFilterActive;

  return (
    <View style={styles.screen}>
      {/* Search Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable
              testID="search-clear"
              onPress={() => setQuery("")}
              style={styles.clearBtn}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          testID="search-cancel"
          onPress={() => router.back()}
          style={styles.cancelBtn}
          hitSlop={8}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      {/* Filter Chips Bar */}
      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {/* Active Type Chip with Close Button (Task x) */}
          {conditions.type !== "all" ? (
            <View style={[styles.chip, styles.chipActive]}>
              <Pressable
                testID="filter-chip-type-active"
                onPress={() => openFilterTab("Type")}
                style={styles.chipBody}
              >
                <Text style={[styles.chipText, styles.chipTextActive]}>
                  {conditions.type === "task" ? "Task" : "Note"}
                </Text>
              </Pressable>
              <Pressable
                testID="filter-chip-type-clear"
                onPress={() => setConditions((prev) => ({ ...prev, type: "all" }))}
                style={styles.chipCloseBtn}
                hitSlop={6}
              >
                <Ionicons name="close" size={14} color={colors.brandPrimary} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              testID="filter-chip-type"
              onPress={() => openFilterTab("Type")}
              style={styles.chip}
            >
              <Text style={styles.chipText}>Type</Text>
              <Ionicons name="chevron-down" size={14} color={colors.muted} />
            </Pressable>
          )}

          {/* List Chip */}
          <Pressable
            testID="filter-chip-list"
            onPress={() => openFilterTab("Lists")}
            style={[styles.chip, conditions.listId !== "all" && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                conditions.listId !== "all" && styles.chipTextActive,
              ]}
              numberOfLines={1}
            >
              {selectedListName}
            </Text>
            <Ionicons
              name="chevron-down"
              size={14}
              color={conditions.listId !== "all" ? colors.brandPrimary : colors.muted}
            />
          </Pressable>

          {/* Date Chip */}
          <Pressable
            testID="filter-chip-date"
            onPress={() => openFilterTab("Date")}
            style={[styles.chip, conditions.date !== "all" && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                conditions.date !== "all" && styles.chipTextActive,
              ]}
            >
              {DATE_LABELS[conditions.date]}
            </Text>
            <Ionicons
              name="chevron-down"
              size={14}
              color={conditions.date !== "all" ? colors.brandPrimary : colors.muted}
            />
          </Pressable>

          {/* Priority Chip */}
          <Pressable
            testID="filter-chip-priority"
            onPress={() => openFilterTab("Priority")}
            style={[styles.chip, conditions.priority !== "all" && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                conditions.priority !== "all" && styles.chipTextActive,
              ]}
            >
              {conditions.priority !== "all"
                ? PRIORITY_LABELS[conditions.priority]
                : "Priority"}
            </Text>
            <Ionicons
              name="chevron-down"
              size={14}
              color={conditions.priority !== "all" ? colors.brandPrimary : colors.muted}
            />
          </Pressable>

          {/* Type dropdown if not currently active chip */}
          {conditions.type === "all" ? (
            <Pressable
              testID="filter-chip-type-all"
              onPress={() => openFilterTab("Type")}
              style={styles.chip}
            >
              <Text style={styles.chipText}>Type</Text>
              <Ionicons name="chevron-down" size={14} color={colors.muted} />
            </Pressable>
          ) : null}
        </ScrollView>
      </View>

      {/* Results Header (Count & Save as filter) */}
      {!isInitialEmpty ? (
        <View style={styles.resultsBar}>
          <Text style={styles.resultsCount}>
            {filteredTasks.length} {filteredTasks.length === 1 ? "result" : "results"} found
          </Text>
          <Pressable
            testID="save-filter-btn"
            onPress={handleSaveFilter}
            style={styles.saveFilterBtn}
            hitSlop={6}
          >
            <Text style={styles.saveFilterText}>Save as filter</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Main Results / Empty Area */}
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isInitialEmpty ? (
          <EmptyState styles={styles} colors={colors} />
        ) : filteredTasks.length === 0 ? (
          <NoResults query={query} styles={styles} colors={colors} />
        ) : (
          <View style={styles.resultsCard}>
            {filteredTasks.map((task) => (
              <TaskSearchResultRow
                key={task.id}
                task={task}
                query={trimmed}
                list={task.list_id ? listMap.get(task.list_id) : undefined}
                onPress={() => setSelectedTask(task)}
                onToggle={() => handleToggle(task)}
                styles={styles}
                colors={colors}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Saved Filter Toast */}
      {savedFilterToast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 20 }]}>
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
          <Text style={styles.toastText}>Filter conditions saved</Text>
        </View>
      ) : null}

      {/* Filter Conditions Modal */}
      <FilterConditionsModal
        visible={filterModalVisible}
        initialTab={filterModalTab}
        conditions={conditions}
        lists={lists}
        onClose={() => setFilterModalVisible(false)}
        onApply={(newConditions) => setConditions(newConditions)}
      />

      {/* Task Detail Modal */}
      <TaskDetailModal
        visible={!!selectedTask}
        task={selectedTask}
        lists={lists}
        onClose={() => setSelectedTask(null)}
        onToggle={(t) => handleToggle(t)}
        onDelete={(id) => {
          void deleteTask(id);
          setSelectedTask(null);
        }}
      />
    </View>
  );
}

function TaskSearchResultRow({
  task,
  query,
  list,
  onPress,
  onToggle,
  styles,
  colors,
}: {
  task: Task;
  query: string;
  list?: TaskList;
  onPress: () => void;
  onToggle: () => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const p = (task.priority ?? "none").toLowerCase();
  const hasPriorityStripe = p === "high" || p === "critical" || p === "medium" || p === "low";
  const priorityStripeColor =
    p === "high" || p === "critical"
      ? "#EF4444"
      : p === "medium"
      ? "#F59E0B"
      : p === "low"
      ? "#3B82F6"
      : "transparent";

  const dueDisplay = formatTaskDueDateDisplay(task.due_date);
  const titleParts = highlight(task.title, query);
  const notesParts = task.notes ? highlight(task.notes, query) : [];

  return (
    <Pressable
      testID={`search-result-${task.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.taskRow,
        hasPriorityStripe && { borderLeftColor: priorityStripeColor, borderLeftWidth: 3 },
        pressed && styles.rowPressed,
      ]}
    >
      {/* Checkbox */}
      <Pressable
        testID={`task-check-${task.id}`}
        onPress={onToggle}
        style={[
          styles.checkbox,
          task.completed && styles.checkboxCompleted,
        ]}
        hitSlop={8}
      >
        {task.completed ? (
          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
        ) : null}
      </Pressable>

      {/* Main Info */}
      <View style={styles.taskContent}>
        {/* Title with yellow highlight */}
        <Text
          style={[styles.taskTitle, task.completed && styles.taskTitleCompleted]}
          numberOfLines={2}
        >
          {titleParts.map((part, index) =>
            part.match ? (
              <Text key={index} style={styles.highlightText}>
                {part.text}
              </Text>
            ) : (
              <Text key={index}>{part.text}</Text>
            )
          )}
        </Text>

        {/* Notes snippet with yellow highlight */}
        {task.notes && task.notes.trim().length > 0 ? (
          <Text
            style={[styles.taskNotes, task.completed && styles.taskNotesCompleted]}
            numberOfLines={2}
          >
            {notesParts.map((part, index) =>
              part.match ? (
                <Text key={index} style={styles.highlightText}>
                  {part.text}
                </Text>
              ) : (
                <Text key={index}>{part.text}</Text>
              )
            )}
          </Text>
        ) : null}

        {/* Meta Row: Date on left, List Badge on right */}
        <View style={styles.taskMetaRow}>
          {dueDisplay ? (
            <Text
              style={[
                styles.taskDueDate,
                dueDisplay.includes("Today") && styles.taskDueDateToday,
              ]}
            >
              {dueDisplay}
            </Text>
          ) : (
            <View />
          )}

          <View style={styles.listBadge}>
            <Text style={styles.listBadgeText}>
              {list?.emoji ? `${list.emoji} ` : ""}
              {list?.name || "Inbox"}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function highlight(text: string, query: string): { text: string; match: boolean }[] {
  if (!query) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let index = 0;

  while (index < text.length) {
    const found = lower.indexOf(q, index);
    if (found === -1) {
      parts.push({ text: text.slice(index), match: false });
      break;
    }
    if (found > index) {
      parts.push({ text: text.slice(index, found), match: false });
    }
    parts.push({ text: text.slice(found, found + q.length), match: true });
    index = found + q.length;
  }
  return parts;
}

function EmptyState({
  styles,
  colors,
}: {
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIllustration}>
        <View style={styles.emptyBlob} />
        {/* Document notepad */}
        <View style={styles.notepad}>
          <View style={styles.notepadHeader} />
          <View style={styles.notepadCheckRow}>
            <View style={styles.notepadSquare} />
            <View style={styles.notepadLine} />
          </View>
          <View style={styles.notepadCheckRow}>
            <View style={styles.notepadSquare} />
            <View style={styles.notepadLine} />
          </View>
        </View>
        {/* Pencil */}
        <View style={styles.pencil}>
          <View style={styles.pencilBody} />
          <View style={styles.pencilTip} />
        </View>
        {/* Sparkles */}
        <View style={styles.sparkle1}>
          <Ionicons name="sparkles" size={14} color="#3B82F6" />
        </View>
        <View style={styles.sparkle2}>
          <Ionicons name="sparkles" size={10} color="#1E293B" />
        </View>
      </View>
      <Text style={styles.emptyTitle}>Type keywords to search Task</Text>
    </View>
  );
}

function NoResults({
  query,
  styles,
  colors,
}: {
  query: string;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIllustration}>
        <View style={styles.emptyBlob} />
        <Ionicons name="search-outline" size={56} color={colors.brandPrimary} />
      </View>
      <Text style={styles.emptyTitle}>
        {query ? `No results for "${query}"` : "No matching tasks"}
      </Text>
      <Text style={styles.emptySubtitle}>
        Try adjusting your keywords or clearing filter conditions.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 12,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 2,
  },
  cancelBtn: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cancelText: {
    color: colors.brandPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  chipsRow: {
    paddingBottom: 8,
  },
  chipsScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
  },
  chipActive: {
    backgroundColor: colors.brandTertiary,
  },
  chipBody: {
    flexDirection: "row",
    alignItems: "center",
  },
  chipCloseBtn: {
    marginLeft: 2,
    padding: 2,
  },
  chipText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextActive: {
    color: colors.brandPrimary,
    fontWeight: "700",
  },
  resultsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  resultsCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  saveFilterBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  saveFilterText: {
    color: colors.brandPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  resultsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSecondary,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.8,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxCompleted: {
    backgroundColor: colors.muted,
    borderColor: colors.muted,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  taskTitleCompleted: {
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  taskNotes: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  taskNotesCompleted: {
    color: colors.muted,
  },
  highlightText: {
    backgroundColor: "#FDE047",
    color: "#111827",
    fontWeight: "700",
    borderRadius: 2,
  },
  taskMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  taskDueDate: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  taskDueDateToday: {
    color: colors.brandPrimary,
    fontWeight: "600",
  },
  listBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  listBadgeText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  emptyIllustration: {
    width: 180,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  emptyBlob: {
    position: "absolute",
    width: 160,
    height: 130,
    borderRadius: 80,
    backgroundColor: colors.surfaceSecondary,
  },
  notepad: {
    width: 80,
    height: 96,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#1E293B",
    padding: 10,
    transform: [{ rotate: "-6deg" }],
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  notepadHeader: {
    width: "40%",
    height: 4,
    backgroundColor: colors.brandPrimary,
    borderRadius: 2,
    marginBottom: 10,
  },
  notepadCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  notepadSquare: {
    width: 10,
    height: 10,
    borderWidth: 1.5,
    borderColor: "#3B82F6",
    borderRadius: 2,
  },
  notepadLine: {
    flex: 1,
    height: 4,
    backgroundColor: "#3B82F6",
    borderRadius: 2,
  },
  pencil: {
    position: "absolute",
    right: 28,
    bottom: 30,
    width: 8,
    height: 60,
    transform: [{ rotate: "35deg" }],
  },
  pencilBody: {
    flex: 1,
    backgroundColor: "#3B82F6",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  pencilTip: {
    height: 8,
    backgroundColor: "#CBD5E1",
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  sparkle1: {
    position: "absolute",
    top: 24,
    right: 32,
  },
  sparkle2: {
    position: "absolute",
    top: 36,
    left: 36,
  },
  emptyTitle: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1F2937",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
}));
