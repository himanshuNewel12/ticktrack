import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { type ComponentType } from "react";
import { ActivityIndicator, ColorValue, Modal, Pressable, Text, View } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";

type LooseIconProps = { name: string; size: number; color?: ColorValue };
const Ionicons = BaseIonicons as unknown as ComponentType<LooseIconProps>;

type Props = {
  visible: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmSignOutModal({
  visible,
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="confirm-signout-backdrop">
        <Pressable style={styles.card} onPress={() => { /* trap */ }} testID="confirm-signout-card">
          <View style={styles.iconCircle}>
            <Ionicons name="log-out-outline" size={28} color={colors.error} />
          </View>
          <Text style={styles.title}>Sign out of TickTrack?</Text>
          <Text style={styles.message}>Are you sure you want to sign out? Your tasks and preferences will remain saved.</Text>

          <View style={styles.buttonRow}>
            <Pressable
              testID="confirm-signout-cancel"
              disabled={loading}
              onPress={onClose}
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>

            <Pressable
              testID="confirm-signout-submit"
              disabled={loading}
              onPress={onConfirm}
              style={({ pressed }) => [styles.submitBtn, pressed && styles.pressed]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <View style={styles.submitContent}>
                  <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.submitText}>Sign Out</Text>
                </View>
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
    backgroundColor: "rgba(15, 17, 23, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    color: colors.onSurfaceSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "600",
  },
  submitBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  submitContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
}));
