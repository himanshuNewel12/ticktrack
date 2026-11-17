import { Ionicons } from "@expo/vector-icons";
import { addDays, addMonths, format, isSameDay, startOfMonth, startOfWeek } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/app-context";
import { makeStyles, useTheme } from "@/src/theme";
import type { Task, VoiceNote } from "@/src/types";
import { parseTaskDate } from "@/src/utils/date-utils";
import { enforceLetterLimit, MAX_LETTERS } from "@/src/utils/word-limit";
import { VoiceNotePlayer, VoiceRecordButton } from "@/src/components/voice-note";

type Props = {
  task: Task | null;
  visible: boolean;
  onClose: () => void;
  onPostponed?: () => void;
};

function toDateInput(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${m}-${d}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  try {
    const d = new Date(isoOrDate);
    if (!isNaN(d.getTime())) {
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${m}-${day}`;
    }
  } catch {}
  return isoOrDate.slice(0, 10);
}

function formatCurrentWindow(task: Task): string {
  if (task.window) return task.window;

  if (task.startAt) {
    try {
      const s = new Date(task.startAt);
      const startStr = format(s, "d MMM yyyy, hh:mm a");
      if (task.endAt) {
        const e = new Date(task.endAt);
        const endStr = format(e, "hh:mm a");
        return `${startStr} – ${endStr}`;
      }
      return startStr;
    } catch {}
  }

  if (task.due_date) {
    const parsed = parseTaskDate(task.due_date);
    if (parsed) {
      const base = format(parsed, "d MMM yyyy");
      if (task.due_date.includes("T")) {
        const timePart = task.due_date.split("T")[1]?.slice(0, 5);
        if (timePart) {
          const [h, m] = timePart.split(":");
          const hourNum = parseInt(h, 10);
          const ampm = hourNum >= 12 ? "PM" : "AM";
          const displayH = hourNum % 12 === 0 ? 12 : hourNum % 12;
          return `${base}, ${String(displayH).padStart(2, "0")}:${m} ${ampm}`;
        }
      }
      return base;
    }
  }

  return "No due date set";
}

export function PostponeActivityModal({ task, visible, onClose, onPostponed }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

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

  // When the window is resized for the keyboard, the backdrop's measured height already
  // excludes it; subtracting it again pushed the card off the top. Otherwise pad.
  const [backdropHeight, setBackdropHeight] = useState(0);
  // Some Android devices (edge-to-edge) don't resize either, which left the Reason field
  // hidden behind the keyboard — so pad whenever the backdrop is still full height.
  const windowNotResized =
    backdropHeight === 0 || backdropHeight > windowHeight - keyboardHeight * 0.5;
  const iosKeyboardPad = keyboardHeight > 0 && windowNotResized ? keyboardHeight : 0;
  // The modal is drawn under a translucent status bar, so keep clear of it.
  const topPad = Math.max(insets.top, 24) + 12;
  const maxDialogHeight = Math.max(
    220,
    Math.round(
      (backdropHeight > 0 ? backdropHeight : windowHeight) - topPad - 16 - iosKeyboardPad
    )
  );
  const { postponeTask } = useApp();

  const [endDate, setEndDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [reasonVoice, setReasonVoice] = useState<VoiceNote | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(true);
  const [cursor, setCursor] = useState(() => new Date());

  const today = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const inOneWeek = useMemo(() => addDays(today, 7), [today]);
  const inTwoWeeks = useMemo(() => addDays(today, 14), [today]);

  const cells = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  useEffect(() => {
    if (visible && task) {
      const initialEnd = toDateInput(task.endAt || task.due_date || task.startAt);
      setEndDate(initialEnd);
      const parsed = initialEnd ? new Date(initialEnd) : new Date();
      setCursor(!isNaN(parsed.getTime()) ? parsed : new Date());
      setCalendarOpen(true);
      setRemarks("");
      setReasonVoice(null);
      setError("");
      setSaving(false);
    }
  }, [visible, task]);

  if (!task) return null;

  const currentWindow = formatCurrentWindow(task);

  const handleSubmit = async () => {
    setError("");

    if (!endDate) {
      setError("Please select an end date");
      return;
    }

    if (remarks.trim().length > MAX_LETTERS) {
      setError(`Reason cannot exceed ${MAX_LETTERS} letters (currently ${remarks.trim().length} letters).`);
      return;
    }

    try {
      setSaving(true);
      await postponeTask(task, {
        endDate,
        remarks: remarks.trim() || undefined,
        voice: reasonVoice ?? undefined,
      });
      onPostponed?.();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Failed to postpone activity";
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!saving) onClose();
      }}
    >
      <Pressable onPress={() => { if (!saving) onClose(); }} style={[styles.backdrop, { paddingTop: topPad, paddingBottom: 16 + iosKeyboardPad }]}
        onLayout={(e) => setBackdropHeight(e.nativeEvent.layout.height)}
      >
        <Pressable
          onPress={() => { /* trap */ }}
          style={[
            styles.dialogCard,
            {
              maxHeight: maxDialogHeight,
            },
          ]}
          testID="postpone-activity-dialog"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Postpone Activity</Text>
            <Pressable
              onPress={onClose}
              disabled={saving}
              hitSlop={8}
              style={styles.closeBtn}
              testID="close-postpone"
            >
              <Ionicons name="close" size={20} color={colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
            contentContainerStyle={styles.body}
          >
            {/* Activity Info Banner */}
            <View style={styles.activityInfoCard}>
              <Text style={styles.activityTitle}>{task.title}</Text>
              <Text style={styles.activityCurrentTime}>Currently {currentWindow}</Text>
            </View>

            {/* End Date */}
            <View style={styles.fieldContainer}>
              

              {/* Interactive Calendar Selection Picker */}
              {calendarOpen ? (
                <View style={styles.calendarCard} testID="postpone-selection-calendar">
                  {/* Shortcuts */}
                  <View style={styles.shortcutsRow}>
                    <Pressable
                      style={[
                        styles.shortcutChip,
                        endDate === format(today, "yyyy-MM-dd") && styles.shortcutChipActive,
                      ]}
                      onPress={() => {
                        const d = format(today, "yyyy-MM-dd");
                        setEndDate(d);
                        setCursor(today);
                      }}
                    >
                      <Text
                        style={[
                          styles.shortcutChipText,
                          endDate === format(today, "yyyy-MM-dd") && styles.shortcutChipTextActive,
                        ]}
                      >
                        Today
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.shortcutChip,
                        endDate === format(tomorrow, "yyyy-MM-dd") && styles.shortcutChipActive,
                      ]}
                      onPress={() => {
                        const d = format(tomorrow, "yyyy-MM-dd");
                        setEndDate(d);
                        setCursor(tomorrow);
                      }}
                    >
                      <Text
                        style={[
                          styles.shortcutChipText,
                          endDate === format(tomorrow, "yyyy-MM-dd") && styles.shortcutChipTextActive,
                        ]}
                      >
                        Tomorrow
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.shortcutChip,
                        endDate === format(inOneWeek, "yyyy-MM-dd") && styles.shortcutChipActive,
                      ]}
                      onPress={() => {
                        const d = format(inOneWeek, "yyyy-MM-dd");
                        setEndDate(d);
                        setCursor(inOneWeek);
                      }}
                    >
                      <Text
                        style={[
                          styles.shortcutChipText,
                          endDate === format(inOneWeek, "yyyy-MM-dd") && styles.shortcutChipTextActive,
                        ]}
                      >
                        +1 Week
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.shortcutChip,
                        endDate === format(inTwoWeeks, "yyyy-MM-dd") && styles.shortcutChipActive,
                      ]}
                      onPress={() => {
                        const d = format(inTwoWeeks, "yyyy-MM-dd");
                        setEndDate(d);
                        setCursor(inTwoWeeks);
                      }}
                    >
                      <Text
                        style={[
                          styles.shortcutChipText,
                          endDate === format(inTwoWeeks, "yyyy-MM-dd") && styles.shortcutChipTextActive,
                        ]}
                      >
                        +2 Weeks
                      </Text>
                    </Pressable>
                  </View>

                  {/* Month Navigation */}
                  <View style={styles.monthNav}>
                    <Text style={styles.monthLabel}>{format(cursor, "MMMM yyyy")}</Text>
                    <View style={styles.monthNavActions}>
                      <Pressable
                        onPress={() => setCursor((c) => addMonths(c, -1))}
                        style={styles.monthNavBtn}
                        hitSlop={8}
                        testID="postpone-prev-month"
                      >
                        <Ionicons name="chevron-back" size={18} color={colors.onSurface} />
                      </Pressable>
                      <Pressable
                        onPress={() => setCursor((c) => addMonths(c, 1))}
                        style={styles.monthNavBtn}
                        hitSlop={8}
                        testID="postpone-next-month"
                      >
                        <Ionicons name="chevron-forward" size={18} color={colors.onSurface} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Weekday Labels */}
                  <View style={styles.weekRow}>
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                      <Text key={day} style={styles.weekLabel}>{day}</Text>
                    ))}
                  </View>

                  {/* Calendar Grid */}
                  <View style={styles.monthGrid}>
                    {cells.map((d) => {
                      const dStr = format(d, "yyyy-MM-dd");
                      const isSel = endDate === dStr;
                      const isToday = isSameDay(d, today);
                      const inMonth = d.getMonth() === cursor.getMonth();

                      return (
                        <Pressable
                          key={d.toISOString()}
                          onPress={() => {
                            setEndDate(dStr);
                          }}
                          style={styles.monthCell}
                          testID={`postpone-date-${dStr}`}
                        >
                          <View
                            style={[
                              styles.monthDayCircle,
                              isSel && styles.monthDaySelected,
                              !isSel && isToday && styles.monthDayToday,
                            ]}
                          >
                            <Text
                              style={[
                                styles.monthDayText,
                                !inMonth && !isSel && styles.monthDayMuted,
                                !isSel && isToday && styles.monthDayTextToday,
                                isSel && styles.monthDayTextSelected,
                              ]}
                            >
                              {format(d, "d")}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>

            {/* Reason (optional) */}
            <View style={styles.fieldContainer}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.fieldLabel}>Reason (optional)</Text>
                {task.source === "activity" && !reasonVoice ? (
                  <VoiceRecordButton onRecorded={setReasonVoice} size={16} testID="postpone-reason-voice-btn" />
                ) : null}
              </View>
              <TextInput
                value={remarks}
                onChangeText={(txt) => {
                  setRemarks(enforceLetterLimit(txt, MAX_LETTERS));
                  if (error) setError("");
                }}
                maxLength={MAX_LETTERS}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)}
                multiline
                numberOfLines={3}
                placeholder="Shared with the assignees"
                placeholderTextColor={colors.muted}
                style={styles.textArea}
              />
              {remarks ? (
                <Text style={{ fontSize: 11, color: remarks.length >= MAX_LETTERS ? colors.error : colors.muted, alignSelf: "flex-end", marginTop: 4 }}>
                  {remarks.length}/{MAX_LETTERS}
                </Text>
              ) : null}
              {reasonVoice ? (
                <VoiceNotePlayer note={reasonVoice} onRemove={() => setReasonVoice(null)} style={{ marginTop: 8 }} testID="postpone-reason-voice-preview" />
              ) : null}
            </View>

          </ScrollView>

          {/* Error Banner */}
          {error ? (
            <View style={[styles.errorBanner, { marginHorizontal: 20, marginBottom: 8 }]}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Footer Buttons */}
          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
              testID="cancel-postpone"
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleSubmit}
              disabled={saving}
              style={({ pressed }) => [styles.postponeBtn, pressed && { opacity: 0.8 }]}
              testID="submit-postpone"
            >
              {saving ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <ActivityIndicator size="small" color={colors.warning} />
                  <Text style={styles.postponeBtnText}>Postponing...</Text>
                </View>
              ) : (
                <Text style={styles.postponeBtnText}>Postpone</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  dialogCard: {
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  headerTitle: {
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: "700",
  },
  closeBtn: {
    padding: 4,
    borderRadius: 8,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 16,
  },
  activityInfoCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  activityTitle: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "700",
  },
  activityCurrentTime: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "400",
  },
  fieldContainer: {
    gap: 6,
  },
  fieldLabel: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: "600",
  },
  inputWrapper: {
    width: "100%",
  },
  nativeInputBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
  },
  nativeTextInput: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
    paddingVertical: 0,
  },
  toggleCalendarLink: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  toggleCalendarLinkText: {
    color: colors.brandPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  calendarIconBtn: {
    padding: 4,
    borderRadius: 6,
  },
  calendarCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginTop: 4,
  },
  shortcutsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  shortcutChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shortcutChipText: {
    color: colors.onSurface,
    fontSize: 11,
    fontWeight: "600",
  },
  shortcutChipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  shortcutChipTextActive: {
    color: colors.onBrandPrimary,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  monthLabel: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "700",
  },
  monthNavActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  monthNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  weekLabel: {
    width: "14%",
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  monthCell: {
    width: "14%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  monthDayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  monthDaySelected: {
    backgroundColor: colors.brandPrimary,
  },
  monthDayToday: {
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
  },
  monthDayText: {
    fontSize: 12,
    color: colors.onSurface,
    fontWeight: "500",
  },
  monthDayMuted: {
    color: colors.muted,
    opacity: 0.5,
  },
  monthDayTextToday: {
    color: colors.brandPrimary,
    fontWeight: "700",
  },
  monthDayTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  textArea: {
    minHeight: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: 12,
    fontSize: 13,
    color: colors.onSurface,
    textAlignVertical: "top",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    padding: 10,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  cancelBtn: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "600",
  },
  postponeBtn: {
    height: 42,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  postponeBtnText: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: "700",
  },
}));
