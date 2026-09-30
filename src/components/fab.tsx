import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { type ComponentType } from "react";
import { ColorValue, Pressable, StyleSheet, View } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";

type LooseIconProps = { name: string; size: number; color?: ColorValue };
const Ionicons = BaseIonicons as unknown as ComponentType<LooseIconProps>;

type FabProps = { onPress: () => void; testID?: string; icon?: string };

export function Fab({ onPress, testID = "fab", icon = "add" }: FabProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={styles.wrap} pointerEvents="box-none">
        <Pressable
          testID={testID}
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        >
          <Ionicons name={icon} size={26} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { position: "absolute", right: 20, bottom: 24 },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.brandPrimary,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
}));
