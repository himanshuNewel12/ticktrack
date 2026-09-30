import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";
import type { Task, TaskList } from "@/src/types";
import { parseTaskDate } from "@/src/utils/date-utils";

type Props = {
  task: Task | null;
  visible: boolean;
  onClose: () => void;
  onToggle: (task: Task) => void;
  onDelete: (taskId: string) => void;
  lists: TaskList[];
};

export function TaskDetailModal({
  task,
  visible,
  onClose,
  onToggle,
  onDelete,
  lists,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (!task) return null;

  const activeList = lists.find((l) => l.id === task.list_id || l.id === task.projectId);
  const priorityUpper = (task.priority ?? "medium").toUpperCase();
  const priorityColor =
    priorityUpper === "HIGH" || priorityUpper === "CRITICAL"
      ? colors.error
      : priorityUpper === "LOW"
      ? colors.info
      : priorityUpper === "MEDIUM"
      ? colors.warning
      : colors.muted;

  const formatDue = () => {
    if (!task.due_date) return "No due date";
    try {
      const parsed = parseTaskDate(task.due_date);
      if (!parsed) return task.due_date;
      const dateStr = format(parsed, "EEEE, MMM d, yyyy");
      if (task.due_date.includes("T")) {
        const timePart = task.due_date.split("T")[1]?.slice(0, 5);
        if (timePart) {
          const [h, m] = timePart.split(":");
          const hourNum = parseInt(h, 10);
          const ampm = hourNum >= 12 ? "PM" : "AM";
          const displayH = hourNum % 12 === 0 ? 12 : hourNum % 12;
          return `${dateStr} at ${displayH}:${m} ${ampm}`;
        }
      }
      return dateStr;
    } catch {
      return task.due_date;
    }
  };

  const assigneeName = task.assignee
    ? `${task.assignee.firstName ?? ""} ${task.assignee.lastName ?? ""}`.trim() || task.assignee.email
    : task.assigneeName ?? "Unassigned";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable
          onPress={() => { /* trap */ }}
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          testID="task-detail-modal"
        >
          {/* Header Action Bar */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.iconButton} testID="close-detail">
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.headerTitle}>Task Details</Text>
            <Pressable
              onPress={() => {
                onDelete(task.id);
                onClose();
              }}
              style={styles.iconButton}
              testID="delete-detail"
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {/* Checkbox + Title Row */}
            <View style={styles.titleSection}>
              <Pressable
                onPress={() => onToggle(task)}
                style={[styles.checkbox, task.completed && styles.checkboxDone]}
                testID="toggle-detail-checkbox"
              >
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={task.completed ? colors.onBrandPrimary : "transparent"}
                />
              </Pressable>
              <Text style={[styles.titleText, task.completed && styles.titleDone]}>
                {task.title}
              </Text>
            </View>

            {/* Status Badge */}
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: task.completed ? colors.brandTertiary : colors.surfaceSecondary },
                ]}
              >
                <Ionicons
                  name={task.completed ? "checkmark-circle" : "time-outline"}
                  size={13}
                  color={task.completed ? colors.brandPrimary : colors.muted}
                />
                <Text
                  style={[
                    styles.statusText,
                    { color: task.completed ? colors.brandPrimary : colors.onSurfaceSecondary },
                  ]}
                >
                  {task.completed ? "Completed" : "Active"}
                </Text>
              </View>

              <View style={[styles.statusPill, { backgroundColor: `${priorityColor}15` }]}>
                <Ionicons name="flag" size={13} color={priorityColor} />
                <Text style={[styles.statusText, { color: priorityColor, fontWeight: "600" }]}>
                  {priorityUpper}
                </Text>
              </View>
            </View>

            {/* Description / Notes */}
            {task.notes ? (
              <View style={styles.cardSection}>
                <Text style={styles.cardLabel}>Description</Text>
                <Text style={styles.cardValue}>{task.notes}</Text>
              </View>
            ) : null}

            {/* Info Grid Card */}
            <View style={styles.cardSection}>
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.brandPrimary} />
                <Text style={styles.infoLabel}>Due Date</Text>
                <Text style={styles.infoValue}>{formatDue()}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Ionicons name="folder-outline" size={18} color={colors.warning} />
                <Text style={styles.infoLabel}>List</Text>
                <Text style={styles.infoValue}>
                  {activeList ? `${activeList.emoji} ${activeList.name}` : "Inbox"}
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={18} color={colors.info} />
                <Text style={styles.infoLabel}>Assigned To</Text>
                <Text style={styles.infoValue}>{assigneeName}</Text>
              </View>

              {task.recurrence && task.recurrence !== "none" ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <Ionicons name="repeat-outline" size={18} color={colors.brandPrimary} />
                    <Text style={styles.infoLabel}>Repeat</Text>
                    <Text style={styles.infoValue}>{task.recurrence}</Text>
                  </View>
                </>
              ) : null}
            </View>

            {/* Action Toggle Button */}
            <Pressable
              onPress={() => onToggle(task)}
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.8 }]}
              testID="toggle-detail-btn"
            >
              <Ionicons
                name={task.completed ? "arrow-undo-outline" : "checkmark-done-outline"}
                size={18}
                color={colors.onBrandPrimary}
              />
              <Text style={styles.actionButtonText}>
                {task.completed ? "Mark as Incomplete" : "Mark as Completed"}
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20,22,30,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: "700",
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
  },
  body: {
    paddingVertical: 16,
    gap: 16,
  },
  titleSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxDone: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  titleText: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },
  titleDone: {
    textDecorationLine: "line-through",
    color: colors.muted,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardSection: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  cardLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardValue: {
    color: colors.onSurface,
    fontSize: 14,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
    width: 90,
  },
  infoValue: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
  },
  actionButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  actionButtonText: {
    color: colors.onBrandPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
}));
