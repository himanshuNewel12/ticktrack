import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { addDays, addMonths, format, isSameDay, startOfMonth, startOfWeek } from "date-fns";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { ActivityIndicator, Alert, ColorValue, FlatList, InteractionManager, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useApp } from "@/src/app-context";
import { ConfirmDeleteModal } from "./confirm-delete-modal";
import { AnalogClockPicker } from "./analog-clock-picker";
import { VoiceNotePlayer, VoiceRecordButton } from "./voice-note";
import { PendingAttachments, pickAttachments } from "./attachments";
import { makeStyles, useTheme } from "@/src/theme";
import type { AssignableUser, LocalAttachment, TaskList, VoiceNote } from "@/src/types";
import { parseTaskDate } from "@/src/utils/date-utils";
import { enforceLetterLimit, MAX_LETTERS } from "@/src/utils/word-limit";

type LooseIconProps = { name: string; size: number; color?: ColorValue; style?: any };
const Ionicons = BaseIonicons as unknown as ComponentType<LooseIconProps>;

export type ComposerKind = "task" | "voice";

type Props = {
  kind: ComposerKind | null;
  onClose: () => void;
  defaultDue?: string;
  defaultListId?: string | null;
  defaultAssigneeIds?: string[];
};

const PRIORITY_OPTIONS: { key: "high" | "medium" | "low" | "none"; label: string; color: keyof ReturnType<typeof useTheme>["colors"] | "muted" }[] = [
  { key: "high", label: "High Priority", color: "error" },
  { key: "medium", label: "Medium Priority", color: "warning" },
  { key: "low", label: "Low Priority", color: "info" },
  { key: "none", label: "No Priority", color: "muted" },
];

const REMINDER_LABELS: { key: string; label: string }[] = [
  { key: "on_due", label: "At due time" },
  { key: "15_mins_before", label: "15 minutes before" },
  { key: "1_hour_before", label: "1 hour before" },
  { key: "1_day_before", label: "1 day before" },
];
const REPEAT_LABELS: { key: string; label: string }[] = [
  { key: "none", label: "Never" },
  { key: "daily", label: "Daily" },
  { key: "weekdays", label: "Weekdays (Mon–Fri)" },
  { key: "weekly", label: "Weekly" },
  { key: "fortnightly", label: "Fortnightly (Every 2 weeks)" },
  { key: "monthly", label: "Monthly" },
];
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getSmartDefaultTime(dueDateStr: string | null): string {
  if (!dueDateStr) return "09:00";
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  if (dueDateStr === todayStr) {
    if (now.getHours() < 9) return "09:00";
    if (now.getHours() < 17) return "18:00";
    return "21:00";
  }
  return "09:00";
}

export function TaskComposer({ kind, onClose, defaultDue, defaultListId, defaultAssigneeIds }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { addTask, lists, addList, assignableUsers, user } = useApp();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [remark, setRemark] = useState("");
  const [files, setFiles] = useState<LocalAttachment[]>([]);
  const [dueDate, setDueDate] = useState<string | null>(defaultDue ?? null);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [dueEndTime, setDueEndTime] = useState<string | null>(null);
  const [priority, setPriority] = useState<"high" | "medium" | "low" | "none">("none");
  const [recurrence, setRecurrence] = useState("none");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [reminders, setReminders] = useState<string[]>(["15_mins_before"]);
  const [listId, setListId] = useState<string | null>(defaultListId ?? null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(defaultAssigneeIds ?? []);
  const [assignedById, setAssignedById] = useState<string | null>(null);
  const [assignedByOpen, setAssignedByOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [informerIds, setInformerIds] = useState<string[]>([]);
  const [escalatorIds, setEscalatorIds] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);

  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (kind) {
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        setTitle(""); setNotes(""); setVoice(null); setDueDate(defaultDue ?? null); setDueTime(null); setDueEndTime(null);
        setPriority("none"); setRecurrence("none"); setRepeatDays([]); setReminders(["15_mins_before"]);
        setAssigneeIds(defaultAssigneeIds ?? []);
        setInformerIds([]);
        setEscalatorIds([]);
        setAssignedById(null);
        setListId(defaultListId ?? lists.find((item) => item.system)?.id ?? lists[0]?.id ?? null);
      }
    } else {
      hasInitializedRef.current = false;
    }
  }, [kind, defaultDue, defaultListId, defaultAssigneeIds, lists]);

  const assigneeLabel = useMemo(() => {
    if (assigneeIds.length === 0) return undefined;
    if (assigneeIds.length === 1) {
      if (user?.id && assigneeIds[0] === user.id) return "Me";
      const u = assignableUsers.find((item) => item.id === assigneeIds[0]);
      return u ? `${u.firstName || u.email.split("@")[0]}` : "1 assignee";
    }
    const hasMe = Boolean(user?.id && assigneeIds.includes(user.id));
    const count = assigneeIds.length;
    if (hasMe) {
      return `Me +${count - 1}`;
    }
    const first = assignableUsers.find((item) => item.id === assigneeIds[0]);
    const name = first ? `${first.firstName || first.email.split("@")[0]}` : "Assignee";
    return `${name} +${count - 1}`;
  }, [assigneeIds, assignableUsers, user?.id]);

  // Focus after the slide-up finishes; opening the keyboard mid-animation makes it stutter.
  const titleInputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (!kind) return;
    const timer = setTimeout(() => titleInputRef.current?.focus(), 280);
    return () => clearTimeout(timer);
  }, [kind]);

  const assignedByLabel = useMemo(() => {
    if (!assignedById) return undefined;
    const u = assignableUsers.find((item) => item.id === assignedById);
    return u ? u.firstName || u.email.split("@")[0] : "Selected";
  }, [assignedById, assignableUsers]);

  if (!kind) return null;

  const activeList = lists.find((item) => item.id === listId);
  const priorityIconColor = priority === "high" ? colors.error : priority === "medium" ? colors.warning : priority === "low" ? colors.info : colors.muted;

  const save = async () => {
    if (!title.trim()) { Alert.alert("Add a task title", "Give this task a short name before saving."); return; }
    if (notes.length > MAX_LETTERS) {
      Alert.alert("Description too long", `Description cannot exceed ${MAX_LETTERS} letters (currently ${notes.length} letters).`);
      return;
    }
    setSyncing(true);
    try {
      const effectiveTime = dueTime ?? getSmartDefaultTime(dueDate);
      const dueIso = dueDate ? `${dueDate}T${effectiveTime}:00` : null;
      await addTask({
        title: title.trim(),
        notes,
        ...(remark.trim() && recurrence === "none" ? { remark: remark.trim() } : {}),
        ...(files.length && recurrence === "none" ? { attachments: files } : {}),
        ...(recurrence === "none" && informerIds.length ? { informerIds } : {}),
        ...(recurrence === "none" && escalatorIds.length ? { escalatorIds } : {}),
        ...(voice && recurrence === "none" ? { voice } : {}),
        due_date: dueIso,
        ...(dueIso && dueEndTime ? { end_time: dueEndTime } : {}),
        priority: priority === "none" ? "medium" : priority,
        recurrence,
        repeatDays,
        reminders,
        list_id: listId,
        assignee_id: assigneeIds[0] ?? null,
        assigneeIds,
        assignedById,
        source: kind === "voice" ? "voice" : "quick_add",
      });
      onClose();
    } catch (err) {
      Alert.alert("Could not save task", err instanceof Error ? err.message : "Please try again");
    } finally {
      setSyncing(false);
    }
  };

  const dueLabel = dueDate ? formatDuePill(dueDate, dueTime) : null;

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop} testID="composer-backdrop">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={Platform.OS === "android" ? 0 : 0}
          style={styles.avoider}
          pointerEvents="box-none"
        >
          <Pressable onPress={() => { /* trap */ }} style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]} testID="composer-sheet">
            <TextInput
              testID="composer-title"
              ref={titleInputRef}
              value={title}
              onChangeText={setTitle}
              placeholder={kind === "voice" ? "What did you say?" : "What needs your attention?"}
              placeholderTextColor={colors.muted}
              style={styles.titleInput}
            />
            <View style={styles.descriptionRow}>
              <TextInput
                testID="composer-notes"
                value={notes}
                onChangeText={(txt) => setNotes(enforceLetterLimit(txt, MAX_LETTERS))}
                maxLength={MAX_LETTERS}
                placeholder="Description"
                placeholderTextColor={colors.muted}
                multiline
                scrollEnabled
                textAlignVertical="top"
                style={styles.descInput}
              />
              {recurrence === "none" && !voice ? (
                <VoiceRecordButton onRecorded={setVoice} size={16} testID="composer-notes-voice-btn" />
              ) : null}
              {activeList && !activeList.system ? (
                <View style={styles.inlineTag}>
                  <Text style={styles.inlineTagEmoji}>{activeList.emoji}</Text>
                  <Text style={styles.inlineTagText}>{activeList.name}</Text>
                </View>
              ) : null}
            </View>
            {notes ? (
              <Text style={{ fontSize: 11, color: notes.length >= MAX_LETTERS ? colors.error : colors.muted, alignSelf: "flex-end", marginRight: 8, marginBottom: 4 }}>
                {notes.length}/{MAX_LETTERS}
              </Text>
            ) : null}
            {voice && recurrence === "none" ? (
              <VoiceNotePlayer note={voice} onRemove={() => setVoice(null)} style={{ marginBottom: 6 }} testID="composer-notes-voice-preview" />
            ) : null}
            {recurrence === "none" ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TextInput
                    testID="composer-remark"
                    value={remark}
                    onChangeText={setRemark}
                    placeholder="Remark (optional)"
                    placeholderTextColor={colors.muted}
                    multiline
                    scrollEnabled
                    textAlignVertical="top"
                    style={[styles.descInput, { paddingVertical: 6 }]}
                  />
                </View>
                <PendingAttachments
                  files={files}
                  onRemove={(i) => setFiles((cur) => cur.filter((_, idx) => idx !== i))}
                  style={{ marginBottom: 6 }}
                />
              </>
            ) : null}

            <View style={styles.toolbar}>
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="always"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.toolbarScrollContent}
                style={{ flex: 1 }}
              >
                <ToolbarButton
                  testID="tb-date"
                  icon="calendar-outline"
                  highlight={Boolean(dueLabel)}
                  onPress={() => {
                    Keyboard.dismiss();
                    setDatePickerOpen(true);
                  }}
                  styles={styles}
                  colors={colors}
                  label={dueLabel ?? undefined}
                />
                <ToolbarButton
                  testID="tb-priority"
                  icon="flag"
                  iconColor={priority !== "none" ? priorityIconColor : undefined}
                  onPress={() => {
                    Keyboard.dismiss();
                    setPriorityOpen(true);
                  }}
                  styles={styles}
                  colors={colors}
                />
                <ToolbarButton
                  testID="tb-assignee"
                  icon="person-outline"
                  onPress={() => {
                    Keyboard.dismiss();
                    setAssigneeOpen(true);
                  }}
                  styles={styles}
                  colors={colors}
                  label={assigneeLabel}
                  highlight={assigneeIds.length > 0}
                />
                <ToolbarButton
                  testID="tb-assigned-by"
                  badgeText="By"
                  onPress={() => {
                    Keyboard.dismiss();
                    setAssignedByOpen(true);
                  }}
                  styles={styles}
                  colors={colors}
                  label={assignedByLabel}
                  highlight={Boolean(assignedById)}
                />
                <ToolbarButton
                  testID="tb-attach"
                  icon="attach-outline"
                  onPress={async () => {
                    Keyboard.dismiss();
                    if (recurrence !== "none") {
                      Alert.alert("Not available", "Files can't be attached to repeating tasks.");
                      return;
                    }
                    const picked = await pickAttachments(files.length);
                    if (picked.length) setFiles((cur) => [...cur, ...picked]);
                  }}
                  styles={styles}
                  colors={colors}
                  label={files.length ? `${files.length}` : undefined}
                  highlight={files.length > 0}
                />
              </ScrollView>
              <Pressable
                testID="composer-save"
                onPress={save}
                disabled={syncing || !title.trim()}
                style={({ pressed }) => [styles.sendButton, (!title.trim() || syncing) && styles.sendButtonDisabled, pressed && styles.pressed]}
              >
                {syncing ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="send" size={18} color={colors.onBrandPrimary} />}
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>

      <DatePickerSheet
        visible={datePickerOpen}
        initialDate={dueDate}
        initialTime={dueTime}
        initialEndTime={dueEndTime}
        enableDuration
        initialReminders={reminders}
        initialRepeat={recurrence}
        initialRepeatDays={repeatDays}
        onClose={() => setDatePickerOpen(false)}
        onApply={(payload) => {
          setDueDate(payload.date);
          setDueTime(payload.time);
          setDueEndTime(payload.endTime ?? null);
          setReminders(payload.reminders);
          setRecurrence(payload.repeat);
          setRepeatDays(payload.repeatDays ?? []);
          setDatePickerOpen(false);
        }}
      />

      <PriorityPopup visible={priorityOpen} current={priority} onSelect={(value) => setPriority(value)} onClose={() => setPriorityOpen(false)} />
      <ListPopup visible={listOpen} lists={lists} currentId={listId} onSelect={(id) => setListId(id)} onCreate={async (name) => { const created = await addList({ name, emoji: "📁" }); setListId(created.id); }} onClose={() => setListOpen(false)} />
      <AssigneeModal visible={assigneeOpen} assignableUsers={assignableUsers} selectedIds={assigneeIds} onSelect={(ids) => setAssigneeIds(ids)} informerIds={informerIds} escalatorIds={escalatorIds} onSelectInformers={setInformerIds} onSelectEscalators={setEscalatorIds} onClose={() => setAssigneeOpen(false)} />
      <AssigneeModal
        visible={assignedByOpen}
        title="Assigned By"
        single
        assignableUsers={assignableUsers}
        selectedIds={assignedById ? [assignedById] : []}
        onSelect={(ids) => setAssignedById(ids[0] ?? null)}
        onClose={() => setAssignedByOpen(false)}
      />
      <MorePopup
        visible={moreOpen}
        reminders={reminders}
        repeat={recurrence}
        repeatDays={repeatDays}
        onRemindersChange={setReminders}
        onRepeatChange={(nextRep) => {
          setRecurrence(nextRep);
          if ((nextRep === "weekly" || nextRep === "fortnightly") && repeatDays.length === 0) {
            setRepeatDays([new Date().getDay()]);
          }
        }}
        onRepeatDaysChange={setRepeatDays}
        onClose={() => setMoreOpen(false)}
      />
    </Modal>
  );
}

function ToolbarButton({ icon, badgeText, label, iconColor, highlight, onPress, testID, styles, colors }: { icon?: string; badgeText?: string; label?: string; iconColor?: ColorValue; highlight?: boolean; onPress: () => void; testID: string; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  const tint = iconColor ?? (highlight ? colors.brandPrimary : colors.onSurfaceSecondary);
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.tbButton, highlight && styles.tbButtonHighlight, pressed && styles.pressed]}>
      {badgeText ? (
        <View style={[styles.tbBadge, { borderColor: tint }]}>
          <Text style={[styles.tbBadgeText, { color: tint }]}>{badgeText}</Text>
        </View>
      ) : (
        <Ionicons name={icon as any} size={20} color={tint} />
      )}
      {label ? <Text style={[styles.tbLabel, highlight && styles.tbLabelHighlight]} numberOfLines={1}>{label}</Text> : null}
    </Pressable>
  );
}

function formatTimeDisplay(time: string | null): string {
  if (!time) return "None";
  try {
    const parts = time.split(":");
    const hour = parseInt(parts[0], 10);
    const min = parts[1] ?? "00";
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:${min} ${suffix}`;
  } catch {
    return time;
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":");
  return parseInt(h, 10) * 60 + parseInt(m ?? "0", 10);
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDurationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

const DURATION_PRESETS = [15, 30, 60, 120];

function formatDuePill(date: string, time: string | null): string {
  try {
    const parsed = parseTaskDate(date);
    if (!parsed) return date;
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const base = isSameDay(parsed, today) ? "Today" : isSameDay(parsed, tomorrow) ? "Tomorrow" : format(parsed, "MMM d");
    if (!time) return base;
    return `${base}, ${formatTimeDisplay(time)}`;
  } catch { return date; }
}

// -------------------------------------------------------------------- Date sheet

// Separate small modal holding only the clock, so the date sheet stays short on small devices.
function TimePickerModal({
  visible,
  currentTime,
  onCancel,
  onConfirm,
  styles,
  colors,
}: {
  visible: boolean;
  currentTime: string | null;
  onCancel: () => void;
  onConfirm: (time: string) => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const [draft, setDraft] = useState(currentTime ?? "09:00");
  useEffect(() => {
    if (visible) setDraft(currentTime ?? "09:00");
  }, [visible, currentTime]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.timeModalBackdrop}>
        <Pressable onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View style={styles.timeModalCard} testID="time-picker-modal">
          <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ alignItems: "center" }}>
            <AnalogClockPicker value={draft} onChange={(t) => setDraft(t ?? draft)} />
          </ScrollView>
          <View style={styles.timeModalActions}>
            <Pressable onPress={onCancel} style={styles.timeModalBtn} testID="time-cancel">
              <Text style={[styles.timeModalBtnText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(draft)} style={styles.timeModalBtn} testID="time-ok">
              <Text style={[styles.timeModalBtnText, { color: colors.brandPrimary }]}>OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function DatePickerSheet({
  visible,
  initialDate,
  initialTime,
  initialEndTime,
  enableDuration = false,
  initialReminders,
  initialRepeat,
  initialRepeatDays,
  onClose,
  onApply,
}: {
  visible: boolean;
  initialDate: string | null;
  initialTime: string | null;
  /** End of the time-box, "HH:mm" on the same day. Only used when `enableDuration` is set. */
  initialEndTime?: string | null;
  /** Shows the Duration tab. Off for callers (e.g. edit) that can't save an end time yet. */
  enableDuration?: boolean;
  initialReminders: string[];
  initialRepeat: string;
  initialRepeatDays?: number[];
  onClose: () => void;
  onApply: (payload: {
    date: string | null;
    time: string | null;
    endTime?: string | null;
    reminders: string[];
    repeat: string;
    repeatDays?: number[];
  }) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"date" | "duration">("date");
  const [cursor, setCursor] = useState<Date>(initialDate ? new Date(initialDate) : new Date());
  const [selected, setSelected] = useState<Date | null>(initialDate ? new Date(initialDate) : null);
  const [time, setTime] = useState<string | null>(initialTime ?? "09:00");
  const [reminders, setReminders] = useState<string[]>(initialReminders);
  const [repeat, setRepeat] = useState<string>(initialRepeat);
  const [repeatDays, setRepeatDays] = useState<number[]>(initialRepeatDays ?? []);
  const [pickerMode, setPickerMode] = useState<"reminder" | "repeat" | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [endTime, setEndTime] = useState<string | null>(initialEndTime ?? null);
  const [endTimeOpen, setEndTimeOpen] = useState(false);

  // Seed the form only when the sheet opens. Re-seeding on prop changes wiped the
  // user's in-progress choices whenever the parent re-rendered (e.g. a background
  // refresh handing down a fresh `[]` for reminders).
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    const justOpened = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (justOpened) {
      const parsedDate = initialDate ? new Date(initialDate) : null;
      setSelected(parsedDate);
      setCursor(parsedDate || new Date());
      setTime(initialTime ?? getSmartDefaultTime(initialDate));
      setEndTime(initialEndTime ?? null);
      setTab("date");
      setReminders(initialReminders);
      setRepeat(initialRepeat);
      const defaultWeekday = parsedDate ? parsedDate.getDay() : new Date().getDay();
      setRepeatDays(
        initialRepeatDays && initialRepeatDays.length > 0
          ? initialRepeatDays
          : [defaultWeekday]
      );
    }
  }, [visible, initialDate, initialTime, initialReminders, initialRepeat, initialRepeatDays]);

  const today = new Date();

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 25 && Math.abs(gestureState.dy) < 30,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -40) {
            setCursor((c) => addMonths(c, 1));
          } else if (gestureState.dx > 40) {
            setCursor((c) => addMonths(c, -1));
          }
        },
      }),
    []
  );

  const cells = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const pickDate = (date: Date, timeStr: string | null = null) => {
    const formatted = format(date, "yyyy-MM-dd");
    setSelected(date);
    setCursor(date);
    setTime(timeStr ?? time ?? getSmartDefaultTime(formatted));
    if ((repeat === "weekly" || repeat === "fortnightly") && repeatDays.length === 0) {
      setRepeatDays([date.getDay()]);
    }
  };
  const apply = () => {
    const formattedDate = selected ? format(selected, "yyyy-MM-dd") : null;
    const finalTime = formattedDate ? (time ?? getSmartDefaultTime(formattedDate)) : null;
    // An end that no longer follows the start (start moved later) is dropped rather than saved.
    const finalEnd =
      enableDuration && formattedDate && finalTime && endTime && timeToMinutes(endTime) > timeToMinutes(finalTime)
        ? endTime
        : null;
    onApply({
      date: formattedDate,
      time: finalTime,
      endTime: finalEnd,
      reminders,
      repeat,
      repeatDays: (repeat === "weekly" || repeat === "fortnightly") ? repeatDays : undefined,
    });
  };
  const clear = () => onApply({ date: null, time: null, endTime: null, reminders: [], repeat: "none", repeatDays: [] });

  const startForDuration = time ?? getSmartDefaultTime(selected ? format(selected, "yyyy-MM-dd") : null);
  const durationMinutes = endTime ? timeToMinutes(endTime) - timeToMinutes(startForDuration) : 0;
  const endIsValid = Boolean(endTime) && durationMinutes > 0;
  const setEndFromPreset = (minutes: number) => {
    const end = timeToMinutes(startForDuration) + minutes;
    if (end >= 24 * 60) {
      Alert.alert("Too late", "The task must end before midnight.");
      return;
    }
    setEndTime(minutesToTime(end));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdropDark}>
        {/* Backdrop is a sibling, not a parent: a Pressable ancestor competes with the ScrollView for touches and breaks scrolling from the clock. */}
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.dateSheet, { paddingBottom: insets.bottom + 12 }]} testID="date-picker-sheet">
          <View style={styles.dateHeader}>
            <Pressable onPress={clear} testID="date-clear" style={styles.iconButton}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
            <View style={styles.dateTabs}>
              <Pressable onPress={() => setTab("date")} testID="tab-date"><Text style={[styles.dateTab, tab === "date" && styles.dateTabActive]}>Date</Text>{tab === "date" ? <View style={styles.dateTabUnderline} /> : null}</Pressable>
              {enableDuration ? (
                <Pressable onPress={() => setTab("duration")} testID="tab-duration" style={{ marginLeft: 22 }}><Text style={[styles.dateTab, tab === "duration" && styles.dateTabActive]}>Duration</Text>{tab === "duration" ? <View style={styles.dateTabUnderline} /> : null}</Pressable>
              ) : null}
            </View>
            <Pressable onPress={apply} testID="date-save" style={styles.iconButton}><Ionicons name="checkmark" size={22} color={colors.onSurface} /></Pressable>
          </View>

          {tab === "date" ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ paddingBottom: 24 }}
              bounces
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.monthNav}>
                <Text style={styles.monthLabel}>{format(cursor, "MMMM yyyy")}</Text>
                <View style={{ flexDirection: "row" }}>
                  <Pressable onPress={() => setCursor(addMonths(cursor, -1))} style={styles.iconButton} testID="prev-month"><Ionicons name="chevron-back" size={18} color={colors.muted} /></Pressable>
                  <Pressable onPress={() => setCursor(addMonths(cursor, 1))} style={styles.iconButton} testID="next-month"><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>
                </View>
              </View>

              <View style={styles.weekRow}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <Text key={d} style={styles.weekLabel}>{d}</Text>)}
              </View>
              <View {...panResponder.panHandlers} style={styles.monthGrid}>
                {cells.map((date) => {
                  const isSel = selected && isSameDay(date, selected);
                  const isTodayCell = isSameDay(date, today);
                  const inMonth = date.getMonth() === cursor.getMonth();

                  return (
                    <Pressable key={date.toISOString()} testID={`d-${format(date, "yyyy-MM-dd")}`} onPress={() => pickDate(date, time)} style={styles.monthCell}>
                      <View style={styles.monthDay}>
                        {isSel ? (
                          <View style={[styles.dayCircleBg, { backgroundColor: colors.brandPrimary }]} />
                        ) : isTodayCell ? (
                          <View style={[styles.dayCircleBg, { borderWidth: 1.5, borderColor: colors.brandPrimary }]} />
                        ) : null}
                        <Text
                          style={[
                            styles.monthDayText,
                            !inMonth && !isSel ? styles.monthDayMuted : null,
                            isTodayCell && !isSel ? styles.monthDayTextToday : null,
                            isSel ? { color: "#FFFFFF", fontWeight: "700" } : null,
                          ]}
                        >
                          {format(date, "d")}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.optionsCard}>
                <OptionRow testID="opt-time" icon="time-outline" label="Time" value={formatTimeDisplay(time)} onPress={() => setTimeOpen(true)} styles={styles} colors={colors} />
                <OptionRow testID="opt-reminder" icon="alarm-outline" label="Reminder" value={reminders.length ? `${reminders.length} set` : "None"} onPress={() => setPickerMode(pickerMode === "reminder" ? null : "reminder")} styles={styles} colors={colors} />
                {pickerMode === "reminder" ? (
                  <View style={styles.chipWrap}>
                    {REMINDER_LABELS.map(({ key, label }) => (
                      <Pressable key={key} testID={`r-${key}`} onPress={() => setReminders((cur) => cur.includes(key) ? cur.filter((i) => i !== key) : [...cur, key])} style={[styles.chipSm, reminders.includes(key) && styles.chipSmActive]}>
                        <Text style={[styles.chipSmText, reminders.includes(key) && styles.chipSmTextActive]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <OptionRow
                  testID="opt-repeat"
                  icon="repeat-outline"
                  label="Repeat"
                  value={
                    repeat === "weekly" && repeatDays.length > 0 && repeatDays.length < 7
                      ? `Weekly (${[...repeatDays].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(", ")})`
                      : repeat === "fortnightly" && repeatDays.length > 0 && repeatDays.length < 7
                      ? `Fortnightly (${[...repeatDays].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(", ")})`
                      : REPEAT_LABELS.find((item) => item.key === repeat)?.label ?? "Never"
                  }
                  onPress={() => setPickerMode(pickerMode === "repeat" ? null : "repeat")}
                  styles={styles}
                  colors={colors}
                  last
                />
                {pickerMode === "repeat" ? (
                  <View style={styles.repeatContainer}>
                    <View style={styles.chipWrap}>
                      {REPEAT_LABELS.map(({ key, label }) => (
                        <Pressable
                          key={key}
                          testID={`rep-${key}`}
                          onPress={() => {
                            setRepeat(key);
                            if ((key === "weekly" || key === "fortnightly") && repeatDays.length === 0) {
                              const d = selected ? selected.getDay() : new Date().getDay();
                              setRepeatDays([d]);
                            }
                          }}
                          style={[styles.chipSm, repeat === key && styles.chipSmActive]}
                        >
                          <Text style={[styles.chipSmText, repeat === key && styles.chipSmTextActive]}>{label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {repeat === "weekly" || repeat === "fortnightly" ? (
                      <View style={styles.weeklyDaysSection}>
                        <Text style={styles.weeklyDaysTitle}>Repeat on</Text>
                        <View style={styles.weekdayRow}>
                          {WEEKDAY_LABELS.map((dayLabel, index) => {
                            const isDaySelected = repeatDays.includes(index);
                            return (
                              <Pressable
                                key={dayLabel}
                                testID={`rep-day-${index}`}
                                onPress={() => {
                                  setRepeatDays((current) => {
                                    if (current.includes(index)) {
                                      if (current.length === 1) return current;
                                      return current.filter((d) => d !== index);
                                    }
                                    return [...current, index].sort((a, b) => a - b);
                                  });
                                }}
                                style={[styles.weekdayChip, isDaySelected && styles.weekdayChipActive]}
                              >
                                <Text style={[styles.weekdayChipText, isDaySelected && styles.weekdayChipTextActive]}>
                                  {dayLabel}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </ScrollView>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
              {!selected ? (
                <Text style={styles.durationCopy}>Pick a date on the Date tab first.</Text>
              ) : (
                <View style={styles.optionsCard}>
                  <OptionRow testID="dur-start" icon="play-outline" label="Starts" value={formatTimeDisplay(startForDuration)} onPress={() => setTimeOpen(true)} styles={styles} colors={colors} />
                  <OptionRow testID="dur-end" icon="stop-outline" label="Ends" value={endTime ? formatTimeDisplay(endTime) : "Not set"} onPress={() => setEndTimeOpen(true)} styles={styles} colors={colors} last />
                  <View style={styles.chipWrap}>
                    {DURATION_PRESETS.map((minutes) => {
                      const active = endIsValid && durationMinutes === minutes;
                      return (
                        <Pressable key={minutes} testID={`dur-${minutes}`} onPress={() => setEndFromPreset(minutes)} style={[styles.chipSm, active && styles.chipSmActive]}>
                          <Text style={[styles.chipSmText, active && styles.chipSmTextActive]}>{formatDurationLabel(minutes)}</Text>
                        </Pressable>
                      );
                    })}
                    {endTime ? (
                      <Pressable testID="dur-clear" onPress={() => setEndTime(null)} style={styles.chipSm}>
                        <Text style={styles.chipSmText}>Clear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {endTime && !endIsValid ? (
                    <Text style={[styles.durationCopy, { color: colors.error, marginBottom: 12, alignSelf: "center" }]}>End time must be after the start time.</Text>
                  ) : endIsValid ? (
                    <Text style={[styles.durationCopy, { marginBottom: 12, alignSelf: "center" }]}>Duration: {formatDurationLabel(durationMinutes)}</Text>
                  ) : null}
                </View>
              )}
            </ScrollView>
          )}
        </View>
        <TimePickerModal
          visible={timeOpen}
          currentTime={time}
          onCancel={() => setTimeOpen(false)}
          onConfirm={(t) => { setTime(t); setTimeOpen(false); }}
          styles={styles}
          colors={colors}
        />
        <TimePickerModal
          visible={endTimeOpen}
          currentTime={endTime ?? minutesToTime(Math.min(timeToMinutes(startForDuration) + 60, 23 * 60 + 59))}
          onCancel={() => setEndTimeOpen(false)}
          onConfirm={(t) => { setEndTime(t); setEndTimeOpen(false); }}
          styles={styles}
          colors={colors}
        />
      </View>
    </Modal>
  );
}

function OptionRow({ icon, label, value, onPress, testID, last, styles, colors }: { icon: string; label: string; value: string; onPress: () => void; testID: string; last?: boolean; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.optionRow, last && { borderBottomWidth: 0 }]}>
      <Ionicons name={icon} size={20} color={colors.muted} />
      <Text style={styles.optionLabel}>{label}</Text>
      <Text style={styles.optionValue}>{value}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

// -------------------------------------------------------------------- Priority popup

export function PriorityPopup({ visible, current, onSelect, onClose }: { visible: boolean; current: string; onSelect: (value: "high" | "medium" | "low" | "none") => void; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.popupBackdrop}>
        <Pressable onPress={() => { /* trap */ }} style={styles.popupCard} testID="priority-popup">
          {PRIORITY_OPTIONS.map((option) => {
            const key = option.key;
            const iconColor = key === "high" ? colors.error : key === "medium" ? colors.warning : key === "low" ? colors.info : colors.muted;
            const isSelected = current === key;
            return (
              <Pressable
                key={key}
                testID={`priority-${key}`}
                onPress={() => {
                  onSelect(key);
                  onClose();
                }}
                style={({ pressed }) => [styles.popupRow, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name={key === "none" ? "flag-outline" : "flag"} size={20} color={iconColor} />
                <Text style={[styles.popupLabel, isSelected && { color: colors.brandPrimary, fontWeight: "600" }]}>{option.label}</Text>
                {isSelected ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// -------------------------------------------------------------------- List popup

function ListPopup({ visible, lists, currentId, onSelect, onCreate, onClose }: { visible: boolean; lists: TaskList[]; currentId: string | null; onSelect: (id: string) => void; onCreate: (name: string) => Promise<void>; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { deleteList } = useApp();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingList, setDeletingList] = useState(false);

  const submit = async () => {
    if (!newName.trim()) return;
    await onCreate(newName.trim());
    setNewName("");
    setCreating(false);
    onClose();
  };

  const handleDeleteList = (listId: string, listName: string) => {
    setDeleteTarget({ id: listId, name: listName });
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
        <Pressable onPress={onClose} style={styles.popupBackdrop}>
          <Pressable onPress={() => { /* trap */ }} style={styles.popupCard} testID="list-popup">
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {lists.map((list) => (
                <Pressable
                  key={list.id}
                  testID={`list-${list.id}`}
                  onPress={() => {
                    onSelect(list.id);
                    onClose();
                  }}
                  style={({ pressed }) => [styles.popupRow, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.popupEmoji}>{list.emoji}</Text>
                  <Text style={[styles.popupLabel, currentId === list.id && { color: colors.brandPrimary, fontWeight: "600" }]}>{list.name}</Text>
                  {!list.system ? (
                    <Pressable
                      testID={`delete-list-popup-${list.id}`}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleDeleteList(list.id, list.name);
                      }}
                      style={{ padding: 4, marginRight: 4 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </Pressable>
                  ) : null}
                  {currentId === list.id ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.popupDivider} />
            {creating ? (
              <View style={styles.newListRow}>
                <TextInput autoFocus value={newName} onChangeText={setNewName} onSubmitEditing={submit} placeholder="New list name" placeholderTextColor={colors.muted} style={styles.newListInput} />
                <Pressable testID="list-create-confirm" onPress={submit} style={styles.newListConfirm}><Ionicons name="checkmark" size={18} color={colors.onBrandPrimary} /></Pressable>
              </View>
            ) : (
              <Pressable testID="list-create" onPress={() => setCreating(true)} style={styles.popupRow}>
                <Ionicons name="add-circle-outline" size={20} color={colors.brandPrimary} />
                <Text style={[styles.popupLabel, { color: colors.brandPrimary, fontWeight: "600" }]}>New list</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
            if (currentId === deleteTarget.id) {
              const inbox = lists.find((l) => l.system);
              if (inbox) onSelect(inbox.id);
            }
            await deleteList(deleteTarget.id);
          } finally {
            setDeletingList(false);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}

// -------------------------------------------------------------------- Assignee Modal (Centered dialog matching Postpone modal)

export function AssigneeModal({
  visible,
  assignableUsers,
  selectedIds,
  onSelect,
  onClose,
  title = "Assign Task",
  single = false,
  informerIds = [],
  escalatorIds = [],
  onSelectInformers,
  onSelectEscalators,
}: {
  visible: boolean;
  assignableUsers: AssignableUser[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onClose: () => void;
  /** Header text of the dialog. */
  title?: string;
  /** Pick at most one person (used for "Assigned by"). */
  single?: boolean;
  /** Passing both role callbacks turns on the Assign / Informer / Escalator tabs. */
  informerIds?: string[];
  escalatorIds?: string[];
  onSelectInformers?: (ids: string[]) => void;
  onSelectEscalators?: (ids: string[]) => void;
}) {
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

  const maxDialogHeight = Math.max(
    220,
    Math.min(
      Math.round(windowHeight * 0.8),
      Math.round(windowHeight - insets.top - keyboardHeight - 24)
    )
  );
  const { token, user } = useApp();

  // On Android the dialog window is often already shrunk by the keyboard (adjustResize);
  // only offset by the keyboard when the backdrop still spans the full window.
  const [backdropHeight, setBackdropHeight] = useState(0);
  const backdropResized = backdropHeight > 0 && backdropHeight < windowHeight - 80;
  const keyboardOverlap = keyboardHeight > 0 && !backdropResized ? keyboardHeight : 0;

  const [searchQuery, setSearchQuery] = useState("");
  const [usersList, setUsersList] = useState<AssignableUser[]>(assignableUsers);
  const [loading, setLoading] = useState(false);
  const rolesEnabled = Boolean(onSelectInformers && onSelectEscalators);
  type RoleTab = "assignee" | "informer" | "escalator";
  const [tab, setTab] = useState<RoleTab>("assignee");
  const [selections, setSelections] = useState<Record<RoleTab, string[]>>({
    assignee: selectedIds,
    informer: informerIds,
    escalator: escalatorIds,
  });
  const localSelectedIds = selections[tab];
  const emit = (role: RoleTab, ids: string[]) => {
    if (role === "informer") onSelectInformers?.(ids);
    else if (role === "escalator") onSelectEscalators?.(ids);
    else onSelect(ids);
  };
  const prevVisibleRef = useRef(false);

  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    // Only run on open transition so background sync intervals/prop updates never clear the user's search query
    if (visible && !wasVisible) {
      setSearchQuery("");
      setTab("assignee");
      setSelections({ assignee: selectedIds, informer: informerIds, escalator: escalatorIds });
      if (usersList.length === 0 && assignableUsers.length > 0) {
        setUsersList(assignableUsers);
      }
      // Wait for the open animation to finish before fetching/re-rendering the list.
      const task = InteractionManager.runAfterInteractions(() => {
        setLoading(true);
        api<AssignableUser[]>("/users/assignable", {}, token ?? undefined)
          .then((res) => {
            if (Array.isArray(res)) {
              const seen = new Set<string>();
              const unique = res.filter((u) => {
                if (!u.id || seen.has(u.id)) return false;
                seen.add(u.id);
                return true;
              });
              setUsersList(unique);
            }
          })
          .catch(() => {})
          .finally(() => setLoading(false));
      });
      return () => task.cancel();
    }
  }, [visible]);

  const toggleAssignee = (id: string) => {
    const prev = selections[tab];
    const next = single
      ? prev.includes(id) ? [] : [id]
      : prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
    setSelections((cur) => ({ ...cur, [tab]: next }));
    emit(tab, next);
  };

  const isMeSelected = Boolean(user?.id && localSelectedIds.includes(user.id));
  const toggleMe = () => {
    if (!user?.id) return;
    toggleAssignee(user.id);
  };

  // People already picked for the active tab float to the top. The order is
  // captured when the modal opens or the tab changes, so rows don't jump
  // around while you are ticking people on and off.
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  useEffect(() => {
    if (!visible) return;
    setPinnedIds(tab === "informer" ? informerIds : tab === "escalator" ? escalatorIds : selectedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tab]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // Exclude current user from the main list when no query is typed
    // because "Assign to me" is already pinned at the top
    const baseList = user?.id && !q && !single && tab === "assignee"
      ? usersList.filter((u) => u.id !== user.id)
      : usersList;

    const matched = !q ? baseList : baseList.filter((u) => {
      const first = (u.firstName ?? "").toLowerCase();
      const last = (u.lastName ?? "").toLowerCase();
      const full = `${first} ${last}`.trim();
      const email = (u.email ?? "").toLowerCase();
      const roleName = (typeof u.role === "string" ? u.role : u.role?.name ?? "").toLowerCase();
      return full.includes(q) || email.includes(q) || roleName.includes(q);
    });
    if (pinnedIds.length === 0) return matched;
    const pinned = new Set(pinnedIds);
    return [...matched.filter((u) => pinned.has(u.id)), ...matched.filter((u) => !pinned.has(u.id))];
  }, [usersList, searchQuery, user?.id, single, tab, pinnedIds]);

  const handleApply = () => {
    emit(tab, localSelectedIds);
    onClose();
  };

  const handleClear = () => {
    setSelections((cur) => ({ ...cur, [tab]: [] }));
    emit(tab, []);
  };

  const myDisplayName = useMemo(() => {
    if (!user) return "Assign to me";
    const full = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
    return full || user.name || user.email || "Assign to me";
  }, [user]);

  const myInitials = useMemo(() => {
    if (!user) return "ME";
    const f = user.firstName?.[0] || user.name?.[0] || "M";
    const l = user.lastName?.[0] || "E";
    return (f + l).toUpperCase();
  }, [user]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={styles.assigneeBackdrop}
        onLayout={(e) => setBackdropHeight(e.nativeEvent.layout.height)}
      >
        <Pressable
          onPress={() => { /* trap */ }}
          style={[
            styles.assigneeDialogCard,
            {
              // Fit inside whatever space is really left above the keyboard.
              maxHeight: backdropHeight > 0
                ? Math.min(maxDialogHeight, Math.max(220, backdropHeight - keyboardOverlap - insets.top - 32))
                : maxDialogHeight,
              marginBottom: keyboardOverlap > 0 ? keyboardOverlap : Math.max(insets.bottom, 16),
            },
          ]}
          testID="assignee-dialog"
        >
          {/* Header */}
          <View style={styles.assigneeHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.assigneeHeaderTitle}>{title}</Text>
              {localSelectedIds.length > 0 && !single ? (
                <View style={styles.assigneeCountBadge}>
                  <Text style={styles.assigneeCountBadgeText}>{localSelectedIds.length} selected</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={styles.assigneeCloseBtn}
              testID="close-assignee"
            >
              <Ionicons name="close" size={20} color={colors.onSurface} />
            </Pressable>
          </View>

          {rolesEnabled ? (
            <View style={{ flexDirection: "row", marginBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              {([
                ["assignee", "Assign"],
                ["informer", "Informer"],
                ["escalator", "Escalator"],
              ] as [RoleTab, string][]).map(([key, label]) => {
                const active = tab === key;
                const count = selections[key].length;
                return (
                  <Pressable
                    key={key}
                    testID={`assignee-tab-${key}`}
                    onPress={() => { setTab(key); setSearchQuery(""); }}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: active ? colors.brandPrimary : "transparent" }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: active ? "700" : "500", color: active ? colors.brandPrimary : colors.muted }}>
                      {label}{count > 0 ? ` (${count})` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Search Box */}
          <View style={styles.assigneeSearchContainer}>
            <View style={styles.assigneeSearchBox}>
              <Ionicons name="search-outline" size={18} color={colors.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by name, email, or role..."
                placeholderTextColor={colors.muted}
                style={styles.assigneeSearchInput}
                autoCorrect={false}
                autoCapitalize="none"
                testID="assignee-search-input"
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8} testID="clear-assignee-search">
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* User List */}
          <FlatList
            data={filteredUsers}
            keyExtractor={(u) => u.id}
            extraData={localSelectedIds}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
            contentContainerStyle={styles.assigneeListContent}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <>
            {/* Top item: Instead of Unassigned -> Assign to me */}
            {!searchQuery && user && !single && tab === "assignee" ? (
              <Pressable
                testID="assign-to-me"
                onPress={toggleMe}
                style={({ pressed }) => [
                  styles.assignMeCard,
                  isMeSelected && styles.assignMeCardSelected,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={styles.assignMeAvatar}>
                  <Text style={styles.assignMeAvatarText}>{myInitials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.assigneeName, isMeSelected && { color: colors.brandPrimary, fontWeight: "700" }]}>
                    Assign to me
                  </Text>
                  <Text style={styles.assigneeSubtext} numberOfLines={1}>
                    {myDisplayName} {user.email && user.email !== myDisplayName ? `(${user.email})` : ""}
                  </Text>
                </View>
                <Ionicons
                  name={isMeSelected ? "checkbox" : "square-outline"}
                  size={22}
                  color={isMeSelected ? colors.brandPrimary : colors.muted}
                />
              </Pressable>
            ) : null}

            {loading && usersList.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <ActivityIndicator size="small" color={colors.brandPrimary} />
              </View>
            ) : null}
              </>
            }
            renderItem={({ item: u }) => {
              const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
              const roleName = typeof u.role === "string" ? u.role : u.role?.name;
              const isSelected = localSelectedIds.includes(u.id);
              const initials = (u.firstName?.[0] || "") + (u.lastName?.[0] || name[0] || "U").toUpperCase();

              return (
                <Pressable
                  testID={`assignee-${u.id}`}
                  onPress={() => toggleAssignee(u.id)}
                  style={({ pressed }) => [
                    styles.assigneeRow,
                    isSelected && styles.assigneeRowSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.assigneeAvatar, isSelected && { backgroundColor: colors.brandPrimary }]}>
                    <Text style={[styles.assigneeAvatarText, isSelected && { color: "#FFFFFF" }]}>
                      {initials.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.assigneeName, isSelected && { color: colors.brandPrimary, fontWeight: "700" }]}>
                      {name}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                      {u.email ? <Text numberOfLines={1} style={[styles.assigneeSubtext, { flexShrink: 1 }]}>{u.email}</Text> : null}
                      {roleName ? (
                        <View style={styles.roleBadge}>
                          <Text style={styles.roleBadgeText}>{roleName}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons
                    name={single ? (isSelected ? "radio-button-on" : "radio-button-off") : isSelected ? "checkbox" : "square-outline"}
                    size={22}
                    color={isSelected ? colors.brandPrimary : colors.muted}
                  />
                </Pressable>
              );
            }}
            ListEmptyComponent={
              loading ? null : (
                <View style={styles.assigneeEmptyContainer}>
                  <Ionicons name="search" size={28} color={colors.muted} />
                  <Text style={styles.assigneeEmptyTitle}>No assignees found</Text>
                  <Text style={styles.assigneeEmptySub}>Try searching with a different name, email, or role.</Text>
                </View>
              )
            }
          />

          {/* Footer with Clear and Done */}
          <View style={styles.assigneeFooter}>
            {localSelectedIds.length > 0 ? (
              <Pressable onPress={handleClear} hitSlop={8} style={styles.clearAssigneesBtn} testID="clear-assignees">
                <Text style={styles.clearAssigneesText}>Clear all</Text>
              </Pressable>
            ) : <View />}

            <Pressable onPress={handleApply} style={styles.doneAssigneeBtn} testID="done-assignee">
              <Text style={styles.doneAssigneeBtnText}>
                {localSelectedIds.length > 0 && !single ? `Done (${localSelectedIds.length})` : "Done"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// -------------------------------------------------------------------- More popup

function MorePopup({
  visible,
  reminders,
  repeat,
  repeatDays = [],
  onRemindersChange,
  onRepeatChange,
  onRepeatDaysChange,
  onClose,
}: {
  visible: boolean;
  reminders: string[];
  repeat: string;
  repeatDays?: number[];
  onRemindersChange: (next: string[]) => void;
  onRepeatChange: (next: string) => void;
  onRepeatDaysChange?: (next: number[]) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.popupBackdrop}>
        <Pressable onPress={() => { /* trap */ }} style={[styles.popupCard, { minWidth: 260 }]} testID="more-popup">
          <Text style={styles.popupSection}>Reminder</Text>
          <View style={[styles.chipWrap, { paddingHorizontal: 12, paddingBottom: 6 }]}>
            {REMINDER_LABELS.map(({ key, label }) => (
              <Pressable key={key} testID={`more-r-${key}`} onPress={() => onRemindersChange(reminders.includes(key) ? reminders.filter((i) => i !== key) : [...reminders, key])} style={[styles.chipSm, reminders.includes(key) && styles.chipSmActive]}>
                <Text style={[styles.chipSmText, reminders.includes(key) && styles.chipSmTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.popupDivider} />
          <Text style={styles.popupSection}>Repeat</Text>
          <View style={[styles.chipWrap, { paddingHorizontal: 12, paddingBottom: 6 }]}>
            {REPEAT_LABELS.map(({ key, label }) => (
              <Pressable
                key={key}
                testID={`more-rep-${key}`}
                onPress={() => onRepeatChange(key)}
                style={[styles.chipSm, repeat === key && styles.chipSmActive]}
              >
                <Text style={[styles.chipSmText, repeat === key && styles.chipSmTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {repeat === "weekly" || repeat === "fortnightly" ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
              <Text style={styles.weeklyDaysTitle}>Repeat on days</Text>
              <View style={styles.weekdayRow}>
                {WEEKDAY_LABELS.map((dayLabel, index) => {
                  const isDaySelected = repeatDays.includes(index);
                  return (
                    <Pressable
                      key={dayLabel}
                      testID={`more-rep-day-${index}`}
                      onPress={() => {
                        if (!onRepeatDaysChange) return;
                        if (repeatDays.includes(index)) {
                          if (repeatDays.length === 1) return;
                          onRepeatDaysChange(repeatDays.filter((d) => d !== index));
                        } else {
                          onRepeatDaysChange([...repeatDays, index].sort((a, b) => a - b));
                        }
                      }}
                      style={[styles.weekdayChip, isDaySelected && styles.weekdayChipActive]}
                    >
                      <Text style={[styles.weekdayChipText, isDaySelected && styles.weekdayChipTextActive]}>
                        {dayLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <Pressable testID="more-done" onPress={onClose} style={[styles.popupRow, { borderTopWidth: 1, borderTopColor: colors.divider }]}>
            <Ionicons name="checkmark" size={20} color={colors.brandPrimary} />
            <Text style={[styles.popupLabel, { color: colors.brandPrimary, fontWeight: "600" }]}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(20,22,30,0.35)", justifyContent: "flex-end" },
  avoider: { width: "100%", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 16 },
  titleInput: { color: colors.onSurface, fontSize: 18, fontWeight: "600", paddingVertical: 4 },
  descriptionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, paddingVertical: 6 },
  descInput: { color: colors.onSurface, fontSize: 14, flex: 1, minWidth: 160, maxHeight: 120 },
  inlineTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.brandTertiary },
  inlineTagEmoji: { fontSize: 12 },
  inlineTagText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600" },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, paddingBottom: 8, marginTop: 6 },
  toolbarScrollContent: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 6 },
  tbButton: { minHeight: 40, paddingHorizontal: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  tbButtonHighlight: { backgroundColor: colors.brandTertiary },
  tbBadge: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  tbBadgeText: { fontSize: 10, fontWeight: "700", lineHeight: 12 },
  tbLabel: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "500", maxWidth: 130 },
  tbLabelHighlight: { color: colors.brandPrimary },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  sendButtonDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },

  backdropDark: { flex: 1, backgroundColor: "rgba(20,22,30,0.55)", justifyContent: "flex-end" },
  dateSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, maxHeight: "92%" },
  dateHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  dateTabs: { flexDirection: "row", alignItems: "center" },
  dateTab: { color: colors.muted, fontSize: 15, fontWeight: "500", textAlign: "center" },
  dateTabActive: { color: colors.brandPrimary, fontWeight: "700" },
  dateTabUnderline: { height: 2, marginTop: 4, backgroundColor: colors.brandPrimary, borderRadius: 1 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginTop: 8 },
  monthLabel: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
  weekRow: { flexDirection: "row", paddingHorizontal: 4, marginTop: 8 },
  weekLabel: { flex: 1, textAlign: "center", color: colors.muted, fontSize: 11, fontWeight: "500" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap" },
  monthCell: { width: `${100 / 7}%`, alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  monthDay: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  dayCircleBg: { position: "absolute", width: 38, height: 38, borderRadius: 19 },
  monthDaySelected: { backgroundColor: colors.brandPrimary },
  monthDayToday: { borderWidth: 1.5, borderColor: colors.brandPrimary },
  monthDayText: { color: colors.onSurface, fontSize: 15, textAlign: "center", textAlignVertical: "center", includeFontPadding: false },
  monthDayMuted: { color: colors.muted, opacity: 0.4 },
  monthDayTextSelected: { color: "#FFFFFF", fontWeight: "700", textAlign: "center", textAlignVertical: "center", includeFontPadding: false },
  monthDayTextToday: { color: colors.brandPrimary, fontWeight: "600", textAlign: "center", textAlignVertical: "center", includeFontPadding: false },
  optionsCard: { marginTop: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, marginBottom: 20 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  optionLabel: { color: colors.onSurface, fontSize: 14, flex: 1 },
  optionValue: { color: colors.muted, fontSize: 13 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingBottom: 12, marginTop: 8 },
  presetsGrid: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  presetsRow: { flexDirection: "row", gap: 6 },
  chipSm: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.surfaceSecondary, justifyContent: "center" },
  chipSmFlex: { flex: 1, alignItems: "center" },
  chipSmActive: { backgroundColor: colors.brandPrimary },
  chipSmText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "500" },
  chipSmTextActive: { color: colors.onBrandPrimary },
  repeatContainer: { paddingBottom: 4 },
  weeklyDaysSection: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10 },
  weeklyDaysTitle: { color: colors.muted, fontSize: 12, fontWeight: "600", marginBottom: 8 },
  weekdayRow: { flexDirection: "row", gap: 6, justifyContent: "space-between" },
  weekdayChip: { flex: 1, height: 36, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.divider },
  weekdayChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  weekdayChipText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "600" },
  weekdayChipTextActive: { color: colors.onBrandPrimary, fontWeight: "700" },
  timeSectionContainer: { paddingBottom: 6 },
  timeModalBackdrop: { flex: 1, backgroundColor: "rgba(20,22,30,0.55)", alignItems: "center", justifyContent: "center", padding: 16 },
  timeModalCard: { width: "100%", maxWidth: 300, maxHeight: "94%", backgroundColor: colors.surface, borderRadius: 20, padding: 12 },
  timeModalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 4 },
  timeModalBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  timeModalBtnText: { fontSize: 15, fontWeight: "700" },
  customTimePanel: { marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: colors.surfaceSecondary, marginHorizontal: 14, marginBottom: 10 },
  clearTimeButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, paddingVertical: 6 },
  clearTimeText: { color: colors.muted, fontSize: 13, fontWeight: "500" },
  customTimeTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "600", marginBottom: 6 },
  pickerSubLabel: { color: colors.muted, fontSize: 11, fontWeight: "500", marginTop: 6, marginBottom: 4 },
  scrollSelectorRow: { flexDirection: "row", gap: 6, paddingVertical: 2 },
  numChip: { minWidth: 38, height: 34, borderRadius: 10, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderWidth: 1, borderColor: colors.divider },
  numChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  numChipText: { color: colors.onSurface, fontSize: 13, fontWeight: "600" },
  numChipTextActive: { color: "#FFFFFF" },
  amPmRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  amPmBtn: { flex: 1, height: 34, borderRadius: 10, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.divider },
  amPmBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  amPmText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  amPmTextActive: { color: "#FFFFFF" },
  durationBody: { alignItems: "center", paddingVertical: 40, gap: 10 },
  durationTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "600" },
  durationCopy: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 12 },

  popupBackdrop: { flex: 1, backgroundColor: "transparent", justifyContent: "flex-end", paddingHorizontal: 16, paddingBottom: 96 },
  popupCard: { alignSelf: "flex-end", minWidth: 200, backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 6, shadowColor: colors.surfaceInverse, shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  popupRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  popupEmoji: { fontSize: 18 },
  popupLabel: { color: colors.onSurface, fontSize: 14, flex: 1 },
  popupSection: { color: colors.muted, fontSize: 11, fontWeight: "600", letterSpacing: 0.6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  popupDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 4 },
  newListRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  newListInput: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: 10, paddingHorizontal: 12, height: 38, color: colors.onSurface, fontSize: 14 },
  newListConfirm: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },

  // Assignee modal (matches Postpone Activity modal dialog)
  assigneeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  assigneeDialogCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  assigneeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  assigneeHeaderTitle: {
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: "700",
  },
  assigneeCloseBtn: {
    padding: 4,
    borderRadius: 8,
  },
  assigneeSearchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  assigneeSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 12,
    gap: 8,
  },
  assigneeSearchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
    paddingVertical: 0,
  },
  assigneeListContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 2,
  },
  assigneeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  assigneeRowSelected: {
    backgroundColor: colors.surfaceSecondary,
  },
  assigneeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  assigneeAvatarUnassigned: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  assigneeAvatarText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "700",
  },
  assigneeName: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "600",
  },
  assigneeSubtext: {
    color: colors.muted,
    fontSize: 12,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  roleBadgeText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  assigneeEmptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 6,
  },
  assigneeEmptyTitle: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "600",
  },
  assigneeEmptySub: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
  },

  assigneeCountBadge: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  assigneeCountBadgeText: {
    color: colors.brandPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  assignMeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  assignMeCardSelected: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surfaceSecondary,
  },
  assignMeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  assignMeAvatarText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  assigneeFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  clearAssigneesBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  clearAssigneesText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  doneAssigneeBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  doneAssigneeBtnText: {
    color: colors.onBrandPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
}));
