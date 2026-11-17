import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Alert, Linking, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { getFileUrl } from "@/src/api";
import { useApp } from "@/src/app-context";
import { useTheme } from "@/src/theme";
import type { LocalAttachment, TaskAttachment } from "@/src/types";
import { markExternalActivity } from "@/src/utils/crash-reporter";

export const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const formatSize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Opens the system file picker and returns the chosen files (empty if cancelled or invalid). */
export async function pickAttachments(current: number): Promise<LocalAttachment[]> {
  const room = MAX_ATTACHMENTS - current;
  if (room <= 0) {
    Alert.alert("Too many files", `You can attach up to ${MAX_ATTACHMENTS} files.`);
    return [];
  }
  markExternalActivity("file-picker");
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  const files = res.assets.slice(0, room);
  const tooBig = files.find((f) => (f.size ?? 0) > MAX_ATTACHMENT_BYTES);
  if (tooBig) {
    Alert.alert("File too large", `${tooBig.name} is over 25 MB.`);
    return [];
  }
  return files.map((f) => ({ uri: f.uri, name: f.name, size: f.size ?? 0, mimeType: f.mimeType || "application/octet-stream" }));
}

/** Paperclip button that opens the system file picker and hands back the chosen files. */
export function AttachFileButton({
  current,
  onPicked,
  size = 18,
  testID,
}: {
  current: number;
  onPicked: (files: LocalAttachment[]) => void;
  size?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={async () => {
        const picked = await pickAttachments(current);
        if (picked.length) onPicked(picked);
      }}
      hitSlop={8}
      testID={testID}
      style={{ padding: 6 }}
    >
      <Ionicons name="attach" size={size} color={colors.brandPrimary} />
    </Pressable>
  );
}

function Chip({ name, size, onPress, onRemove, style }: {
  name: string; size?: number; onPress?: () => void; onRemove?: () => void; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, { backgroundColor: colors.brandTertiary }, style]}
    >
      <Ionicons name="document-attach-outline" size={14} color={colors.brandPrimary} />
      <Text numberOfLines={1} style={[styles.chipText, { color: colors.brandPrimary }]}>
        {name}
        {size ? ` · ${formatSize(size)}` : ""}
      </Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color={colors.muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** Files picked but not uploaded yet — removable. */
export function PendingAttachments({ files, onRemove, style }: {
  files: LocalAttachment[]; onRemove: (index: number) => void; style?: StyleProp<ViewStyle>;
}) {
  if (files.length === 0) return null;
  return (
    <View style={[styles.row, style]}>
      {files.map((f, i) => (
        <Chip key={`${f.uri}-${i}`} name={f.name} size={f.size} onRemove={() => onRemove(i)} />
      ))}
    </View>
  );
}

/** Uploaded files on a remark — tap to open through a short-lived download link. */
export function AttachmentList({ items, style }: { items?: TaskAttachment[] | null; style?: StyleProp<ViewStyle> }) {
  const { token } = useApp();
  if (!items || items.length === 0) return null;
  const open = async (key: string) => {
    try {
      if (!token) throw new Error("Please sign in again.");
      const url = await getFileUrl(key, token);
      markExternalActivity("open-attachment");
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert("Could not open file", err?.message || "Please try again.");
    }
  };
  return (
    <View style={[styles.row, style]}>
      {items.map((a) => (
        <Chip key={a.key} name={a.name} size={a.size} onPress={() => open(a.key)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, maxWidth: "100%" },
  chipText: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
});
