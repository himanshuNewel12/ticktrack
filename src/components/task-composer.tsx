import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { addDays, addMonths, format, isSameDay, startOfMonth, startOfWeek } from "date-fns";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { ActivityIndicator, Alert, ColorValue, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/app-context";
import { ConfirmDeleteModal } from "./confirm-delete-modal";
import { AnalogClockPicker } from "./analog-clock-picker";
import { makeStyles, useTheme } from "@/src/theme";
import type { AssignableUser, TaskList } from "@/src/types";
import { parseTaskDate } from "@/src/utils/date-utils";

type LooseIconProps = { name: string; size: number; color?: ColorValue; style?: any };
const Ionicons = BaseIonicons as unknown as ComponentType<LooseIconProps>;

export type ComposerKind = "task" | "voice";

type Props = {
  kind: ComposerKind | null;
  onClose: () => void;
  defaultDue?: string;
  defaultListId?: string | null;
};

const PRIORITY_OPTIONS: { key: "high" | "medium" | "low" | "none"; label: string; color: keyof ReturnType<typeof useTheme>["colors"] | "muted" }[] = [
  { key: "high", label: "High Priority", color: "error" },
  { key: "medium", label: "Medium Priority", color: "warning" },
  { key: "low", label: "Low Priority", color: "info" },
  { key: "none", label: "No Priority", color: "muted" },
];

const REMINDER_LABELS: { key: string; label: string }[] = [
  { key: "15_mins_before", label: "15 minutes before" },
  { key: "on_due", label: "On due date" },
  { key: "1_hour_before", label: "1 hour before" },
  { key: "1_day_before", label: "1 day before" },
  { key: "3_days_before", label: "3 days before" },
];
const REPEAT_LABELS: { key: string; label: string }[] = [
  { key: "none", label: "Never" },
  { key: "daily", label: "Daily" },
  { key: "weekdays", label: "Weekdays" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];
const QUICK_TAGS = ["Work", "Personal", "Home", "Errand", "Idea"];

export function TaskComposer({ kind, onClose, defaultDue, defaultListId }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { addTask, lists, addList, assignableUsers } = useApp();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(defaultDue ?? null);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [priority, setPriority] = useState<"high" | "medium" | "low" | "none">("none");
  const [recurrence, setRecurrence] = useState("none");
  const [reminders, setReminders] = useState<string[]>(["15_mins_before"]);
  const [tags, setTags] = useState<string[]>([]);
  const [listId, setListId] = useState<string | null>(defaultListId ?? null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (kind) {
      setTitle(""); setNotes(""); setDueDate(defaultDue ?? null); setDueTime(null);
      setPriority("none"); setRecurrence("none"); setReminders(["15_mins_before"]); setTags([]); setAssigneeId(null);
      setListId(defaultListId ?? lists.find((item) => item.system)?.id ?? lists[0]?.id ?? null);
    }
  }, [kind, defaultDue, defaultListId, lists]);

  if (!kind) return null;

  const activeList = lists.find((item) => item.id === listId);
  const selectedAssignee = assignableUsers.find((item) => item.id === assigneeId);
  const priorityIconColor = priority === "high" ? colors.error : priority === "medium" ? colors.warning : priority === "low" ? colors.info : colors.muted;

  const save = async () => {
    if (!title.trim()) { Alert.alert("Add a task title", "Give this task a short name before saving."); return; }
    setSyncing(true);
    try {
      const effectiveTime = dueTime ?? (dueDate ? "09:00" : null);
      const dueIso = dueDate ? `${dueDate}T${effectiveTime}:00` : null;
      await addTask({
        title: title.trim(),
        notes,
        due_date: dueIso,
        priority: priority === "none" ? "medium" : priority,
        recurrence,
        reminders,
        tags,
        list_id: listId,
        assignee_id: assigneeId,
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
              autoFocus
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
                onChangeText={setNotes}
                placeholder="Description"
                placeholderTextColor={colors.muted}
                style={styles.descInput}
              />
              {tags.map((tag) => (
                <View key={tag} style={styles.inlineTag}>
                  <Ionicons name="pricetag" size={11} color={colors.brandPrimary} />
                  <Text style={styles.inlineTagText}>{tag}</Text>
                </View>
              ))}
              {activeList && !activeList.system ? (
                <View style={styles.inlineTag}>
                  <Text style={styles.inlineTagEmoji}>{activeList.emoji}</Text>
                  <Text style={styles.inlineTagText}>{activeList.name}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.toolbar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarScrollContent} style={{ flex: 1 }}>
                <ToolbarButton
                  testID="tb-date"
                  icon="calendar-outline"
                  highlight={Boolean(dueLabel)}
                  onPress={() => setDatePickerOpen(true)}
                  styles={styles}
                  colors={colors}
                  label={dueLabel ?? undefined}
                />
                <ToolbarButton
                  testID="tb-priority"
                  icon="flag"
                  iconColor={priority !== "none" ? priorityIconColor : undefined}
                  onPress={() => setPriorityOpen(true)}
                  styles={styles}
                  colors={colors}
                />
                <ToolbarButton
                  testID="tb-tag"
                  icon="pricetag-outline"
                  onPress={() => setTagsOpen(true)}
                  styles={styles}
                  colors={colors}
                />
                <ToolbarButton
                  testID="tb-assignee"
                  icon="person-outline"
                  onPress={() => setAssigneeOpen(true)}
                  styles={styles}
                  colors={colors}
                  label={selectedAssignee ? `${selectedAssignee.firstName || selectedAssignee.email}` : undefined}
                  highlight={Boolean(assigneeId)}
                />
                {/* <ToolbarButton
                  testID="tb-list"
                  icon="arrow-forward-outline"
                  onPress={() => setListOpen(true)}
                  styles={styles}
                  colors={colors}
                  label={activeList && !activeList.system ? `${activeList.emoji} ${activeList.name}` : undefined}
                  highlight={Boolean(activeList && !activeList.system)}
                /> */}
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
        initialReminders={reminders}
        initialRepeat={recurrence}
        onClose={() => setDatePickerOpen(false)}
        onApply={(payload) => {
          setDueDate(payload.date);
          setDueTime(payload.time);
          setReminders(payload.reminders);
          setRecurrence(payload.repeat);
          setDatePickerOpen(false);
        }}
      />

      <PriorityPopup visible={priorityOpen} current={priority} onSelect={(value) => setPriority(value)} onClose={() => setPriorityOpen(false)} />
      <ListPopup visible={listOpen} lists={lists} currentId={listId} onSelect={(id) => setListId(id)} onCreate={async (name) => { const created = await addList({ name, emoji: "📁" }); setListId(created.id); }} onClose={() => setListOpen(false)} />
      <AssigneePopup visible={assigneeOpen} assignableUsers={assignableUsers} currentId={assigneeId} onSelect={(id) => setAssigneeId(id)} onClose={() => setAssigneeOpen(false)} />
      <TagPopup visible={tagsOpen} selected={tags} onSelect={(tag) => setTags((current) => current.includes(tag) ? [] : [tag])} onClose={() => setTagsOpen(false)} />
      <MorePopup visible={moreOpen} reminders={reminders} repeat={recurrence} onRemindersChange={setReminders} onRepeatChange={setRecurrence} onClose={() => setMoreOpen(false)} />
    </Modal>
  );
}

function ToolbarButton({ icon, label, iconColor, highlight, onPress, testID, styles, colors }: { icon: string; label?: string; iconColor?: ColorValue; highlight?: boolean; onPress: () => void; testID: string; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.tbButton, highlight && styles.tbButtonHighlight, pressed && styles.pressed]}>
      <Ionicons name={icon} size={20} color={iconColor ?? (highlight ? colors.brandPrimary : colors.onSurfaceSecondary)} />
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

function TimePickerSection({
  currentTime,
  onSelectTime,
  styles,
  colors,
}: {
  currentTime: string | null;
  onSelectTime: (time: string | null) => void;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={styles.timeSectionContainer}>
      <View style={styles.customTimePanel}>
        <AnalogClockPicker
          value={currentTime ?? "09:00"}
          onChange={(nextTime) => onSelectTime(nextTime)}
        />
      </View>
    </View>
  );
}

function DatePickerSheet({ visible, initialDate, initialTime, initialReminders, initialRepeat, onClose, onApply }: { visible: boolean; initialDate: string | null; initialTime: string | null; initialReminders: string[]; initialRepeat: string; onClose: () => void; onApply: (payload: { date: string | null; time: string | null; reminders: string[]; repeat: string }) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"date" | "duration">("date");
  const [cursor, setCursor] = useState<Date>(initialDate ? new Date(initialDate) : new Date());
  const [selected, setSelected] = useState<Date | null>(initialDate ? new Date(initialDate) : null);
  const [time, setTime] = useState<string | null>(initialTime ?? "09:00");
  const [reminders, setReminders] = useState<string[]>(initialReminders);
  const [repeat, setRepeat] = useState<string>(initialRepeat);
  const [pickerMode, setPickerMode] = useState<"time" | "reminder" | "repeat" | null>(null);

  useEffect(() => { if (visible) {
    setSelected(initialDate ? new Date(initialDate) : null);
    setCursor(initialDate ? new Date(initialDate) : new Date());
    setTime(initialTime ?? "09:00"); setReminders(initialReminders); setRepeat(initialRepeat);
  } }, [visible, initialDate, initialTime, initialReminders, initialRepeat]);

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const nextMonday = useMemo(() => { let d = addDays(today, 1); while (d.getDay() !== 1) d = addDays(d, 1); return d; }, [today]);
  const nextWeekend = useMemo(() => { let d = addDays(today, 1); while (d.getDay() !== 6) d = addDays(d, 1); return d; }, [today]);

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
    setSelected(date); setCursor(date); setTime(timeStr ?? time ?? "09:00");
  };
  const apply = () => onApply({ date: selected ? format(selected, "yyyy-MM-dd") : null, time: selected ? (time ?? "09:00") : null, reminders, repeat });
  const clear = () => onApply({ date: null, time: null, reminders: [], repeat: "none" });

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdropDark}>
        <Pressable onPress={() => { /* trap */ }} style={[styles.dateSheet, { paddingBottom: insets.bottom + 12 }]} testID="date-picker-sheet">
          <View style={styles.dateHeader}>
            <Pressable onPress={clear} testID="date-clear" style={styles.iconButton}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
            <View style={styles.dateTabs}>
              <Pressable onPress={() => setTab("date")} testID="tab-date"><Text style={[styles.dateTab, tab === "date" && styles.dateTabActive]}>Date</Text>{tab === "date" ? <View style={styles.dateTabUnderline} /> : null}</Pressable>
              <Pressable onPress={() => setTab("duration")} testID="tab-duration" style={{ marginLeft: 22 }}><Text style={[styles.dateTab, tab === "duration" && styles.dateTabActive]}>Duration</Text></Pressable>
            </View>
            <Pressable onPress={apply} testID="date-save" style={styles.iconButton}><Ionicons name="checkmark" size={22} color={colors.onSurface} /></Pressable>
          </View>

          {tab === "date" ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.shortcutsRow}>
                <ShortcutButton testID="qd-today" icon="today-outline" label="Today" onPress={() => pickDate(today, time)} styles={styles} colors={colors} />
                <ShortcutButton testID="qd-tomorrow" icon="sunny-outline" label="Tomorrow" onPress={() => pickDate(tomorrow, time)} styles={styles} colors={colors} />
                <ShortcutButton testID="qd-next-monday" icon="calendar-outline" label="Next Mon" onPress={() => pickDate(nextMonday, time)} styles={styles} colors={colors} />
                <ShortcutButton testID="qd-weekend" icon="beer-outline" label="Weekend" onPress={() => pickDate(nextWeekend, time)} styles={styles} colors={colors} />
              </View>

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
                <OptionRow testID="opt-time" icon="time-outline" label="Time" value={formatTimeDisplay(time)} onPress={() => setPickerMode(pickerMode === "time" ? null : "time")} styles={styles} colors={colors} />
                {pickerMode === "time" ? (
                  <TimePickerSection currentTime={time} onSelectTime={(t) => setTime(t)} styles={styles} colors={colors} />
                ) : null}
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
                <OptionRow testID="opt-repeat" icon="repeat-outline" label="Repeat" value={REPEAT_LABELS.find((item) => item.key === repeat)?.label ?? "Never"} onPress={() => setPickerMode(pickerMode === "repeat" ? null : "repeat")} styles={styles} colors={colors} last />
                {pickerMode === "repeat" ? (
                  <View style={styles.chipWrap}>
                    {REPEAT_LABELS.map(({ key, label }) => (
                      <Pressable key={key} testID={`rep-${key}`} onPress={() => { setRepeat(key); setPickerMode(null); }} style={[styles.chipSm, repeat === key && styles.chipSmActive]}>
                        <Text style={[styles.chipSmText, repeat === key && styles.chipSmTextActive]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.durationBody}>
              <Ionicons name="hourglass-outline" size={40} color={colors.brandPrimary} />
              <Text style={styles.durationTitle}>Duration coming soon</Text>
              <Text style={styles.durationCopy}>Set a start & end time for time-boxing your day.</Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ShortcutButton({ icon, label, onPress, testID, styles, colors }: { icon: string; label: string; onPress: () => void; testID: string; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.7 }]}>
      <View style={styles.shortcutIcon}><Ionicons name={icon} size={24} color={colors.brandPrimary} /></View>
      <Text style={styles.shortcutLabel}>{label}</Text>
    </Pressable>
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

function PriorityPopup({ visible, current, onSelect, onClose }: { visible: boolean; current: string; onSelect: (value: "high" | "medium" | "low" | "none") => void; onClose: () => void }) {
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
        message="Are you sure you want to delete this list? Tasks in this list will remain available in All Tasks."
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

// -------------------------------------------------------------------- Assignee popup

function AssigneePopup({ visible, assignableUsers, currentId, onSelect, onClose }: { visible: boolean; assignableUsers: AssignableUser[]; currentId: string | null; onSelect: (id: string | null) => void; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.popupBackdrop}>
        <Pressable onPress={() => { /* trap */ }} style={styles.popupCard} testID="assignee-popup">
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            <Pressable
              testID="assignee-none"
              onPress={() => {
                onSelect(null);
                onClose();
              }}
              style={({ pressed }) => [styles.popupRow, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="person-outline" size={18} color={colors.muted} />
              <Text style={[styles.popupLabel, !currentId && { color: colors.brandPrimary, fontWeight: "600" }]}>Unassigned</Text>
              {!currentId ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
            </Pressable>
            {assignableUsers.map((u) => {
              const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
              const roleName = typeof u.role === "string" ? u.role : u.role?.name;
              return (
                <Pressable
                  key={u.id}
                  testID={`assignee-${u.id}`}
                  onPress={() => {
                    onSelect(u.id);
                    onClose();
                  }}
                  style={({ pressed }) => [styles.popupRow, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="person" size={18} color={currentId === u.id ? colors.brandPrimary : colors.onSurfaceSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.popupLabel, currentId === u.id && { color: colors.brandPrimary, fontWeight: "600" }]}>{name}</Text>
                    {u.email || roleName ? <Text style={{ fontSize: 11, color: colors.muted }}>{u.email} {roleName ? `· ${roleName}` : ""}</Text> : null}
                  </View>
                  {currentId === u.id ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// -------------------------------------------------------------------- Tag popup

function TagPopup({ visible, selected, onSelect, onClose }: { visible: boolean; selected: string[]; onSelect: (tag: string) => void; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.popupBackdrop}>
        <Pressable onPress={() => { /* trap */ }} style={styles.popupCard} testID="tag-popup">
          {QUICK_TAGS.map((tag) => {
            const isSelected = selected.includes(tag);
            return (
              <Pressable
                key={tag}
                testID={`tag-${tag}`}
                onPress={() => {
                  onSelect(tag);
                  onClose();
                }}
                style={({ pressed }) => [styles.popupRow, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name={isSelected ? "pricetag" : "pricetag-outline"} size={19} color={isSelected ? colors.brandPrimary : colors.muted} />
                <Text style={[styles.popupLabel, isSelected && { color: colors.brandPrimary, fontWeight: "600" }]}>{tag}</Text>
                {isSelected ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// -------------------------------------------------------------------- More popup

function MorePopup({ visible, reminders, repeat, onRemindersChange, onRepeatChange, onClose }: { visible: boolean; reminders: string[]; repeat: string; onRemindersChange: (next: string[]) => void; onRepeatChange: (next: string) => void; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.popupBackdrop}>
        <Pressable onPress={() => { /* trap */ }} style={[styles.popupCard, { minWidth: 250 }]} testID="more-popup">
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
          <View style={[styles.chipWrap, { paddingHorizontal: 12, paddingBottom: 12 }]}>
            {REPEAT_LABELS.map(({ key, label }) => (
              <Pressable key={key} testID={`more-rep-${key}`} onPress={() => onRepeatChange(key)} style={[styles.chipSm, repeat === key && styles.chipSmActive]}>
                <Text style={[styles.chipSmText, repeat === key && styles.chipSmTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
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
  titleInput: { color: colors.onSurface, fontSize: 20, fontWeight: "600", paddingVertical: 4 },
  descriptionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, paddingVertical: 6 },
  descInput: { color: colors.onSurface, fontSize: 14, flex: 1, minWidth: 160 },
  inlineTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.brandTertiary },
  inlineTagEmoji: { fontSize: 12 },
  inlineTagText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600" },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, paddingBottom: 8, marginTop: 6 },
  toolbarScrollContent: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 6 },
  tbButton: { minHeight: 40, paddingHorizontal: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  tbButtonHighlight: { backgroundColor: colors.brandTertiary },
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
  shortcutsRow: { flexDirection: "row", gap: 10, paddingVertical: 12 },
  shortcut: { flex: 1, alignItems: "center", gap: 6 },
  shortcutIcon: { width: 46, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  shortcutLabel: { color: colors.brandPrimary, fontSize: 11, fontWeight: "600", textAlign: "center" },
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
  timeSectionContainer: { paddingBottom: 6 },
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
  durationCopy: { color: colors.muted, fontSize: 13, textAlign: "center", maxWidth: 260 },

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
}));
