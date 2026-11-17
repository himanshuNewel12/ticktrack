/* eslint-disable react/no-unescaped-entities */
import { Ionicons } from "@expo/vector-icons";
import { addDays, format, isBefore, isSameDay, startOfDay } from "date-fns";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
import { TaskEditModal } from "@/src/components/task-edit-modal";
import { PostponeActivityModal } from "@/src/components/postpone-activity-modal";

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
  const { user, tasks: allTasks, lists, toggleTask, deleteTask, editTask, refresh } = useApp();
  const canSeeOtherTasks = user?.role === "ADMIN" || user?.role === "TL" || user?.role === "PM";
  const tasks = useMemo(() => {
    if (canSeeOtherTasks || !user?.id) return allTasks;
    return allTasks.filter(
      (t) =>
        t.assigneeId === user.id ||
        t.assignee_id === user.id ||
        t.assignee?.id === user.id ||
        (Array.isArray(t.assigneeIds) && t.assigneeIds.includes(user.id)) ||
        (Array.isArray(t.assignees) && t.assignees.some((a) => a.id === user.id)) ||
        t.createdById === user.id ||
        t.createdBy?.id === user.id
    );
  }, [allTasks, user?.id, canSeeOtherTasks]);

  const [query, setQuery] = useState("");
  const [conditions, setConditions] = useState<FilterConditions>({
    type: "all",
    priority: "all",
    listId: "all",
    date: "all",
  });

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterModalTab, setFilterModalTab] = useState<FilterTab>("Date");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);
  const setSelectedTask = useCallback((t: Task | null) => setSelectedTaskId(t ? t.id : null), []);
  const [editModalTask, setEditModalTask] = useState<Task | null>(null);
  const [postponeModalTask, setPostponeModalTask] = useState<Task | null>(null);
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

  // Helper to extract all searchable text from a task
  const getTaskSearchableText = useCallback(
    (task: Task) => {
      const parts: string[] = [];

      if (task.title) parts.push(task.title);
      if (task.notes) parts.push(task.notes);

      // Assignee (first name, last name, full name, email, assigneeName, assignees array)
      if (task.assignee) {
        const full = `${task.assignee.firstName ?? ""} ${task.assignee.lastName ?? ""}`.trim();
        if (full) parts.push(full);
        if (task.assignee.firstName) parts.push(task.assignee.firstName);
        if (task.assignee.lastName) parts.push(task.assignee.lastName);
        if (task.assignee.email) parts.push(task.assignee.email);
      }
      if (task.assigneeName) parts.push(task.assigneeName);
      if (Array.isArray(task.assignees)) {
        task.assignees.forEach((a) => {
          if (a.name) parts.push(a.name);
          if (a.email) parts.push(a.email);
        });
      }

      // Creator (first name, last name, full name, email, createdByName)
      if (task.createdBy) {
        const full = `${task.createdBy.firstName ?? ""} ${task.createdBy.lastName ?? ""}`.trim();
        if (full) parts.push(full);
        if (task.createdBy.name) parts.push(task.createdBy.name);
        if (task.createdBy.firstName) parts.push(task.createdBy.firstName);
        if (task.createdBy.lastName) parts.push(task.createdBy.lastName);
        if (task.createdBy.email) parts.push(task.createdBy.email);
      }
      if (task.createdByName) parts.push(task.createdByName);

      // List or Project name
      const listObj = listMap.get(task.list_id || task.projectId || "");
      if (listObj?.name) parts.push(listObj.name);

      // Tags
      if (Array.isArray(task.tags)) {
        parts.push(...task.tags);
      }

      // Priority
      if (task.priority) {
        parts.push(task.priority);
      }

      // Due date text
      if (task.due_date) {
        parts.push(task.due_date);
        const parsed = parseTaskDate(task.due_date);
        if (parsed) {
          parts.push(format(parsed, "d MMM"));
          parts.push(format(parsed, "MMMM"));
          parts.push(format(parsed, "d MMMM yyyy"));
        }
      }

      // Action remarks
      if (Array.isArray(task.actions)) {
        task.actions.forEach((a) => {
          if (a.remarks) parts.push(a.remarks);
          if (a.actorName) parts.push(a.actorName);
        });
      }

      return parts.join(" ").toLowerCase();
    },
    [listMap]
  );

  // Filter tasks based on query and all filter conditions
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // 1. Text Query Filter
      if (trimmed) {
        const searchable = getTaskSearchableText(task);
        const keywords = trimmed.split(/\s+/).filter(Boolean);
        const matched =
          searchable.includes(trimmed) ||
          (keywords.length > 0 && keywords.every((kw) => searchable.includes(kw)));
        if (!matched) return false;
      }

      // 2. Priority Filter
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

      // 3. Date Filter
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
  }, [tasks, trimmed, conditions]);

  const handleToggle = (task: Task, remarks?: string) => {
    if (!task.completed) {
      playPopSound();
    }
    void toggleTask(task, remarks);
  };

  const handleSaveFilter = () => {
    setSavedFilterToast(true);
    setTimeout(() => setSavedFilterToast(false), 2500);
  };

  const isFilterActive =
    conditions.priority !== "all" ||
    conditions.date !== "all";

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
          {/* Date Chip */}
          {conditions.date !== "all" ? (
            <View style={[styles.chip, styles.chipActive]}>
              <Pressable
                testID="filter-chip-date-active"
                onPress={() => openFilterTab("Date")}
                style={styles.chipBody}
              >
                <Text style={[styles.chipText, styles.chipTextActive]}>
                  {DATE_LABELS[conditions.date]}
                </Text>
              </Pressable>
              <Pressable
                testID="filter-chip-date-clear"
                onPress={() => setConditions((prev) => ({ ...prev, date: "all" }))}
                style={styles.chipCloseBtn}
                hitSlop={6}
              >
                <Ionicons name="close" size={14} color={colors.brandPrimary} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              testID="filter-chip-date"
              onPress={() => openFilterTab("Date")}
              style={styles.chip}
            >
              <Text style={styles.chipText}>Date</Text>
              <Ionicons name="chevron-down" size={14} color={colors.muted} />
            </Pressable>
          )}

          {/* Priority Chip */}
          {conditions.priority !== "all" ? (
            <View style={[styles.chip, styles.chipActive]}>
              <Pressable
                testID="filter-chip-priority-active"
                onPress={() => openFilterTab("Priority")}
                style={styles.chipBody}
              >
                <Text style={[styles.chipText, styles.chipTextActive]}>
                  {PRIORITY_LABELS[conditions.priority]}
                </Text>
              </Pressable>
              <Pressable
                testID="filter-chip-priority-clear"
                onPress={() => setConditions((prev) => ({ ...prev, priority: "all" }))}
                style={styles.chipCloseBtn}
                hitSlop={6}
              >
                <Ionicons name="close" size={14} color={colors.brandPrimary} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              testID="filter-chip-priority"
              onPress={() => openFilterTab("Priority")}
              style={styles.chip}
            >
              <Text style={styles.chipText}>Priority</Text>
              <Ionicons name="chevron-down" size={14} color={colors.muted} />
            </Pressable>
          )}
        </ScrollView>
      </View>

      {/* Results Header (Count & Save as filter) */}
      <View style={styles.resultsBar}>
        <Text style={styles.resultsCount}>
          {filteredTasks.length} {filteredTasks.length === 1 ? "result" : "results"} found
        </Text>
        {isFilterActive && (
          <Pressable
            testID="save-filter-btn"
            onPress={handleSaveFilter}
            style={styles.saveFilterBtn}
            hitSlop={6}
          >
            <Text style={styles.saveFilterText}>Save as filter</Text>
          </Pressable>
        )}
      </View>

      {/* Main Results / Empty Area */}
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {tasks.length === 0 ? (
          <EmptyState styles={styles} colors={colors} />
        ) : filteredTasks.length === 0 ? (
          <NoResults query={query} styles={styles} colors={colors} />
        ) : (
          <View style={styles.resultsCard}>
            {filteredTasks.map((task, index) => (
              <TaskSearchResultRow
                key={task.id}
                task={task}
                isLast={index === filteredTasks.length - 1}
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
        onToggle={(t, r) => handleToggle(t, r)}
        onEdit={(t) => setEditModalTask(t)}
        onPostpone={(t) => setPostponeModalTask(t)}
        onDelete={(id) => {
          void deleteTask(id);
          setSelectedTask(null);
        }}
      />

      {/* Task Edit Modal */}
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
    </View>
  );
}

function TaskSearchResultRow({
  task,
  query,
  list,
  isLast,
  onPress,
  onToggle,
  styles,
  colors,
}: {
  task: Task;
  query: string;
  list?: TaskList;
  isLast?: boolean;
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

  const assigneeName = task.assignee
    ? `${task.assignee.firstName ?? ""} ${task.assignee.lastName ?? ""}`.trim()
    : task.assigneeName;
  const assigneeParts = assigneeName ? highlight(assigneeName, query) : [];

  const creatorName = task.createdBy
    ? (`${task.createdBy.firstName ?? ""} ${task.createdBy.lastName ?? ""}`.trim() || (task.createdBy.name ?? ""))
    : (task.createdByName ?? "");
  const creatorParts = creatorName ? highlight(creatorName, query) : [];
  const creatorMatched = query && creatorParts.some((p) => p.match) && creatorName !== assigneeName;

  const listName = list ? `${list.emoji ? `${list.emoji} ` : ""}${list.name || "Inbox"}` : "";
  const listParts = listName ? highlight(listName, query) : [];

  // Due date text color: red if overdue, orange if today, muted otherwise
  const dateColor = (() => {
    if (task.completed || !task.due_date) return null;
    const parsed = parseTaskDate(task.due_date);
    if (!parsed) return null;
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = startOfDay(addDays(now, 1));
    if (parsed.getTime() < todayStart.getTime()) return "#EF4444";
    if (parsed.getTime() < tomorrowStart.getTime()) return "#EA580C";
    return null;
  })();

  return (
    <Pressable
      testID={`search-result-${task.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.taskRow,
        pressed && styles.rowPressed,
      ]}
    >
      {hasPriorityStripe ? (
        <View style={[styles.priorityStripe, { backgroundColor: priorityStripeColor }]} />
      ) : null}

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
          <Ionicons name="checkmark" size={11} color="#FFFFFF" />
        ) : null}
      </Pressable>

      {/* Main Content */}
      <View style={styles.taskContent}>
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

        {/* Notes (if query matched or notes exist) */}
        {task.notes && task.notes.trim().length > 0 ? (
          <Text
            style={[styles.taskNotes, task.completed && styles.taskNotesCompleted]}
            numberOfLines={1}
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

        {/* Sub-row: Assignee, List, and/or Creator */}
        {(assigneeName || list || creatorMatched) ? (
          <View style={styles.metaRow}>
            {assigneeName ? (
              <View style={styles.metaItem}>
                <Ionicons name="person-outline" size={11} color={colors.muted} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {assigneeParts.map((part, index) =>
                    part.match ? (
                      <Text key={index} style={styles.highlightText}>
                        {part.text}
                      </Text>
                    ) : (
                      <Text key={index}>{part.text}</Text>
                    )
                  )}
                </Text>
              </View>
            ) : null}

            {assigneeName && list ? (
              <Text style={styles.metaDot}>·</Text>
            ) : null}

            {list ? (
              <View style={styles.metaItem}>
                <Ionicons name="folder-outline" size={11} color="#EAB308" />
                <Text style={styles.metaText} numberOfLines={1}>
                  {listParts.map((part, index) =>
                    part.match ? (
                      <Text key={index} style={styles.highlightText}>
                        {part.text}
                      </Text>
                    ) : (
                      <Text key={index}>{part.text}</Text>
                    )
                  )}
                </Text>
              </View>
            ) : null}

            {creatorMatched ? (
              <>
                {(assigneeName || list) ? <Text style={styles.metaDot}>·</Text> : null}
                <View style={styles.metaItem}>
                  <Ionicons name="create-outline" size={11} color={colors.muted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    By{" "}
                    {creatorParts.map((part, index) =>
                      part.match ? (
                        <Text key={index} style={styles.highlightText}>
                          {part.text}
                        </Text>
                      ) : (
                        <Text key={index}>{part.text}</Text>
                      )
                    )}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Right Side: Date & Time + Alarm Icon */}
      {!task.completed && dueDisplay ? (
        <View style={styles.taskRightMeta}>
          <Text
            style={[
              styles.taskDateText,
              { color: dateColor || colors.brandPrimary },
            ]}
            numberOfLines={1}
          >
            {dueDisplay}
          </Text>
          <Ionicons name="alarm-outline" size={13} color="#9CA3AF" style={styles.alarmIcon} />
        </View>
      ) : null}
    </Pressable>
  );
}

function highlight(text: string, query: string): { text: string; match: boolean }[] {
  if (!query || !text) return [{ text: text || "", match: false }];
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [{ text, match: false }];

  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (!escaped) return [{ text, match: false }];

  try {
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);
    return parts
      .filter((p) => p.length > 0)
      .map((part) => ({
        text: part,
        match: words.some((w) => w.toLowerCase() === part.toLowerCase()),
      }));
  } catch {
    return [{ text, match: false }];
  }
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
    gap: 10,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  priorityStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSecondary,
  },
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
  checkboxCompleted: {
    backgroundColor: "#CBD5E1",
    borderColor: "#CBD5E1",
  },
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
  taskTitleCompleted: {
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
  taskDateText: {
    fontSize: 13,
    fontWeight: "500",
  },
  alarmIcon: {
    marginTop: 1,
  },
  taskNotes: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 1,
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
