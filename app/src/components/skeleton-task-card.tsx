import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";

export function SkeletonTaskCard({ isLast }: { isLast?: boolean }) {
  const { colors } = useTheme();
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.8,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 850,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const placeholderBg = colors.surfaceSecondary || "#1E293B";

  return (
    <View
      style={[
        styles.cardRow,
        { backgroundColor: colors.surface, borderBottomColor: colors.border },
        isLast && styles.cardRowLast,
      ]}
    >
      {/* Checkbox Placeholder */}
      <Animated.View
        style={[
          styles.checkboxPlaceholder,
          { backgroundColor: placeholderBg, opacity: pulseAnim },
        ]}
      />

      {/* Main Content Placeholders */}
      <View style={styles.contentCol}>
        <Animated.View
          style={[
            styles.titleLine,
            { backgroundColor: placeholderBg, opacity: pulseAnim },
          ]}
        />
        <Animated.View
          style={[
            styles.metaLine,
            { backgroundColor: placeholderBg, opacity: pulseAnim },
          ]}
        />
      </View>

      {/* Right Date Placeholder */}
      <Animated.View
        style={[
          styles.dateChip,
          { backgroundColor: placeholderBg, opacity: pulseAnim },
        ]}
      />
    </View>
  );
}

export function SkeletonTaskList({ count = 6 }: { count?: number }) {
  const { colors } = useTheme();
  const items = Array.from({ length: count });

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {items.map((_, index) => (
        <SkeletonTaskCard key={`skeleton-${index}`} isLast={index === count - 1} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: "hidden",
    marginHorizontal: 16,
    marginTop: 12,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardRowLast: {
    borderBottomWidth: 0,
  },
  checkboxPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 6,
    marginRight: 14,
  },
  contentCol: {
    flex: 1,
    gap: 8,
  },
  titleLine: {
    width: "72%",
    height: 14,
    borderRadius: 6,
  },
  metaLine: {
    width: "40%",
    height: 10,
    borderRadius: 4,
  },
  dateChip: {
    width: 54,
    height: 18,
    borderRadius: 6,
    marginLeft: 12,
  },
});
