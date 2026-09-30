import { useMemo, useState, useEffect } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

export const ACCENT_COLORS = [
  { name: "TickTick Blue", hex: "#3B82F6", secondary: "#2563EB", tertiary: "#EFF6FF", onTertiary: "#1D4ED8" },
  { name: "Royal Indigo", hex: "#6366F1", secondary: "#4F46E5", tertiary: "#EEF2FF", onTertiary: "#3730A3" },
  { name: "Violet Purple", hex: "#8B5CF6", secondary: "#7C3AED", tertiary: "#F5F3FF", onTertiary: "#5B21B6" },
  { name: "Emerald Green", hex: "#10B981", secondary: "#059669", tertiary: "#ECFDF5", onTertiary: "#065F46" },
  { name: "Sunset Orange", hex: "#F97316", secondary: "#EA580C", tertiary: "#FFF7ED", onTertiary: "#9A3412" },
  { name: "Rose Pink", hex: "#EC4899", secondary: "#DB2777", tertiary: "#FDF2F8", onTertiary: "#9D174D" },
];

export const light = {
  surface: "#FAFAFC",
  onSurface: "#111827",
  surfaceSecondary: "#F3F4F6",
  onSurfaceSecondary: "#374151",
  surfaceTertiary: "#E5E7EB",
  onSurfaceTertiary: "#4B5563",
  surfaceInverse: "#1F2937",
  onSurfaceInverse: "#F9FAFB",
  muted: "#6B7280",

  brand: "#8B5CF6",
  onBrand: "#FFFFFF",
  brandPrimary: "#8B5CF6",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#7C3AED",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#F5F3FF",
  onBrandTertiary: "#5B21B6",

  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  divider: "#E5E7EB",
};

export const dark = {
  surface: "#111827",
  onSurface: "#F9FAFB",
  surfaceSecondary: "#1F2937",
  onSurfaceSecondary: "#E5E7EB",
  surfaceTertiary: "#374151",
  onSurfaceTertiary: "#D1D5DB",
  surfaceInverse: "#FAFAFC",
  onSurfaceInverse: "#111827",
  muted: "#9CA3AF",

  brand: "#8B5CF6",
  onBrand: "#FFFFFF",
  brandPrimary: "#8B5CF6",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#A78BFA",
  onBrandSecondary: "#111827",
  brandTertiary: "#4C1D95",
  onBrandTertiary: "#DDD6FE",

  success: "#34D399",
  onSuccess: "#111827",
  warning: "#FBBF24",
  onWarning: "#111827",
  error: "#F87171",
  onError: "#111827",
  info: "#60A5FA",
  onInfo: "#111827",

  border: "#374151",
  borderStrong: "#4B5563",
  divider: "#1F2937",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

import { storage } from "@/src/utils/storage";

let currentAccent = ACCENT_COLORS[2];
let currentMode: "light" | "dark" | "system" = "light";

const listeners = new Set<() => void>();

export function setAppTheme(mode: "light" | "dark" | "system", accentHex?: string) {
  currentMode = mode;
  if (accentHex) {
    const found = ACCENT_COLORS.find((c) => c.hex.toLowerCase() === accentHex.toLowerCase());
    if (found) currentAccent = found;
  }
  listeners.forEach((fn) => fn());
  void storage.setItem("ticktrack_theme_mode", mode);
  if (accentHex) void storage.setItem("ticktrack_theme_accent", accentHex);
}

export async function initAppTheme() {
  const savedMode = await storage.getItem("ticktrack_theme_mode", "light");
  const savedAccent = await storage.getItem("ticktrack_theme_accent", ACCENT_COLORS[2].hex);
  if (savedMode) currentMode = savedMode as any;
  if (savedAccent) {
    const found = ACCENT_COLORS.find((c) => c.hex.toLowerCase() === savedAccent.toLowerCase());
    if (found) currentAccent = found;
  }
  listeners.forEach((fn) => fn());
}

export function getAppThemeConfig() {
  return { mode: currentMode, accent: currentAccent };
}

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme === null ? "unspecified" : scheme);
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const scheme: ColorScheme = currentMode === "system" ? (system === "dark" ? "dark" : "light") : currentMode;
  const base = themes[scheme] || themes.light;

  const colors = useMemo(
    () => ({
      ...base,
      brand: currentAccent.hex,
      brandPrimary: currentAccent.hex,
      brandSecondary: currentAccent.secondary,
      brandTertiary: scheme === "dark" ? `${currentAccent.hex}33` : currentAccent.tertiary,
      onBrandTertiary: scheme === "dark" ? "#93C5FD" : currentAccent.onTertiary,
    }),
    [base, scheme, currentAccent]
  );

  return { scheme, colors };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
