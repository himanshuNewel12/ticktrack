import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format, formatDistanceToNow } from "date-fns";

import { useTheme } from "../theme";
import { useApp } from "../app-context";
import type { AppNotification, Task } from "../types";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectTask?: (task: Task) => void;
};

export function NotificationsModal({ visible, onClose, onSelectTask }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { notifications, unreadNotificationCount, markNotificationRead, markAllNotificationsRead, tasks, refresh } = useApp();

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleNotificationPress = (item: AppNotification) => {
    if (!item.isRead) {
      void markNotificationRead(item.id);
    }

    const entityId = item.metadata?.entityId;
    if (entityId && onSelectTask) {
      const matched = tasks.find((t) => t.id === entityId);
      if (matched) {
        onClose();
        onSelectTask(matched);
      }
    }
  };

  const formatTimestamp = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return formatDistanceToNow(d, { addSuffix: true });
    } catch {
      return isoStr;
    }
  };

  const getNotificationIcon = (type: string) => {
    const t = (type || "").toUpperCase();
    if (t.includes("ASSIGNED") || t.includes("ASSIGN")) {
      return { name: "person-add" as const, color: colors.brandPrimary };
    }
    if (t.includes("COMPLETED") || t.includes("COMPLETE")) {
      return { name: "checkmark-circle" as const, color: colors.success };
    }
    if (t.includes("POSTPONED") || t.includes("RESCHEDULE")) {
      return { name: "time" as const, color: colors.warning };
    }
    if (t.includes("CANCEL")) {
      return { name: "close-circle" as const, color: colors.error };
    }
    return { name: "notifications" as const, color: colors.info };
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable
          onPress={() => { /* trap */ }}
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          testID="notifications-modal"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="notifications" size={22} color={colors.brandPrimary} />
              <Text style={styles.headerTitle}>Notifications</Text>
              {unreadNotificationCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unreadNotificationCount}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.headerActions}>
              {unreadNotificationCount > 0 ? (
                <Pressable
                  onPress={() => void markAllNotificationsRead()}
                  style={styles.markAllBtn}
                  testID="mark-all-read-btn"
                >
                  <Ionicons name="checkmark-done" size={16} color={colors.brandPrimary} />
                  <Text style={styles.markAllText}>Mark all read</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} style={styles.closeBtn} testID="close-notifications-btn">
                <Ionicons name="close" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
          </View>

          {/* List of Notifications */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.brandPrimary}
                colors={[colors.brandPrimary]}
              />
            }
          >
            {notifications.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="notifications-off-outline" size={38} color={colors.muted} />
                </View>
                <Text style={styles.emptyTitle}>No Notifications</Text>
                <Text style={styles.emptySubtitle}>
                  You're all caught up! New task assignments and action alerts will appear here.
                </Text>
              </View>
            ) : (
              notifications.map((item) => {
                const iconInfo = getNotificationIcon(item.type);
                const hasMatchingTask = Boolean(item.metadata?.entityId && tasks.some((t) => t.id === item.metadata?.entityId));

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleNotificationPress(item)}
                    style={({ pressed }) => [
                      styles.notificationCard,
                      !item.isRead && styles.notificationCardUnread,
                      pressed && { opacity: 0.75 },
                    ]}
                    testID={`notification-card-${item.id}`}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: iconInfo.color + "18" }]}>
                      <Ionicons name={iconInfo.name} size={20} color={iconInfo.color} />
                    </View>

                    <View style={styles.cardContent}>
                      <View style={styles.cardHeaderRow}>
                        <Text style={[styles.cardTitle, !item.isRead && styles.cardTitleUnread]} numberOfLines={2}>
                          {item.title}
                        </Text>
                        {!item.isRead ? <View style={styles.unreadDot} /> : null}
                      </View>

                      {item.body ? (
                        <Text style={styles.cardBody} numberOfLines={3}>
                          {item.body}
                        </Text>
                      ) : null}

                      <View style={styles.cardFooterRow}>
                        <Text style={styles.cardTime}>{formatTimestamp(item.createdAt)}</Text>
                        {hasMatchingTask ? (
                          <View style={styles.viewTaskHint}>
                            <Text style={styles.viewTaskHintText}>Tap to view task</Text>
                            <Ionicons name="chevron-forward" size={13} color={colors.brandPrimary} />
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
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
      maxHeight: "85%",
      minHeight: "45%",
      paddingTop: 16,
      paddingHorizontal: 18,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.onSurface,
    },
    unreadBadge: {
      backgroundColor: colors.brandPrimary,
      borderRadius: 12,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    unreadBadgeText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "700",
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    markAllBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderRadius: 12,
      backgroundColor: colors.surfaceSecondary,
    },
    markAllText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.brandPrimary,
    },
    closeBtn: {
      padding: 6,
      borderRadius: 20,
    },
    listContent: {
      paddingVertical: 14,
      gap: 10,
    },
    notificationCard: {
      flexDirection: "row",
      backgroundColor: colors.surfaceSecondary,
      borderRadius: 16,
      padding: 14,
      gap: 12,
      alignItems: "flex-start",
    },
    notificationCardUnread: {
      backgroundColor: colors.brandPrimary + "10",
      borderWidth: 1,
      borderColor: colors.brandPrimary + "30",
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    cardContent: {
      flex: 1,
      gap: 4,
    },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 6,
    },
    cardTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: "600",
      color: colors.onSurface,
      lineHeight: 19,
    },
    cardTitleUnread: {
      fontWeight: "700",
      color: colors.onSurface,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.brandPrimary,
      marginTop: 5,
    },
    cardBody: {
      fontSize: 13,
      color: colors.muted,
      lineHeight: 18,
    },
    cardFooterRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
    },
    cardTime: {
      fontSize: 11,
      color: colors.muted,
    },
    viewTaskHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    viewTaskHintText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.brandPrimary,
    },
    emptyContainer: {
      paddingVertical: 48,
      alignItems: "center",
      paddingHorizontal: 24,
      gap: 10,
    },
    emptyIconCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.onSurface,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 19,
    },
  });
}
