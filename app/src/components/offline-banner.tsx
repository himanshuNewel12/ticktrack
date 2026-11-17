import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/src/app-context";

/**
 * Shown only while tasks are actually waiting in the offline queue. Tasks being created
 * online also carry an `offline_` id for a moment, so the real queue is the source of truth.
 */
export function OfflineBanner() {
  const { offlineQueueCount: pending } = useApp();
  const insets = useSafeAreaInsets();

  if (pending === 0) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 8 }]} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={18} color="#78350F" />
      <Text style={styles.text}>
        Your device has no internet. {pending === 1 ? "1 task is" : `${pending} tasks are`} in the queue and will sync automatically when you are back online.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "#FDE68A",
  },
  text: { flex: 1, fontSize: 12, fontWeight: "600", color: "#78350F" },
});
