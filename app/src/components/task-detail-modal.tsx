import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useMemo, useState, useEffect, useRef } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/app-context";
import { makeStyles, useTheme } from "@/src/theme";
import type { LocalAttachment, Task, TaskAttachment, TaskList, VoiceNote } from "@/src/types";
import { parseTaskDate } from "@/src/utils/date-utils";
import { enforceLetterLimit, MAX_LETTERS } from "@/src/utils/word-limit";
import { extractSubtasksAndNotes } from "@/src/utils/subtask-utils";
import { PostponeActivityModal } from "@/src/components/postpone-activity-modal";
import { VoiceNotePlayer, VoiceRecordButton } from "@/src/components/voice-note";
import { AttachFileButton, AttachmentList, PendingAttachments } from "@/src/components/attachments";

/** Activity History modal renders this many entries at a time; scrolling to the end loads the next page. */
const HISTORY_PAGE_SIZE = 10;

type Props = {
  task: Task | null;
  visible: boolean;
  onClose: () => void;
  onToggle: (task: Task, remarks?: string) => void;
  onDelete: (taskId: string) => void;
  onPostpone?: (task: Task) => void;
  onEdit?: (task: Task) => void;
  lists: TaskList[];
};

export function TaskDetailModal({
  task: propTask,
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
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Some Android devices resize the modal window for the keyboard and others don't.
  // Measure the backdrop so the keyboard height is only subtracted when it hasn't been
  // already (subtracting it twice left a gap above the keyboard and pushed the sheet up).
  const [backdropHeight, setBackdropHeight] = useState(0);
  const windowNotResized =
    backdropHeight === 0 || backdropHeight > windowHeight - keyboardHeight * 0.5;
  const keyboardPad = keyboardHeight > 0 && windowNotResized ? keyboardHeight : 0;
  const availableHeight = Math.max(
    220,
    Math.round(
      (backdropHeight > 0 ? backdropHeight : windowHeight) -
        insets.top -
        keyboardPad -
        (Platform.OS === "ios" ? 16 : 28)
    )
  );
  // Leave a strip of the screen behind the sheet visible; long content scrolls inside it.
  const maxSheetHeight = keyboardPad > 0 ? availableHeight : Math.round(availableHeight * 0.88);
  // The scroll area gets an explicit cap (sheet minus header, footer and padding) so it always
  // scrolls inside the sheet instead of relying on flex-shrink.
  const [headerH, setHeaderH] = useState(0);
  const [footerH, setFooterH] = useState(0);
  const scrollMaxHeight = Math.max(
    120,
    maxSheetHeight - 16 - Math.max(insets.bottom, 12) - headerH - footerH
  );
  const { user, tasks, addRemark, loadTaskDetail } = useApp();
  const scrollViewRef = useRef<ScrollView>(null);
  const remarkYRef = useRef<number | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [internalPostponeModal, setInternalPostponeModal] = useState(false);
  const [remarkText, setRemarkText] = useState("");
  const [remarkVoice, setRemarkVoice] = useState<VoiceNote | null>(null);
  const [remarkFiles, setRemarkFiles] = useState<LocalAttachment[]>([]);
  const [submittingRemark, setSubmittingRemark] = useState(false);
  const [remarkError, setRemarkError] = useState<string | null>(null);
  const [remarkSuccess, setRemarkSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setRemarkText("");
      setRemarkVoice(null);
      setRemarkFiles([]);
      setRemarkError(null);
      setRemarkSuccess(null);
      setInternalPostponeModal(false);
    }
  }, [visible, propTask?.id]);

  // Every time the history modal opens (or the task changes) start again from the first page.
  useEffect(() => {
    if (showHistoryModal) setHistoryVisibleCount(HISTORY_PAGE_SIZE);
  }, [showHistoryModal, propTask?.id]);

  useEffect(() => {
    if (visible && propTask) void loadTaskDetail(propTask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, propTask?.id]);

  const task = useMemo(() => {
    if (!propTask) return null;
    return tasks.find((t) => t.id === propTask.id) ?? propTask;
  }, [tasks, propTask]);

  const { cleanNotes } = useMemo(() => {
    return extractSubtasksAndNotes(task?.notes);
  }, [task?.notes]);

  const handleAddRemark = async () => {
    const trimmed = remarkText.trim();
    if ((!trimmed && !remarkVoice && remarkFiles.length === 0) || submittingRemark || !task) return;
    if (trimmed.length > MAX_LETTERS) {
      setRemarkError(`Remark cannot exceed ${MAX_LETTERS} letters (currently ${trimmed.length} letters).`);
      return;
    }
    setRemarkError(null);
    setRemarkSuccess(null);
    setSubmittingRemark(true);
    try {
      await addRemark(task, trimmed, remarkVoice ?? undefined, remarkFiles);
      setRemarkText("");
      setRemarkVoice(null);
      setRemarkFiles([]);
      setRemarkSuccess("Remark added successfully");
      setTimeout(() => setRemarkSuccess(null), 3000);
    } catch (err: any) {
      const msg = err?.message || "Failed to add remark";
      setRemarkError(msg);
    } finally {
      setSubmittingRemark(false);
    }
  };

  if (!task) return null;

  const isCreator = Boolean(
    user?.id && (
      task.createdById === user.id ||
      task.createdBy?.id === user.id ||
      user.role === "ADMIN"
    )
  );

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

  const formatDueDateOnly = () => {
    if (!task.due_date) return "No due date";
    try {
      const parsed = parseTaskDate(task.due_date);
      if (!parsed) return task.due_date.slice(0, 10);
      return format(parsed, "MMM d, yyyy");
    } catch {
      return task.due_date.slice(0, 10);
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

  const totalAssigneeCount =
    (task.assignees && task.assignees.length) ||
    (Array.isArray(task.assigneeIds) && task.assigneeIds.length) ||
    (task.assigneeName ? task.assigneeName.split(",").map((s) => s.trim()).filter(Boolean).length : 0) ||
    (task.assigneeId ? 1 : 0);

  const hasMultipleAssignees = totalAssigneeCount > 1;

  const isSelfAssigned = !hasMultipleAssignees && Boolean(
    (task.assignees && task.assignees.length === 1 && (
      (task.createdById && task.assignees[0].id === task.createdById) ||
      (task.createdBy?.id && task.assignees[0].id === task.createdBy.id) ||
      (creatorName && task.assignees[0].name.trim().toLowerCase() === creatorName.trim().toLowerCase())
    )) ||
    (Array.isArray(task.assigneeIds) && task.assigneeIds.length === 1 && (
      task.assigneeIds[0] === task.createdById || task.assigneeIds[0] === task.createdBy?.id
    )) ||
    (!task.assignees && (
      (task.createdById && (task.assigneeId === task.createdById || task.assignee_id === task.createdById || task.assignee?.id === task.createdById)) ||
      (task.createdBy?.id && (task.assigneeId === task.createdBy.id || task.assignee_id === task.createdBy.id || task.assignee?.id === task.createdBy.id))
    )) ||
    (assigneeName && creatorName && assigneeName.trim().toLowerCase() === creatorName.trim().toLowerCase() && assigneeName !== "Unassigned" && creatorName !== "Creator")
  );

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

  const toShortInitials = (name?: string | null): string => {
    if (!name) return "";
    const clean = name.trim();
    if (!clean) return "";
    // If it's an email address, extract initials from the prefix before @
    const target = clean.includes("@") ? clean.split("@")[0].replace(/[._-]/g, " ") : clean;
    const parts = target.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getAssigneeInitials = (): string => {
    if (task.assignees && task.assignees.length > 0) {
      return task.assignees.map((a) => toShortInitials(a.name)).filter(Boolean).join(", ");
    }
    if (task.assignee) {
      const name = `${task.assignee.firstName ?? ""} ${task.assignee.lastName ?? ""}`.trim() || task.assignee.email;
      return toShortInitials(name);
    }
    if (task.assigneeName) {
      return task.assigneeName.split(",").map((n) => toShortInitials(n.trim())).filter(Boolean).join(", ");
    }
    return "";
  };

  const historyItems = (() => {
    const rawActions = task.actions ?? [];
    const assigneeInitials = getAssigneeInitials();
    const creatorInitials = toShortInitials(creatorName) || creatorName;

    const isAssigneeSelf = (actorInitials: string, actorId?: string | null, actorFullName?: string | null) => {
      if (hasMultipleAssignees) return false;
      if (isSelfAssigned) return true;
      if (actorId) {
        if (task.assignees && task.assignees.length === 1 && task.assignees[0].id === actorId) return true;
        if (Array.isArray(task.assigneeIds) && task.assigneeIds.length === 1 && task.assigneeIds[0] === actorId) return true;
        if (!task.assignees && (task.assigneeId === actorId || task.assignee_id === actorId || task.assignee?.id === actorId)) return true;
      }
      if (actorFullName && assigneeName && assigneeName.trim().toLowerCase() === actorFullName.trim().toLowerCase() && assigneeName !== "Unassigned") {
        return true;
      }
      if (assigneeInitials && actorInitials && assigneeInitials.trim().toLowerCase() === actorInitials.trim().toLowerCase()) {
        return true;
      }
      return false;
    };

    if (rawActions.length === 0) {
      const createdTime = task.createdAt || task.created_at;
      if (createdTime || task.createdBy || task.createdByName) {
        const isSelf = isAssigneeSelf(creatorInitials, task.createdById || task.createdBy?.id, creatorName);
        const titleText = isSelf
          ? "Self assigned"
          : assigneeInitials
          ? `Assigned to ${assigneeInitials} by ${creatorInitials}`
          : `Created by ${creatorInitials}`;

        return [
          {
            id: "initial-creation",
            title: titleText,
            actorText: null,
            timeStr: formatDateTime(createdTime),
            color: colors.brandPrimary,
            icon: "add-circle",
            detailText: null,
            remarks: null,
            audio: null as VoiceNote | null,
            attachments: [] as TaskAttachment[],
          },
        ];
      }
      return [];
    }

    const sortedActions = [...rawActions].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return sortedActions.map((action, i) => {
      const type = (action.type || "").toUpperCase();
      const actorName =
        action.actorName ||
        (action.actor
          ? `${action.actor.firstName ?? ""} ${action.actor.lastName ?? ""}`.trim() || action.actor.email
          : null) ||
        "Team member";

      const shortActor = toShortInitials(actorName) || actorName;

      let title = `Task Updated by ${shortActor}`;
      let color = colors.info;
      let icon = "information-circle";
      let detailText: string | null = null;

      if (type === "CREATED" || type === "CREATE") {
        const isSelf = isAssigneeSelf(shortActor, action.actorId || action.actor?.id, actorName);
        title = isSelf
          ? "Self assigned"
          : assigneeInitials
          ? `Assigned to ${assigneeInitials} by ${shortActor}`
          : `Created by ${shortActor}`;
        color = colors.brandPrimary;
        icon = "add-circle";
      } else if (type === "POSTPONED") {
        title = `Postponed by ${shortActor}`;
        color = colors.warning;
        icon = "time";
        if (action.fromStartAt && action.toStartAt) {
          detailText = `${formatDateOnly(action.fromStartAt)} → ${formatDateOnly(action.toStartAt)}`;
        }
      } else if (type === "COMPLETED") {
        title = `Completed by ${shortActor}`;
        color = colors.brandPrimary;
        icon = "checkmark-circle";
      } else if (type === "CANCELLED" || type === "SERIES_CANCELLED") {
        title = `Cancelled by ${shortActor}`;
        color = colors.error;
        icon = "close-circle";
      } else if (type === "ESCALATED") {
        title = `Escalated by ${shortActor}`;
        color = colors.error;
        icon = "arrow-up-circle";
      } else if (type === "REMARK_ADDED") {
        const rem = action.remarks || "";
        title = rem.includes("details")
          ? `Details Updated by ${shortActor}`
          : rem.includes("Reopened") || rem.includes("pending")
            ? `Task Reopened by ${shortActor}`
            : `Remark Added by ${shortActor}`;
        color = colors.info;
        icon = rem.includes("details")
          ? "create-outline"
          : rem.includes("Reopened")
            ? "refresh-circle"
            : "chatbubble-ellipses";
      } else if (type === "UPDATE") {
        title = `Details Updated by ${shortActor}`;
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
        actorText: null,
        timeStr: formatDateTime(action.createdAt),
        color,
        icon,
        detailText,
        remarks: action.remarks || null,
        audio: (action.audio ?? null) as VoiceNote | null,
        attachments: action.attachments ?? [],
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
        <View style={styles.backdrop} onLayout={(e) => setBackdropHeight(e.nativeEvent.layout.height)}>
          {/* Tap outside the sheet closes it; a sibling (not a parent) so it never competes with scrolling. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
            style={styles.avoider}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.sheet,
                {
                  marginTop: insets.top + (Platform.OS === "ios" ? 10 : 20),
                  maxHeight: maxSheetHeight,
                  marginBottom: Platform.OS === "android" ? keyboardPad : 0,
                  paddingBottom: Math.max(insets.bottom, 12),
                },
              ]}
              testID="task-detail-modal"
            >
              {/* Header Action Bar */}
              <View style={styles.header} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
                <Pressable onPress={onClose} style={styles.iconButton} testID="close-detail">
                  <Ionicons name="close" size={22} color={colors.onSurface} />
                </Pressable>
                <View style={styles.headerTitleContainer} pointerEvents="none">
                  <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
                    {task.title}
                  </Text>
                </View>
                <View style={styles.headerActions}>
                  {isCreator && onEdit && !task.completed ? (
                    <Pressable
                      onPress={() => onEdit(task)}
                      style={styles.iconButton}
                      testID="edit-detail-btn"
                      accessibilityLabel="Edit Task"
                    >
                      <Ionicons name="create-outline" size={20} color={colors.info} />
                    </Pressable>
                  ) : null}
                  {isCreator ? (
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
                  ) : null}
                </View>
              </View>

              <ScrollView
                ref={scrollViewRef}
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="on-drag"
                style={{ flexShrink: 1, flexGrow: 0, maxHeight: scrollMaxHeight }}
                nestedScrollEnabled
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
              >

              {/* Task Meta (Single compact row: Due Date · Assignee) - Just above description */}
              <View style={styles.metaCard}>
                <Pressable
                  onPress={() => {
                    if (!task.completed) {
                      if (onPostpone) {
                        onPostpone(task);
                        onClose();
                      } else {
                        setInternalPostponeModal(true);
                      }
                    }
                  }}
                  disabled={task.completed}
                  style={({ pressed }) => [
                    styles.metaItem,
                    styles.metaDatePressable,
                    pressed && !task.completed && { opacity: 0.7 },
                  ]}
                  hitSlop={8}
                  testID="task-detail-date-btn"
                  accessibilityLabel="Postpone Due Date"
                >
                  <Ionicons name="calendar-outline" size={14} color={colors.brandPrimary} />
                  <Text style={styles.metaDateText}>{formatDueDateOnly()}</Text>
                  {!task.completed ? (
                    <Ionicons name="chevron-down" size={11} color={colors.muted} style={{ marginLeft: 1 }} />
                  ) : null}
                </Pressable>

                <Text style={styles.metaDot}>·</Text>

                <View style={[styles.metaItem, { flex: 1 }]}>
                  <Ionicons
                    name={task.assignees && task.assignees.length > 1 ? "people-outline" : "person-outline"}
                    size={14}
                    color={colors.info}
                  />
                  <Text style={styles.metaAssignText} numberOfLines={1}>
                    {isSelfAssigned && !task.assignedByName ? (
                      <Text style={styles.metaHighlight}>Self Assigned</Text>
                    ) : (
                      <>
                        <Text style={styles.metaHighlight}>{getAssigneeInitials() || assigneeName}</Text>
                        <Text style={styles.metaSubtle}>
                          {" "}(by {toShortInitials(task.assignedByName || creatorName) || task.assignedByName || creatorName})
                        </Text>
                      </>
                    )}
                  </Text>
                </View>
              </View>

              {/* Recurrence Rule Banner */}
              {(task.recurrence && task.recurrence !== "none") || task.source === "recurring_series" || task.recurrenceRule ? (
                <View style={[styles.metaCard, { paddingVertical: 8, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", gap: 6 }]}>
                  <Ionicons name="repeat-outline" size={15} color={colors.brandPrimary} />
                  <Text style={[styles.metaDateText, { color: colors.brandPrimary, fontWeight: "600", flex: 1 }]}>
                    {task.recurrenceRule ||
                      (task.recurrence && !["repeat", "none"].includes(task.recurrence)
                        ? `Repeats ${task.recurrence}`
                        : "Repeating activity")}
                  </Text>
                </View>
              ) : null}

              {/* Description / Notes (without checklist markdown) */}
              {cleanNotes || task.descriptionAudio ? (
                <View style={styles.cardSection}>
                  <Text style={styles.cardLabel}>Description</Text>
                  {cleanNotes ? <Text style={styles.cardValue}>{cleanNotes}</Text> : null}
                  {task.descriptionAudio ? <VoiceNotePlayer note={task.descriptionAudio} testID="task-description-voice" /> : null}
                </View>
              ) : null}

              {/* Remark Field */}
              <View
                style={styles.cardSection}
                onLayout={(e) => {
                  remarkYRef.current = e.nativeEvent.layout.y;
                }}
              >
                <View style={styles.remarkHeader}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.brandPrimary} />
                  <Text style={[styles.cardLabel, { flex: 1 }]}>Remark</Text>
                  {task.source === "activity" && !remarkVoice ? (
                    <VoiceRecordButton
                      onRecorded={(note) => {
                        setRemarkVoice(note);
                        if (remarkError) setRemarkError(null);
                      }}
                      size={16}
                      testID="task-remark-voice-btn"
                    />
                  ) : null}
                  {task.source === "activity" ? (
                    <AttachFileButton
                      current={remarkFiles.length}
                      onPicked={(picked) => setRemarkFiles((cur) => [...cur, ...picked])}
                      size={18}
                      testID="task-remark-attach-btn"
                    />
                  ) : null}
                </View>

                {remarkSuccess ? (
                  <View style={styles.remarkSuccessBanner}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={styles.remarkSuccessText}>{remarkSuccess}</Text>
                  </View>
                ) : null}

                {remarkError ? (
                  <View style={styles.remarkErrorBanner}>
                    <Ionicons name="alert-circle" size={14} color={colors.error} />
                    <Text style={styles.remarkErrorText}>{remarkError}</Text>
                  </View>
                ) : null}

                <TextInput
                  value={remarkText}
                  onChangeText={(txt) => {
                    const limited = enforceLetterLimit(txt, MAX_LETTERS);
                    setRemarkText(limited);
                    if (remarkError) setRemarkError(null);
                  }}
                  onFocus={() => {
                    setTimeout(() => {
                      if (remarkYRef.current != null && scrollViewRef.current) {
                        scrollViewRef.current.scrollTo({
                          y: Math.max(0, remarkYRef.current - 16),
                          animated: true,
                        });
                      }
                    }, 150);
                  }}
                  placeholder="Add a remark or update note..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                  maxLength={MAX_LETTERS}
                  style={styles.remarkInput}
                  testID="task-remark-input"
                />

                {remarkVoice ? (
                  <VoiceNotePlayer note={remarkVoice} onRemove={() => setRemarkVoice(null)} testID="task-remark-voice-preview" />
                ) : null}
                <PendingAttachments
                  files={remarkFiles}
                  onRemove={(i) => setRemarkFiles((cur) => cur.filter((_, idx) => idx !== i))}
                  style={{ marginTop: 6 }}
                />

                <View style={styles.remarkFooter}>
                  <Text style={[styles.remarkCounter, remarkText.length >= MAX_LETTERS && { color: colors.error }]}>
                    {remarkText.length}/{MAX_LETTERS}
                  </Text>
                  <Pressable
                    onPress={handleAddRemark}
                    disabled={(!remarkText.trim() && !remarkVoice && remarkFiles.length === 0) || submittingRemark || remarkText.length > MAX_LETTERS}
                    style={({ pressed }) => [
                      styles.remarkSubmitBtn,
                      ((!remarkText.trim() && !remarkVoice && remarkFiles.length === 0) || submittingRemark || remarkText.length > MAX_LETTERS) && styles.remarkSubmitBtnDisabled,
                      pressed && { opacity: 0.8 },
                    ]}
                    testID="submit-remark-btn"
                  >
                    {submittingRemark ? (
                      <ActivityIndicator size="small" color={colors.onBrandPrimary} />
                    ) : (
                      <>
                        <Ionicons name="send" size={12} color={colors.onBrandPrimary} />
                        <Text style={styles.remarkSubmitText}>Add Remark</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>

              {/* Inline Activity History Card (2 latest history entries) */}
              <View style={styles.cardSection}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyHeaderTitleRow}>
                    <Ionicons name="time-outline" size={16} color={colors.brandPrimary} />
                    <Text style={styles.cardLabel}>History</Text>
                    <Text style={styles.historyCounterBadge}>
                      ({historyItems.length} {historyItems.length === 1 ? "entry" : "entries"})
                    </Text>
                  </View>
                  {(task.postponeCount ?? 0) > 0 ? (
                    <View style={styles.postponeBadge}>
                      <Text style={styles.postponeBadgeText}>
                        Postponed {task.postponeCount}x
                      </Text>
                    </View>
                  ) : null}
                </View>

                {historyItems.length > 0 ? (
                  <View style={styles.timelineList}>
                    {historyItems.slice(0, 2).map((item, index, arr) => {
                      const isLast = index === arr.length - 1 && historyItems.length <= 2;
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
                            {item.actorText ? <Text style={styles.timelineActor}>{item.actorText}</Text> : null}
                            {item.detailText ? (
                              <Text style={styles.timelineDetail}>{item.detailText}</Text>
                            ) : null}
                            {item.remarks ? (
                              <View style={styles.remarksBox}>
                                <Text
                                  style={styles.remarksText}
                                  numberOfLines={historyItems.length > 2 ? 2 : undefined}
                                  ellipsizeMode="tail"
                                >
                                  “{item.remarks}”
                                </Text>
                              </View>
                            ) : null}
                            {item.audio ? <VoiceNotePlayer note={item.audio} style={{ marginTop: 6 }} /> : null}
                            <AttachmentList items={item.attachments} style={{ marginTop: 6 }} />
                          </View>
                        </View>
                      );
                    })}

                    {historyItems.length > 2 ? (
                      <Pressable
                        onPress={() => setShowHistoryModal(true)}
                        style={({ pressed }) => [styles.showMoreHistoryBtn, pressed && { opacity: 0.7 }]}
                        testID="show-more-history-btn"
                      >
                        <Text style={styles.showMoreHistoryText}>
                          Show all ({historyItems.length} entries)
                        </Text>
                        <Ionicons name="chevron-forward" size={15} color={colors.brandPrimary} />
                      </Pressable>
                    ) : null}
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
              </View>

            </ScrollView>

              {/* Action Buttons Row (Postpone Left, Complete Right) */}
              <View style={styles.actionButtonsRow} onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}>
                {!task.completed && onPostpone ? (
                  <Pressable
                    onPress={() => {
                      onPostpone(task);
                      onClose();
                    }}
                    style={({ pressed }) => [styles.postponeButton, pressed && { opacity: 0.8 }]}
                    testID="postpone-detail-btn"
                  >
                    <Ionicons name="time-outline" size={17} color={colors.warning} />
                    <Text style={styles.postponeButtonText} numberOfLines={1}>
                      Postpone
                    </Text>
                  </Pressable>
                ) : null}

                {/* Action Toggle Button */}
                <Pressable
                  onPress={() => onToggle(task, task.completed ? undefined : remarkText)}
                  style={({ pressed }) => [
                    styles.actionButton,
                    task.completed && {
                      backgroundColor: "rgba(245, 158, 11, 0.14)",
                      borderWidth: 1,
                      borderColor: "rgba(245, 158, 11, 0.35)",
                      shadowOpacity: 0,
                      elevation: 0,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                  testID="toggle-detail-btn"
                >
                  <Ionicons
                    name={task.completed ? "arrow-undo-outline" : "checkmark-done-outline"}
                    size={17}
                    color={task.completed ? colors.warning : colors.onBrandPrimary}
                  />
                  <Text style={[styles.actionButtonText, task.completed && { color: colors.warning }]} numberOfLines={1}>
                    {task.completed ? "Mark Incomplete" : "Completed"}
                  </Text>
                </Pressable>
              </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>

      {/* Dedicated Activity History Modal */}
      <Modal
        visible={showHistoryModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <View style={styles.backdrop}>
          <Pressable
            onPress={() => setShowHistoryModal(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.historySheet,
              {
                maxHeight: maxSheetHeight,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
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
              style={{ flexShrink: 1 }}
              nestedScrollEnabled
              contentContainerStyle={styles.historyScrollBody}
              scrollEventThrottle={100}
              onScroll={({ nativeEvent }) => {
                const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 80;
                if (nearBottom && historyVisibleCount < historyItems.length) {
                  setHistoryVisibleCount((c) => Math.min(c + HISTORY_PAGE_SIZE, historyItems.length));
                }
              }}
            >
              {historyItems.length > 0 ? (
                <View style={styles.timelineList}>
                  {historyItems.slice(0, historyVisibleCount).map((item, index, shown) => {
                    const isLast = index === shown.length - 1;
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
                          {item.actorText ? <Text style={styles.timelineActor}>{item.actorText}</Text> : null}
                          {item.detailText ? (
                            <Text style={styles.timelineDetail}>{item.detailText}</Text>
                          ) : null}
                          {item.remarks ? (
                            <View style={styles.remarksBox}>
                              <Text style={styles.remarksText}>“{item.remarks}”</Text>
                            </View>
                          ) : null}
                          {item.audio ? <VoiceNotePlayer note={item.audio} style={{ marginTop: 6 }} /> : null}
                            <AttachmentList items={item.attachments} style={{ marginTop: 6 }} />
                        </View>
                      </View>
                    );
                  })}
                  {historyVisibleCount < historyItems.length ? (
                    <Pressable
                      onPress={() =>
                        setHistoryVisibleCount((c) => Math.min(c + HISTORY_PAGE_SIZE, historyItems.length))
                      }
                      style={({ pressed }) => [styles.showMoreHistoryBtn, pressed && { opacity: 0.7 }]}
                      testID="load-more-history-btn"
                    >
                      <Text style={styles.showMoreHistoryText}>
                        Load more ({historyItems.length - historyVisibleCount} remaining)
                      </Text>
                    </Pressable>
                  ) : null}
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
          </View>
        </View>
      </Modal>

      {internalPostponeModal ? (
        <PostponeActivityModal
          task={task}
          visible={internalPostponeModal}
          onClose={() => setInternalPostponeModal(false)}
          onPostponed={() => {
            setInternalPostponeModal(false);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20,22,30,0.5)",
    justifyContent: "flex-end",
  },
  avoider: {
    width: "100%",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    overflow: "hidden",
  },
  header: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 8,
  },
  headerTitleContainer: {
    position: "absolute",
    top: 0,
    bottom: 12,
    left: 48,
    right: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    flexShrink: 0,
  },
  body: {
    paddingTop: 10,
    paddingBottom: 2,
    gap: 8,
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
    borderRadius: 14,
    padding: 12,
    gap: 6,
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
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    color: colors.onBrandPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  postponeButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  postponeButtonText: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: "700",
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
    minHeight: 40,
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
    paddingBottom: 8,
    gap: 2,
  },
  timelineContentHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  timelineActionTitle: {
    flex: 1,
    flexWrap: "wrap",
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "700",
  },
  timelineTime: {
    flexShrink: 0,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
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
    paddingTop: 14,
    paddingBottom: 8,
  },
  metaCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaDatePressable: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  metaDot: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  metaDateText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.onSurface,
  },
  metaAssignText: {
    fontSize: 13,
    color: colors.muted,
    flex: 1,
  },
  metaHighlight: {
    fontWeight: "600",
    color: colors.onSurface,
  },
  metaSubtle: {
    color: colors.muted,
    fontSize: 12,
  },
  showMoreHistoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  showMoreHistoryText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandPrimary,
  },
  historyCounterBadge: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.muted,
  },
  remarkHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  remarkInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.onSurface,
    fontSize: 14,
    minHeight: 56,
    textAlignVertical: "top",
  },
  remarkFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  remarkCounter: {
    color: colors.muted,
    fontSize: 11,
  },
  remarkSubmitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  remarkSubmitBtnDisabled: {
    opacity: 0.5,
  },
  remarkSubmitText: {
    color: colors.onBrandPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  remarkSuccessBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    marginBottom: 4,
  },
  remarkSuccessText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "500",
  },
  remarkErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    marginBottom: 4,
  },
  remarkErrorText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "500",
  },
}));
