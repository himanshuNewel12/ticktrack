import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TaskDetailModal } from "@/src/components/task-detail-modal";
import { useApp } from "@/src/app-context";
import { makeStyles, useTheme } from "@/src/theme";
import type { Task } from "@/src/types";

type Tab = "watching" | "escalations";

/** Body of the "Watching & Escalations" view. The Tasks screen supplies the header and sidebar around it. */
export function FollowingView() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { loadFollowing, escalateTask, lists } = useApp();

  const [tab, setTab] = useState<Tab>("watching");
  const [data, setData] = useState<{ watching: Task[]; escalations: Task[] }>({ watching: [], escalations: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<Task | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(await loadFollowing());
  }, [loadFollowing]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  };

  const confirmEscalate = (task: Task) => {
    Alert.alert("Escalate task", `Notify the creator and assignees that "${task.title}" needs attention?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Escalate",
        style: "destructive",
        onPress: async () => {
          setBusyId(task.id);
          try {
            await escalateTask(task);
            await load();
            Alert.alert("Escalated", "The task owners have been notified.");
          } catch (err: any) {
            Alert.alert("Could not escalate", err?.message || "Please try again.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const items = tab === "watching" ? data.watching : data.escalations;

  const renderItem = ({ item }: { item: Task }) => {
    const pending = !item.completed && String(item.status || "PENDING").toUpperCase() === "PENDING";
    return (
      <Pressable onPress={() => setDetail(item)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={[styles.rowTitle, item.completed && styles.rowDone]}>{item.title}</Text>
          <Text numberOfLines={1} style={styles.rowMeta}>
            {item.assigneeName ? `To ${item.assigneeName}` : "Unassigned"}
            {item.window ? ` · ${item.window}` : item.due_date ? ` · ${item.due_date}` : ""}
          </Text>
          <Text style={[styles.rowStatus, { color: item.completed ? colors.success : pending ? colors.brandPrimary : colors.muted }]}>
            {String(item.status || "PENDING").toLowerCase()}
          </Text>
        </View>
        {tab === "escalations" && pending ? (
          <Pressable
            onPress={() => confirmEscalate(item)}
            disabled={busyId === item.id}
            style={({ pressed }) => [styles.escalateBtn, pressed && { opacity: 0.8 }]}
            testID={`escalate-${item.id}`}
          >
            {busyId === item.id ? (
              <ActivityIndicator size="small" color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons name="arrow-up-circle-outline" size={15} color={colors.onBrandPrimary} />
                <Text style={styles.escalateText}>Escalate</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.tabsContainer}>
        <View style={styles.segmentedControl}>
          {([
            ["watching", "Watching", data.watching.length],
            ["escalations", "Escalations", data.escalations.length],
          ] as [Tab, string, number][]).map(([key, label, count]) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                testID={`following-tab-${key}`}
                onPress={() => setTab(key)}
                style={[styles.segment, active && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                  {label}
                </Text>
                <View style={[styles.badge, active && styles.badgeActive]}>
                  <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brandPrimary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          initialNumToRender={12}
          windowSize={7}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={tab === "watching" ? "eye-outline" : "arrow-up-circle-outline"} size={28} color={colors.muted} />
              <Text style={styles.emptyText}>
                {tab === "watching"
                  ? "Tasks you watch will show here. You're told when they're completed or cancelled."
                  : "Tasks where you were made an escalator will show here."}
              </Text>
            </View>
          }
        />
      )}

      <TaskDetailModal
        task={detail}
        visible={Boolean(detail)}
        onClose={() => setDetail(null)}
        onToggle={() => {}}
        onDelete={() => {}}
        onPostpone={() => {}}
        onEdit={() => {}}
        lists={lists}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surfaceSecondary },
  tabsContainer: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, backgroundColor: colors.surfaceSecondary },
  segmentedControl: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 14, padding: 3, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 7, paddingHorizontal: 4, borderRadius: 10, gap: 5 },
  segmentActive: { backgroundColor: colors.brandPrimary, shadowColor: colors.brandPrimary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: "500" },
  segmentTextActive: { color: "#FFFFFF", fontWeight: "700" },
  badge: { backgroundColor: colors.surfaceSecondary, borderRadius: 9, paddingHorizontal: 5, paddingVertical: 1 },
  badgeActive: { backgroundColor: "rgba(255, 255, 255, 0.28)" },
  badgeText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  badgeTextActive: { color: "#FFFFFF" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  rowDone: { textDecorationLine: "line-through", color: colors.muted },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  rowStatus: { fontSize: 11, fontWeight: "600", marginTop: 4, textTransform: "capitalize" },
  escalateBtn: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.brandPrimary, flexDirection: "row", alignItems: "center", gap: 5 },
  escalateText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", gap: 10, paddingTop: 60, paddingHorizontal: 30 },
  emptyText: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
}));
