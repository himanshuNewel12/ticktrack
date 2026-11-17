import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";

export type DeleteRepeatChoice = "occurrence" | "series";

type Props = {
  visible: boolean;
  title?: string;
  onChoose: (choice: DeleteRepeatChoice | null) => void;
};

/** Bottom sheet asked before deleting a repeating task: just this day, or every repeat. */
export function DeleteRepeatModal({ visible, title, onChoose }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onChoose(null)} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={() => onChoose(null)} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.iconWrap}>
            <Ionicons name="trash-outline" size={26} color={colors.error} />
          </View>
          <Text style={styles.heading}>Delete repeating task</Text>
          <Text style={styles.body} numberOfLines={2}>
            {title ? `“${title}” repeats. ` : ""}What would you like to delete?
          </Text>

          <Pressable
            testID="delete-this-day"
            onPress={() => onChoose("occurrence")}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}
          >
            <View style={[styles.optionIcon, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="calendar-outline" size={20} color={colors.brandPrimary} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Only this day</Text>
              <Text style={styles.optionHint}>Other days in the series stay</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="delete-all-repeats"
            onPress={() => onChoose("series")}
            style={({ pressed }) => [styles.option, styles.optionDanger, pressed && styles.pressed]}
          >
            <View style={[styles.optionIcon, { backgroundColor: colors.error + "22" }]}>
              <Ionicons name="repeat-outline" size={20} color={colors.error} />
            </View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.error }]}>All repeated days</Text>
              <Text style={styles.optionHint}>Stops the series and removes upcoming days</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.error} />
          </Pressable>

          <Pressable testID="delete-repeat-cancel" onPress={() => onChoose(null)} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const), backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    alignItems: "stretch",
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 16 },
  iconWrap: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.error + "1A",
    marginBottom: 12,
  },
  heading: { fontSize: 19, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  body: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 6, marginBottom: 18, lineHeight: 20 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: 10,
  },
  optionDanger: { backgroundColor: colors.error + "12" },
  optionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  optionHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  pressed: { opacity: 0.7 },
  cancelBtn: { alignItems: "center", paddingVertical: 14, marginTop: 2 },
  cancelText: { fontSize: 15, fontWeight: "600", color: colors.muted },
}));
