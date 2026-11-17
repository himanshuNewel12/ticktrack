import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format, isSameDay, addDays } from "date-fns";

import { useTheme } from "../theme";
import { useApp } from "../app-context";
import { parseTaskDate } from "../utils/date-utils";
import { enforceLetterLimit, MAX_LETTERS } from "../utils/word-limit";
import type { Task, UpdateTaskPayload, VoiceNote } from "../types";
import { VoiceNotePlayer, VoiceRecordButton } from "./voice-note";
import { DatePickerSheet, PriorityPopup, AssigneeModal, getSmartDefaultTime, WEEKDAY_LABELS } from "./task-composer";

type Props = {
  task: Task | null;
  visible: boolean;
  onClose: () => void;
  onSave: (task: Task, payload: UpdateTaskPayload) => Promise<void>;
};

export function TaskEditModal({ task, visible, onClose, onSave }: Props) {
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

  const maxSheetHeight = Math.max(
    220,
    Math.round(windowHeight - insets.top - keyboardHeight - (Platform.OS === "ios" ? 16 : 28))
  );
  const { assignableUsers } = useApp();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<string>("none");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [priority, setPriority] = useState<"high" | "medium" | "low" | "none">("medium");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [watcherIds, setWatcherIds] = useState<string[]>([]);
  const [escalatorIds, setEscalatorIds] = useState<string[]>([]);

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load the form once per open (or when a different task is opened). Depending on
  // the `task` object itself reset every unsaved edit on each background refresh.
  const taskId = task?.id ?? null;
  useEffect(() => {
    if (visible && task) {
      setTitle(task.title || "");
      setNotes(task.notes || "");
      setVoice(task.descriptionAudio ?? null);

      const rec = task.recurrence && task.recurrence !== "none" ? task.recurrence.toLowerCase() : "none";
      setRepeat(rec);
      setRepeatDays(Array.isArray(task.repeatDays) ? task.repeatDays : []);

      // Normalize priority
      const p = (task.priority || "medium").toLowerCase();
      if (p === "high" || p === "critical") setPriority("high");
      else if (p === "low") setPriority("low");
      else if (p === "none") setPriority("none");
      else setPriority("medium");

      // Normalize assignees
      const rawIds = task.assigneeIds && task.assigneeIds.length > 0
        ? task.assigneeIds
        : task.assignees && task.assignees.length > 0
        ? task.assignees.map((a: any) => a.id || a.userId)
        : task.assigneeId
        ? [task.assigneeId]
        : [];
      setAssigneeIds(Array.from(new Set(rawIds.map(String).filter(Boolean))));
      setWatcherIds(Array.from(new Set((task.watchers ?? []).map((w) => String(w.id)).filter(Boolean))));
      setEscalatorIds(Array.from(new Set((task.escalators ?? []).map((e) => String(e.id)).filter(Boolean))));

      // Normalize due date & time
      if (task.due_date) {
        if (task.due_date.includes("T")) {
          const [d, t] = task.due_date.split("T");
          setDueDate(d);
          setDueTime(t ? t.slice(0, 5) : null);
        } else {
          setDueDate(task.due_date);
          setDueTime(null);
        }
      } else {
        setDueDate(null);
        setDueTime(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, taskId]);

  const formatRepeatDisplay = (rep: string, days: number[]) => {
    if (rep === "none") return "Doesn't repeat";
    if (rep === "daily") return "Daily";
    if (rep === "weekdays") return "Every weekday (Mon-Fri)";
    if (rep === "monthly") return "Monthly";
    if (rep === "fortnightly") {
      if (days.length > 0 && days.length < 7) {
        return `Fortnightly (${[...days].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(", ")})`;
      }
      return "Fortnightly (Every 2 weeks)";
    }
    if (rep === "weekly") {
      if (days.length > 0 && days.length < 7) {
        return `Weekly (${[...days].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(", ")})`;
      }
      return "Weekly";
    }
    return rep;
  };

  // Voice descriptions exist on one-off activities only (not project tasks or repeating series).
  const voiceAllowed = task?.source === "activity" && !task.id.startsWith("recurrence_") && repeat === "none";

  // Watchers and escalators live on one-off activities only (same rule as the composer).
  const rolesAllowed = task?.source === "activity" && !task.id.startsWith("recurrence_") && repeat === "none";

  const handleSave = async () => {
    if (!task) return;
    if (!title.trim()) {
      Alert.alert("Title required", "Please enter a task title.");
      return;
    }
    if (notes.length > MAX_LETTERS) {
      Alert.alert("Description too long", `Description cannot exceed ${MAX_LETTERS} letters (currently ${notes.length} letters).`);
      return;
    }

    setSaving(true);
    try {
      const effectiveTime = dueTime ?? (dueDate ? getSmartDefaultTime(dueDate) : null);
      const dueIso = dueDate ? `${dueDate}T${effectiveTime}:00` : null;

      await onSave(task, {
        title: title.trim(),
        notes: notes.trim(),
        ...(voice?.uri ? { voice } : {}),
        ...(!voice && task.descriptionAudio ? { removeVoice: true } : {}),
        due_date: dueIso,
        priority: priority === "none" ? "medium" : priority,
        assigneeIds,
        ...(rolesAllowed ? { watcherIds, escalatorIds } : {}),
        recurrence: repeat,
        repeatDays: (repeat === "weekly" || repeat === "fortnightly") ? repeatDays : [],
      });
      onClose();
    } catch (err) {
      Alert.alert("Could not update task", err instanceof Error ? err.message : "Please try again");
    } finally {
      setSaving(false);
    }
  };

  const assignedUsersNames = useMemo(() => {
    if (assigneeIds.length === 0) return null;
    const names = assigneeIds.map((id) => {
      const matched = assignableUsers.find((u) => u.id === id);
      if (matched) {
        return (matched.firstName ?? "" + " " + (matched.lastName ?? "")).trim() || matched.email;
      }
      const fromTask = task?.assignees?.find((a: any) => (a.id || a.userId) === id);
      if (fromTask) return fromTask.name;
      return "Team member";
    });
    return names.join(", ");
  }, [assigneeIds, assignableUsers, task]);

  const formatDueDisplay = (date: string | null, time: string | null) => {
    if (!date) return "No due date";
    try {
      const parsed = parseTaskDate(date);
      if (!parsed) return date;
      const today = new Date();
      const tomorrow = addDays(today, 1);
      const base = isSameDay(parsed, today) ? "Today" : isSameDay(parsed, tomorrow) ? "Tomorrow" : format(parsed, "EEE, MMM d");
      if (!time) return base;
      const [h, m] = time.split(":");
      const hourNum = parseInt(h, 10);
      const ampm = hourNum >= 12 ? "PM" : "AM";
      const displayH = hourNum % 12 === 0 ? 12 : hourNum % 12;
      return `${base} at ${displayH}:${m} ${ampm}`;
    } catch {
      return date;
    }
  };

  if (!visible || !task) return null;

  const priorityColor =
    priority === "high"
      ? colors.error
      : priority === "medium"
      ? colors.warning
      : priority === "low"
      ? colors.info
      : colors.muted;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={() => { /* trap */ }}
            style={[
              styles.sheet,
              {
                marginTop: insets.top + (Platform.OS === "ios" ? 10 : 20),
                maxHeight: maxSheetHeight,
                marginBottom: Platform.OS === "android" ? keyboardHeight : 0,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={onClose} style={styles.iconButton} testID="close-edit-modal">
                <Ionicons name="close" size={22} color={colors.onSurface} />
              </Pressable>
              <View style={styles.headerTitleContainer} pointerEvents="none">
                <Text style={styles.headerTitle} numberOfLines={1}>Edit Task</Text>
              </View>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                testID="save-edit-task"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              style={{ flexShrink: 1 }}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
            >
              {/* Title Input */}
              <View style={styles.inputCard}>
                <Text style={styles.fieldLabel}>TITLE</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Task title"
                  placeholderTextColor={colors.muted}
                  style={styles.titleInput}
                  testID="edit-task-title-input"
                />
              </View>

              {/* Description Input */}
              <View style={styles.inputCard}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={styles.fieldLabel}>DESCRIPTION / NOTES</Text>
                  {voiceAllowed && !voice ? (
                    <VoiceRecordButton onRecorded={setVoice} size={16} testID="edit-task-notes-voice-btn" />
                  ) : null}
                </View>
                <TextInput
                  value={notes}
                  onChangeText={(txt) => setNotes(enforceLetterLimit(txt, MAX_LETTERS))}
                  maxLength={MAX_LETTERS}
                  placeholder="Add notes, context, or instructions..."
                  placeholderTextColor={colors.muted}
                  style={styles.notesInput}
                  multiline
                  textAlignVertical="top"
                  testID="edit-task-notes-input"
                />
                {notes ? (
                  <Text style={{ fontSize: 11, color: notes.length >= MAX_LETTERS ? colors.error : colors.muted, alignSelf: "flex-end", marginTop: 4 }}>
                    {notes.length}/{MAX_LETTERS}
                  </Text>
                ) : null}
                {voice ? (
                  <VoiceNotePlayer note={voice} onRemove={() => setVoice(null)} style={{ marginTop: 8 }} testID="edit-task-notes-voice-preview" />
                ) : null}
              </View>

              {/* Property Selectors */}
              <View style={styles.propertiesCard}>
                {/* Due Date & Time Row */}
                <Pressable
                  onPress={() => setDatePickerOpen(true)}
                  style={({ pressed }) => [styles.propertyRow, pressed && { opacity: 0.7 }]}
                  testID="edit-due-date-row"
                >
                  <View style={styles.propertyLeft}>
                    <Ionicons name="calendar-outline" size={20} color={dueDate ? colors.brandPrimary : colors.muted} />
                    <Text style={styles.propertyLabel}>Due Date</Text>
                  </View>
                  <View style={styles.propertyRight}>
                    <Text style={[styles.propertyValue, dueDate && { color: colors.brandPrimary, fontWeight: "600" }]}>
                      {formatDueDisplay(dueDate, dueTime)}
                    </Text>
                    {dueDate ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          setDueDate(null);
                          setDueTime(null);
                        }}
                        hitSlop={8}
                        style={{ marginLeft: 6 }}
                      >
                        <Ionicons name="close-circle" size={16} color={colors.muted} />
                      </Pressable>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    )}
                  </View>
                </Pressable>

                <View style={styles.divider} />

                {/* Repeat Row */}
                <Pressable
                  onPress={() => setDatePickerOpen(true)}
                  style={({ pressed }) => [styles.propertyRow, pressed && { opacity: 0.7 }]}
                  testID="edit-repeat-row"
                >
                  <View style={styles.propertyLeft}>
                    <Ionicons name="repeat-outline" size={20} color={repeat !== "none" ? colors.brandPrimary : colors.muted} />
                    <Text style={styles.propertyLabel}>Repeat</Text>
                  </View>
                  <View style={styles.propertyRight}>
                    <Text style={[styles.propertyValue, repeat !== "none" && { color: colors.brandPrimary, fontWeight: "600" }]}>
                      {formatRepeatDisplay(repeat, repeatDays)}
                    </Text>
                    {repeat !== "none" ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          setRepeat("none");
                          setRepeatDays([]);
                        }}
                        hitSlop={8}
                        style={{ marginLeft: 6 }}
                      >
                        <Ionicons name="close-circle" size={16} color={colors.muted} />
                      </Pressable>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    )}
                  </View>
                </Pressable>

                <View style={styles.divider} />

                {/* Priority Row */}
                <Pressable
                  onPress={() => setPriorityOpen(true)}
                  style={({ pressed }) => [styles.propertyRow, pressed && { opacity: 0.7 }]}
                  testID="edit-priority-row"
                >
                  <View style={styles.propertyLeft}>
                    <Ionicons name="flag-outline" size={20} color={priorityColor} />
                    <Text style={styles.propertyLabel}>Priority</Text>
                  </View>
                  <View style={styles.propertyRight}>
                    <View style={[styles.priorityPill, { backgroundColor: priorityColor + "20" }]}>
                      <Text style={[styles.priorityPillText, { color: priorityColor }]}>
                        {priority.toUpperCase()}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </View>
                </Pressable>

                <View style={styles.divider} />

                {/* Assignees Row */}
                <Pressable
                  onPress={() => setAssigneeOpen(true)}
                  style={({ pressed }) => [styles.propertyRow, pressed && { opacity: 0.7 }]}
                  testID="edit-assignees-row"
                >
                  <View style={styles.propertyLeft}>
                    <Ionicons
                      name="people-outline"
                      size={20}
                      color={assigneeIds.length > 0 ? colors.info : colors.muted}
                    />
                    <Text style={styles.propertyLabel}>Assignees</Text>
                  </View>
                  <View style={[styles.propertyRight, { flex: 1, justifyContent: "flex-end" }]}>
                    <Text
                      style={[
                        styles.propertyValue,
                        assigneeIds.length > 0 && { color: colors.onSurface, fontWeight: "500" },
                      ]}
                      numberOfLines={1}
                    >
                      {assignedUsersNames || "Unassigned"}
                    </Text>
                    {assigneeIds.length > 1 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{assigneeIds.length}</Text>
                      </View>
                    ) : null}
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 4 }} />
                  </View>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>

      {/* Date Sheet */}
      <DatePickerSheet
        visible={datePickerOpen}
        initialDate={dueDate}
        initialTime={dueTime}
        initialReminders={task?.reminders ?? []}
        initialRepeat={repeat}
        initialRepeatDays={repeatDays}
        onClose={() => setDatePickerOpen(false)}
        onApply={(payload) => {
          setDueDate(payload.date);
          setDueTime(payload.time);
          if (payload.repeat !== undefined) {
            setRepeat(payload.repeat);
          }
          if (payload.repeatDays !== undefined) {
            setRepeatDays(payload.repeatDays);
          }
          setDatePickerOpen(false);
        }}
      />

      {/* Priority Popup */}
      <PriorityPopup
        visible={priorityOpen}
        current={priority}
        onSelect={(p) => setPriority(p)}
        onClose={() => setPriorityOpen(false)}
      />

      {/* Multi-assignee Modal */}
      <AssigneeModal
        visible={assigneeOpen}
        assignableUsers={assignableUsers}
        selectedIds={assigneeIds}
        onSelect={(ids) => setAssigneeIds(ids)}
        {...(rolesAllowed
          ? { watcherIds, escalatorIds, onSelectWatchers: setWatcherIds, onSelectEscalators: setEscalatorIds }
          : {})}
        onClose={() => setAssigneeOpen(false)}
      />
    </Modal>
  );
}

function useStyles() {
  const { colors } = useTheme();

  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 16,
      paddingHorizontal: 20,
    },
    header: {
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    iconButton: {
      padding: 6,
      borderRadius: 20,
    },
    headerTitleContainer: {
      position: "absolute",
      left: 60,
      right: 80,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.onSurface,
      textAlign: "center",
    },
    saveBtn: {
      backgroundColor: colors.brandPrimary,
      paddingVertical: 7,
      paddingHorizontal: 16,
      borderRadius: 18,
      minWidth: 64,
      alignItems: "center",
      justifyContent: "center",
    },
    saveBtnText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 14,
    },
    body: {
      paddingTop: 14,
      gap: 12,
      paddingBottom: 6,
    },
    inputCard: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    fieldLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    titleInput: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.onSurface,
      paddingVertical: 2,
    },
    notesInput: {
      fontSize: 14,
      color: colors.onSurface,
      minHeight: 36,
      maxHeight: 120,
      paddingVertical: 2,
    },
    propertiesCard: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: 16,
      paddingVertical: 4,
      paddingHorizontal: 14,
    },
    propertyRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
    },
    propertyLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    propertyLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.onSurface,
    },
    propertyRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    propertyValue: {
      fontSize: 14,
      color: colors.muted,
      maxWidth: 180,
    },
    priorityPill: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 12,
    },
    priorityPillText: {
      fontSize: 12,
      fontWeight: "700",
    },
    badge: {
      backgroundColor: colors.brandPrimary,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgeText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "700",
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
  });
}
