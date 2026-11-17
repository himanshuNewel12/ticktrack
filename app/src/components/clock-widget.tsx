import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ActivityIndicator,
  Alert,
  ColorValue,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/app-context";
import { makeStyles, useTheme } from "@/src/theme";
import { playPopSound } from "@/src/utils/sound";

type LooseIconProps = { name: string; size: number; color?: ColorValue; style?: any };
const Ionicons = BaseIonicons as unknown as ComponentType<LooseIconProps>;

function formatTime(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

type ClockWidgetProps = {
  variant?: "header" | "card";
  style?: any;
  onClose?: () => void;
};

export function ClockWidget({ variant = "header", style, onClose }: ClockWidgetProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { todayAttendance, attendanceLoading, checkIn, checkOut, refresh } = useApp();

  const [checkInModal, setCheckInModal] = useState(false);
  const [checkOutModal, setCheckOutModal] = useState(false);
  const [detailsModal, setDetailsModal] = useState(false);

  const [isWfh, setIsWfh] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [now, setNow] = useState<number>(Date.now());
  const [confirmTime, setConfirmTime] = useState("");

  // Keep live elapsed time updated every 30 seconds when user is clocked in
  useEffect(() => {
    if (!todayAttendance?.checkIn || todayAttendance?.checkOut) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, [todayAttendance?.checkIn, todayAttendance?.checkOut]);

  const elapsedDuration = useMemo(() => {
    if (!todayAttendance?.checkIn) return "0m";
    const checkInMs = new Date(todayAttendance.checkIn).getTime();
    if (todayAttendance.checkOut) {
      const checkOutMs = new Date(todayAttendance.checkOut).getTime();
      return formatDuration(Math.max(0, checkOutMs - checkInMs));
    }
    return formatDuration(Math.max(0, now - checkInMs));
  }, [todayAttendance?.checkIn, todayAttendance?.checkOut, now]);

  const handleOpenCheckIn = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRemarks("");
    setIsWfh(false);
    setCheckInModal(true);
  };

  const handleConfirmCheckIn = async () => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await checkIn({ remarks: remarks.trim() || undefined, isWfh });
      setCheckInModal(false);
      setRemarks("");
      playPopSound();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Clock In Failed", err?.message || "Could not record clock in. Please try again.");
    }
  };

  const handleOpenCheckOut = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setConfirmTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }));
    setRemarks("");
    setCheckOutModal(true);
  };

  const handleConfirmCheckOut = async () => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await checkOut({ remarks: remarks.trim() || undefined });
      setCheckOutModal(false);
      setRemarks("");
      playPopSound();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Clock Out Failed", err?.message || "Could not record clock out. Please try again.");
    }
  };

  // ── Render Header Variant ──────────────────────────────────────────────────
  if (variant === "header") {
    if (todayAttendance === undefined) {
      return (
        <View style={[styles.headerContainer, style]}>
          <ActivityIndicator size="small" color={colors.muted} />
        </View>
      );
    }

    // Fully checked out
    if (todayAttendance?.checkOut) {
      return (
        <>
          <Pressable
            testID="clock-widget-checked-out"
            onPress={() => setDetailsModal(true)}
            style={({ pressed }) => [
              styles.headerOutBadge,
              pressed && { opacity: 0.8 },
              style,
            ]}
            hitSlop={6}
          >
            <Ionicons name="checkmark-circle" size={13} color="#059669" />
            <Text style={styles.headerOutBadgeText} numberOfLines={1}>
              Out {formatTime(todayAttendance.checkOut)}
            </Text>
          </Pressable>
          {renderModals()}
        </>
      );
    }

    // Checked in — show In time + Clock Out button
    if (todayAttendance?.checkIn) {
      return (
        <>
          <View style={[styles.headerCheckedInGroup, style]}>
            <Pressable
              testID="clock-widget-checked-in-pill"
              onPress={() => setDetailsModal(true)}
              style={({ pressed }) => [
                styles.headerInBadge,
                pressed && { opacity: 0.8 },
              ]}
              hitSlop={6}
            >
              <Ionicons name="time-outline" size={12} color="#0284C7" />
              <Text style={styles.headerInBadgeText} numberOfLines={1}>
                In {formatTime(todayAttendance.checkIn)}
              </Text>
            </Pressable>

            <Pressable
              testID="clock-widget-clock-out-btn"
              onPress={handleOpenCheckOut}
              disabled={attendanceLoading}
              style={({ pressed }) => [
                styles.headerOutBtn,
                pressed && { opacity: 0.8 },
                attendanceLoading && { opacity: 0.5 },
              ]}
              hitSlop={6}
            >
              {attendanceLoading ? (
                <ActivityIndicator size="small" color="#D97706" style={{ transform: [{ scale: 0.7 }] }} />
              ) : (
                <Ionicons name="log-out-outline" size={13} color="#D97706" />
              )}
              <Text style={styles.headerOutBtnText}>Out</Text>
            </Pressable>
          </View>
          {renderModals()}
        </>
      );
    }

    // Not yet checked in — show Clock In button
    return (
      <>
        <Pressable
          testID="clock-widget-check-in-btn"
          onPress={handleOpenCheckIn}
          disabled={attendanceLoading}
          style={({ pressed }) => [
            styles.headerCheckInBtn,
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            attendanceLoading && { opacity: 0.5 },
            style,
          ]}
          hitSlop={6}
        >
          {attendanceLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" style={{ transform: [{ scale: 0.7 }] }} />
          ) : (
            <Ionicons name="log-in-outline" size={14} color="#FFFFFF" />
          )}
          <Text style={styles.headerCheckInBtnText}>Check In</Text>
        </Pressable>
        {renderModals()}
      </>
    );
  }

  // ── Render Card Variant (for Drawer / Settings / Home) ─────────────────────
  const isCheckedIn = Boolean(todayAttendance?.checkIn && !todayAttendance?.checkOut);
  const isCheckedOut = Boolean(todayAttendance?.checkOut);

  return (
    <>
      <View style={[styles.cardRoot, style]}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View
              style={[
                styles.cardIconBox,
                isCheckedOut
                  ? { backgroundColor: "rgba(16, 185, 129, 0.12)" }
                  : isCheckedIn
                  ? { backgroundColor: "rgba(59, 130, 246, 0.12)" }
                  : { backgroundColor: "rgba(139, 92, 246, 0.12)" },
              ]}
            >
              <Ionicons
                name={isCheckedOut ? "checkmark-done" : isCheckedIn ? "time" : "calendar-outline"}
                size={18}
                color={isCheckedOut ? "#10B981" : isCheckedIn ? "#3B82F6" : colors.brandPrimary}
              />
            </View>
            <View>
              <Text style={styles.cardTitle}>Attendance Today</Text>
              <Text style={styles.cardSubtitle}>
                {new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* Status Badge */}
            <View
              style={[
                styles.cardStatusBadge,
                isCheckedOut
                  ? styles.cardStatusCompleted
                  : isCheckedIn
                  ? styles.cardStatusActive
                  : styles.cardStatusPending,
              ]}
            >
              <Text
                style={[
                  styles.cardStatusText,
                  isCheckedOut
                    ? styles.cardStatusTextCompleted
                    : isCheckedIn
                    ? styles.cardStatusTextActive
                    : styles.cardStatusTextPending,
                ]}
              >
                {isCheckedOut
                  ? "Shift Done"
                  : isCheckedIn
                  ? todayAttendance?.status === "LATE"
                    ? "Late · Active"
                    : "On The Clock"
                  : "Not Marked"}
              </Text>
            </View>

            {onClose ? (
              <Pressable
                testID="card-close-btn"
                onPress={onClose}
                hitSlop={8}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={17} color={colors.onSurface} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Card Body */}
        {isCheckedIn ? (
          <View style={styles.cardBodyActive}>
            <View style={styles.cardMetricsRow}>
              <View style={styles.cardMetricItem}>
                <Text style={styles.cardMetricLabel}>Clocked In</Text>
                <Text style={styles.cardMetricValue}>{formatTime(todayAttendance?.checkIn)}</Text>
              </View>

              <View style={styles.cardMetricDivider} />

              <View style={styles.cardMetricItem}>
                <Text style={styles.cardMetricLabel}>Elapsed Time</Text>
                <Text style={[styles.cardMetricValue, { color: colors.brandPrimary }]}>
                  {elapsedDuration}
                </Text>
              </View>

              {todayAttendance?.isWfh ? (
                <>
                  <View style={styles.cardMetricDivider} />
                  <View style={styles.cardMetricItem}>
                    <Text style={styles.cardMetricLabel}>Mode</Text>
                    <Text style={[styles.cardMetricValue, { color: "#0284C7" }]}>WFH</Text>
                  </View>
                </>
              ) : null}
            </View>

            <Pressable
              testID="card-clock-out-btn"
              onPress={handleOpenCheckOut}
              disabled={attendanceLoading}
              style={({ pressed }) => [
                styles.cardClockOutBtn,
                pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                attendanceLoading && { opacity: 0.5 },
              ]}
            >
              {attendanceLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="log-out-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.cardClockOutBtnText}>Clock Out</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : isCheckedOut ? (
          <View style={styles.cardBodyOut}>
            <View style={styles.cardMetricsRow}>
              <View style={styles.cardMetricItem}>
                <Text style={styles.cardMetricLabel}>In Time</Text>
                <Text style={styles.cardMetricValue}>{formatTime(todayAttendance?.checkIn)}</Text>
              </View>
              <View style={styles.cardMetricDivider} />
              <View style={styles.cardMetricItem}>
                <Text style={styles.cardMetricLabel}>Out Time</Text>
                <Text style={styles.cardMetricValue}>{formatTime(todayAttendance?.checkOut)}</Text>
              </View>
              <View style={styles.cardMetricDivider} />
              <View style={styles.cardMetricItem}>
                <Text style={styles.cardMetricLabel}>Total Duration</Text>
                <Text style={[styles.cardMetricValue, { color: "#10B981" }]}>{elapsedDuration}</Text>
              </View>
            </View>

            <Pressable
              testID="card-completed-btn"
              onPress={() => setDetailsModal(true)}
              style={styles.cardCompletedBadgeRow}
            >
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.cardCompletedBadgeText}>
                Shift completed today · Tap for details
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cardBodyNotMarked}>
            <Text style={styles.cardNotMarkedNotice}>
              You haven't checked in yet today. Ready to start your workday?
            </Text>

            <Pressable
              testID="card-clock-in-btn"
              onPress={handleOpenCheckIn}
              disabled={attendanceLoading}
              style={({ pressed }) => [
                styles.cardClockInBtn,
                pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                attendanceLoading && { opacity: 0.5 },
              ]}
            >
              {attendanceLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.cardClockInBtnText}>Clock In Now</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </View>

      {renderModals()}
    </>
  );

  // ── Modals ────────────────────────────────────────────────────────────────
  function renderModals() {
    return (
      <>
        {/* Check In Modal */}
        <Modal
          visible={checkInModal}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setCheckInModal(false)}
        >
          <Pressable onPress={() => setCheckInModal(false)} style={styles.modalBackdrop}>
            <Pressable onPress={() => {}} style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalIconBoxIn}>
                  <Ionicons name="log-in" size={24} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Clock In</Text>
                  <Text style={styles.modalSubtitle}>Record your start of workday</Text>
                </View>
              </View>

              {/* Time display box */}
              <View style={styles.modalTimeBox}>
                <Text style={styles.modalTimeLabel}>Check-in Time</Text>
                <Text style={styles.modalTimeValue}>
                  {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}
                </Text>
              </View>

              {/* WFH switch */}
              <View style={styles.wfhRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="home-outline" size={19} color={colors.muted} />
                  <View>
                    <Text style={styles.wfhTitle}>Work From Home (WFH)</Text>
                    <Text style={styles.wfhSubtitle}>Mark if working remotely today</Text>
                  </View>
                </View>
                <Switch
                  value={isWfh}
                  onValueChange={setIsWfh}
                  trackColor={{ false: colors.borderStrong, true: colors.brandPrimary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Optional remarks */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.inputLabel}>Remarks (Optional)</Text>
                <TextInput
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="e.g. Field visit, Client office..."
                  placeholderTextColor={colors.muted}
                  style={styles.textInput}
                  maxLength={100}
                />
              </View>

              {/* Buttons */}
              <View style={styles.modalButtonsRow}>
                <Pressable
                  onPress={() => setCheckInModal(false)}
                  disabled={attendanceLoading}
                  style={styles.modalCancelBtn}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleConfirmCheckIn}
                  disabled={attendanceLoading}
                  style={[styles.modalConfirmBtnIn, attendanceLoading && { opacity: 0.6 }]}
                >
                  {attendanceLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalConfirmBtnInText}>Confirm Clock In</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Check Out Modal (Confirmation) */}
        <Modal
          visible={checkOutModal}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setCheckOutModal(false)}
        >
          <Pressable onPress={() => setCheckOutModal(false)} style={styles.modalBackdrop}>
            <Pressable onPress={() => {}} style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalIconBoxOut}>
                  <Ionicons name="log-out" size={24} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Clock Out?</Text>
                  <Text style={styles.modalSubtitle}>This will record your check-out for today.</Text>
                </View>
              </View>

              {/* Time display box */}
              <View style={[styles.modalTimeBox, { backgroundColor: "rgba(245, 158, 11, 0.08)" }]}>
                <Text style={styles.modalTimeLabel}>Clock out time</Text>
                <Text style={[styles.modalTimeValue, { color: "#D97706" }]}>{confirmTime}</Text>
              </View>

              {/* Optional remarks */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.inputLabel}>Remarks (Optional)</Text>
                <TextInput
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="e.g. Tasks completed, handovers..."
                  placeholderTextColor={colors.muted}
                  style={styles.textInput}
                  maxLength={100}
                />
              </View>

              {/* Buttons */}
              <View style={styles.modalButtonsRow}>
                <Pressable
                  onPress={() => setCheckOutModal(false)}
                  disabled={attendanceLoading}
                  style={styles.modalCancelBtn}
                >
                  <Text style={styles.modalCancelBtnText}>No, Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleConfirmCheckOut}
                  disabled={attendanceLoading}
                  style={[styles.modalConfirmBtnOut, attendanceLoading && { opacity: 0.6 }]}
                >
                  {attendanceLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalConfirmBtnOutText}>Yes, Check Out</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Details Modal */}
        <Modal
          visible={detailsModal}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setDetailsModal(false)}
        >
          <Pressable onPress={() => setDetailsModal(false)} style={styles.modalBackdrop}>
            <Pressable onPress={() => {}} style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View
                  style={[
                    styles.modalIconBoxIn,
                    todayAttendance?.checkOut
                      ? { backgroundColor: "rgba(16, 185, 129, 0.12)" }
                      : { backgroundColor: "rgba(59, 130, 246, 0.12)" },
                  ]}
                >
                  <Ionicons
                    name={todayAttendance?.checkOut ? "checkmark-done-circle" : "time"}
                    size={24}
                    color={todayAttendance?.checkOut ? "#10B981" : "#3B82F6"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Attendance Summary</Text>
                  <Text style={styles.modalSubtitle}>
                    {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                  </Text>
                </View>
              </View>

              <View style={styles.detailsList}>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Clock In</Text>
                  <Text style={styles.detailsValue}>{formatTime(todayAttendance?.checkIn) || "—"}</Text>
                </View>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Clock Out</Text>
                  <Text style={styles.detailsValue}>
                    {formatTime(todayAttendance?.checkOut) || (todayAttendance?.checkIn ? "Still Working" : "—")}
                  </Text>
                </View>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Total Duration</Text>
                  <Text style={[styles.detailsValue, { fontWeight: "700", color: colors.brandPrimary }]}>
                    {elapsedDuration}
                  </Text>
                </View>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Shift Status</Text>
                  <Text style={styles.detailsValue}>{todayAttendance?.status || "PRESENT"}</Text>
                </View>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Workplace</Text>
                  <Text style={styles.detailsValue}>
                    {todayAttendance?.isWfh ? "Work From Home (WFH)" : "Office / On-Site"}
                  </Text>
                </View>

                {todayAttendance?.remarks ? (
                  <View style={[styles.detailsRow, { flexDirection: "column", alignItems: "flex-start", gap: 4 }]}>
                    <Text style={styles.detailsLabel}>Remarks</Text>
                    <Text style={[styles.detailsValue, { color: colors.onSurface }]}>
                      {todayAttendance.remarks}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Pressable onPress={() => setDetailsModal(false)} style={styles.detailsCloseBtn}>
                <Text style={styles.detailsCloseBtnText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }
}

const useStyles = makeStyles((colors) => ({
  // ── Header variant styles ──
  headerContainer: {
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCheckInBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  headerCheckInBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  headerCheckedInGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerInBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 16,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  headerInBadgeText: {
    color: "#0284C7",
    fontSize: 11.5,
    fontWeight: "600",
  },
  headerOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 16,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  headerOutBtnText: {
    color: "#D97706",
    fontSize: 11.5,
    fontWeight: "700",
  },
  headerOutBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 16,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  headerOutBadgeText: {
    color: "#059669",
    fontSize: 11.5,
    fontWeight: "600",
  },

  // ── Card variant styles ──
  cardRoot: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "700",
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  cardStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 10,
  },
  cardStatusActive: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
  },
  cardStatusCompleted: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  cardStatusPending: {
    backgroundColor: colors.surfaceSecondary,
  },
  cardStatusText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  cardStatusTextActive: {
    color: "#2563EB",
  },
  cardStatusTextCompleted: {
    color: "#059669",
  },
  cardStatusTextPending: {
    color: colors.muted,
  },

  // Card Body
  cardBodyActive: {
    gap: 14,
  },
  cardBodyOut: {
    gap: 12,
  },
  cardBodyNotMarked: {
    gap: 12,
  },
  cardMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  cardMetricItem: {
    alignItems: "center",
    flex: 1,
  },
  cardMetricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: colors.divider,
  },
  cardMetricLabel: {
    color: colors.muted,
    fontSize: 10.5,
    fontWeight: "500",
    marginBottom: 2,
  },
  cardMetricValue: {
    color: colors.onSurface,
    fontSize: 13.5,
    fontWeight: "700",
  },
  cardClockOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#D97706",
    paddingVertical: 11,
    borderRadius: 12,
  },
  cardClockOutBtnText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
  cardCompletedBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
  },
  cardCompletedBadgeText: {
    color: "#059669",
    fontSize: 12,
    fontWeight: "600",
  },
  cardNotMarkedNotice: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  cardClockInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 11,
    borderRadius: 12,
  },
  cardClockInBtnText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },

  // ── Modals styles ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  modalIconBoxIn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalIconBoxOut: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  modalTimeBox: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  modalTimeLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 3,
  },
  modalTimeValue: {
    color: colors.onSurface,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  wfhRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
  },
  wfhTitle: {
    color: colors.onSurface,
    fontSize: 12.5,
    fontWeight: "600",
  },
  wfhSubtitle: {
    color: colors.muted,
    fontSize: 10.5,
  },
  inputLabel: {
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: "600",
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.onSurface,
    fontSize: 13,
  },
  modalButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelBtnText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "600",
  },
  modalConfirmBtnIn: {
    flex: 1.3,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmBtnInText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  modalConfirmBtnOut: {
    flex: 1.3,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#D97706",
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmBtnOutText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  // Details Modal
  detailsList: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 16,
  },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailsLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  detailsValue: {
    color: colors.onSurface,
    fontSize: 12.5,
    fontWeight: "600",
  },
  detailsCloseBtn: {
    backgroundColor: colors.surfaceSecondary,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsCloseBtnText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "600",
  },
}));
