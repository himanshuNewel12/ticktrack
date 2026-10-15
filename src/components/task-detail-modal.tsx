import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useState } from "react";
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
  onPostpone?: (task: Task) => void;
  onEdit?: (task: Task) => void;
  lists: TaskList[];
};

export function TaskDetailModal({
  task,
  visible,
  onClose,
  onToggle,
  onDelete,
  onPostpone,
  onEdit,
  lists,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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

  const assigneeName =
    task.assignees && task.assignees.length > 0
      ? task.assignees.map((a) => a.name).join(", ")
      : task.assignee
      ? `${task.assignee.firstName ?? ""} ${task.assignee.lastName ?? ""}`.trim() || task.assignee.email
      : task.assigneeName ?? "Unassigned";

  const creatorName =
    task.createdByName ||
    (task.createdBy
      ? (task.createdBy.name || `${task.createdBy.firstName ?? ""} ${task.createdBy.lastName ?? ""}`).trim() || task.createdBy.email
      : null) ||
    "Creator";

  const formatDateTime = (isoStr?: string | null) => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return format(d, "MMM d, yyyy · h:mm a");
    } catch {
      return isoStr;
    }
  };

  const formatDateOnly = (isoStr?: string | null) => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return format(d, "MMM d, yyyy");
    } catch {
      return isoStr;
    }
  };

  const historyItems = (() => {
    const rawActions = task.actions ?? [];
    if (rawActions.length === 0) {
      const createdTime = task.createdAt || task.created_at;
      if (createdTime || task.createdBy || task.createdByName) {
        return [
          {
            id: "initial-creation",
            title: "Task Created & Assigned",
            actorText: `Created by ${creatorName}`,
            timeStr: formatDateTime(createdTime),
            color: colors.brandPrimary,
            icon: "add-circle",
            detailText: task.assigneeName ? `Assigned to ${task.assigneeName}` : null,
            remarks: null,
          },
        ];
      }
      return [];
    }

    return rawActions.map((action, i) => {
      const type = (action.type || "").toUpperCase();
      const actorName =
        action.actorName ||
        (action.actor
          ? `${action.actor.firstName ?? ""} ${action.actor.lastName ?? ""}`.trim() || action.actor.email
          : null) ||
        "Team member";

      let title = "Task Updated";
      let color = colors.info;
      let icon = "information-circle";
      let detailText: string | null = null;

      if (type === "CREATED" || type === "CREATE") {
        title = "Task Created & Assigned";
        color = colors.brandPrimary;
        icon = "add-circle";
        detailText = task.assigneeName ? `Assigned to ${task.assigneeName}` : null;
      } else if (type === "POSTPONED") {
        title = "Postponed / Rescheduled";
        color = colors.warning;
        icon = "time";
        if (action.fromStartAt && action.toStartAt) {
          detailText = `${formatDateOnly(action.fromStartAt)} → ${formatDateOnly(action.toStartAt)}`;
        }
      } else if (type === "COMPLETED") {
        title = "Marked as Completed";
        color = colors.brandPrimary;
        icon = "checkmark-circle";
      } else if (type === "CANCELLED" || type === "SERIES_CANCELLED") {
        title = "Cancelled";
        color = colors.error;
        icon = "close-circle";
      } else if (type === "REMARK_ADDED") {
        const rem = action.remarks || "";
        title = rem.includes("details")
          ? "Task Details Updated"
          : rem.includes("Reopened") || rem.includes("pending")
          ? "Task Reopened"
          : "Remark Added";
        color = colors.info;
        icon = rem.includes("details")
          ? "create-outline"
          : rem.includes("Reopened")
          ? "refresh-circle"
          : "chatbubble-ellipses";
      } else if (type === "UPDATE") {
        title = "Details Updated";
        color = colors.info;
        icon = "create-outline";
        if (action.before && action.after) {
          const changedKeys = Object.keys(action.after).filter(
            (k) => action.before[k] !== action.after[k]
          );
          if (changedKeys.length > 0) {
            detailText = `Updated ${changedKeys.join(", ")}`;
          }
        }
      }

      return {
        id: action.id || `act-${i}`,
        title,
        actorText: `By ${actorName}`,
        timeStr: formatDateTime(action.createdAt),
        color,
        icon,
        detailText,
        remarks: action.remarks || null,
      };
    });
  })();

  return (
    <>
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
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setShowHistoryModal(true)}
                style={styles.iconButton}
                testID="history-detail-btn"
                accessibilityLabel="View Activity History"
              >
                <Ionicons name="time-outline" size={20} color={colors.brandPrimary} />
              </Pressable>
              {onEdit && !task.completed ? (
                <Pressable
                  onPress={() => onEdit(task)}
                  style={styles.iconButton}
                  testID="edit-detail-btn"
                  accessibilityLabel="Edit Task"
                >
                  <Ionicons name="create-outline" size={20} color={colors.info} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  onDelete(task.id);
                  onClose();
                }}
                style={styles.iconButton}
                testID="delete-detail"
                accessibilityLabel="Delete Task"
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </Pressable>
            </View>
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
                  size={12}
                  color={task.completed ? colors.onBrandPrimary : "transparent"}
                />
              </Pressable>
              <Text style={[styles.titleText, task.completed && styles.titleDone]}>
                {task.title}
              </Text>
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
                <Ionicons
                  name={task.assignees && task.assignees.length > 1 ? "people-outline" : "person-outline"}
                  size={18}
                  color={colors.info}
                />
                <Text style={styles.infoLabel}>Assigned To</Text>
                <Text style={styles.infoValue}>{assigneeName}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Ionicons name="person-add-outline" size={18} color={colors.brandPrimary} />
                <Text style={styles.infoLabel}>Assigned By</Text>
                <Text style={styles.infoValue}>{creatorName}</Text>
              </View>

              {task.createdAt || task.created_at ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={18} color={colors.muted} />
                    <Text style={styles.infoLabel}>Created On</Text>
                    <Text style={styles.infoValue}>
                      {formatDateTime(task.createdAt || task.created_at)}
                    </Text>
                  </View>
                </>
              ) : null}

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

              <View style={styles.divider} />

              {/* Compact History Row */}
              <Pressable
                onPress={() => setShowHistoryModal(true)}
                style={({ pressed }) => [styles.historyRowButton, pressed && { opacity: 0.7 }]}
                testID="open-history-row"
              >
                <View style={styles.historyRowLeft}>
                  <Ionicons name="time-outline" size={18} color={colors.brandPrimary} />
                  <Text style={styles.infoLabel}>History</Text>
                </View>
                <View style={styles.historyRowRight}>
                  {(task.postponeCount ?? 0) > 0 ? (
                    <View style={styles.postponeBadge}>
                      <Text style={styles.postponeBadgeText}>
                        Postponed {task.postponeCount}x
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.historyCountText}>
                    {historyItems.length} {historyItems.length === 1 ? "entry" : "entries"}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </View>
              </Pressable>
            </View>

            {/* Postpone Button */}
            {!task.completed && onPostpone ? (
              <Pressable
                onPress={() => {
                  onPostpone(task);
                  onClose();
                }}
                style={({ pressed }) => [styles.postponeButton, pressed && { opacity: 0.8 }]}
                testID="postpone-detail-btn"
              >
                <Ionicons name="time-outline" size={18} color={colors.onSurface} />
                <Text style={styles.postponeButtonText}>Postpone Activity</Text>
              </Pressable>
            ) : null}

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

    {/* Dedicated Activity History Modal */}
    <Modal
      visible={showHistoryModal}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => setShowHistoryModal(false)}
    >
      <Pressable onPress={() => setShowHistoryModal(false)} style={styles.backdrop}>
        <Pressable
          onPress={() => { /* trap */ }}
          style={[styles.historySheet, { paddingBottom: insets.bottom + 16 }]}
          testID="activity-history-modal"
        >
          {/* History Modal Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => setShowHistoryModal(false)}
              style={styles.iconButton}
              testID="close-history"
            >
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </Pressable>
            <View style={styles.historyHeaderTitleCol}>
              <Text style={styles.headerTitle}>Activity History</Text>
              <Text style={styles.historySubtitle} numberOfLines={1}>
                {task.title}
              </Text>
            </View>
            {(task.postponeCount ?? 0) > 0 ? (
              <View style={styles.postponeBadge}>
                <Text style={styles.postponeBadgeText}>
                  {task.postponeCount}x
                </Text>
              </View>
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>

          {/* Scrollable Timeline (bounded height) */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.historyScrollBody}
          >
            {historyItems.length > 0 ? (
              <View style={styles.timelineList}>
                {historyItems.map((item, index) => {
                  const isLast = index === historyItems.length - 1;
                  return (
                    <View key={item.id} style={styles.timelineRow}>
                      <View style={styles.timelineTrack}>
                        <View style={[styles.timelineDot, { backgroundColor: item.color }]}>
                          <Ionicons name={item.icon as any} size={10} color="#FFFFFF" />
                        </View>
                        {!isLast && <View style={styles.timelineLine} />}
                      </View>

                      <View style={styles.timelineContent}>
                        <View style={styles.timelineContentHeader}>
                          <Text style={styles.timelineActionTitle}>{item.title}</Text>
                          {item.timeStr ? <Text style={styles.timelineTime}>{item.timeStr}</Text> : null}
                        </View>
                        <Text style={styles.timelineActor}>{item.actorText}</Text>
                        {item.detailText ? (
                          <Text style={styles.timelineDetail}>{item.detailText}</Text>
                        ) : null}
                        {item.remarks ? (
                          <View style={styles.remarksBox}>
                            <Text style={styles.remarksText}>“{item.remarks}”</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyHistory}>
                <Text style={styles.emptyHistoryText}>
                  Created by {creatorName}
                  {task.createdAt || task.created_at
                    ? ` on ${formatDateOnly(task.createdAt || task.created_at)}`
                    : ""}
                  . No modifications recorded.
                </Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
    </>
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    width: 19,
    height: 19,
    borderRadius: 6,
    borderWidth: 1.6,
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
  postponeButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  postponeButtonText: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "600",
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  historyHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  postponeBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  postponeBadgeText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "700",
  },
  timelineList: {
    gap: 0,
    marginTop: 4,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 52,
  },
  timelineTrack: {
    width: 22,
    alignItems: "center",
    alignSelf: "stretch",
    marginRight: 10,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    zIndex: 2,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.divider,
    marginVertical: 2,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 14,
    gap: 3,
  },
  timelineContentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timelineActionTitle: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "700",
  },
  timelineTime: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "500",
  },
  timelineActor: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  timelineDetail: {
    color: colors.brandPrimary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 1,
  },
  remarksBox: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.brandPrimary,
    marginTop: 4,
  },
  remarksText: {
    color: colors.onSurface,
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 16,
  },
  emptyHistory: {
    paddingVertical: 8,
  },
  emptyHistoryText: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
  },
  historyRowButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  historyRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  historyRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyCountText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  historySheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: "75%",
  },
  historyHeaderTitleCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  historySubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
    textAlign: "center",
  },
  historyScrollBody: {
    paddingVertical: 14,
    paddingBottom: 28,
  },
}));
