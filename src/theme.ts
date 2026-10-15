import { useMemo, useState, useEffect } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

export const ACCENT_COLORS = [
  { name: "Electric Blue", hex: "#3B82F6", secondary: "#2563EB", tertiary: "#EFF6FF", onTertiary: "#1D4ED8" },
  { name: "Sky Cyan", hex: "#38BDF8", secondary: "#0284C7", tertiary: "#F0F9FF", onTertiary: "#0369A1" },
  { name: "Mint Teal", hex: "#34D399", secondary: "#059669", tertiary: "#ECFDF5", onTertiary: "#065F46" },
  { name: "Sage Lime", hex: "#A3E635", secondary: "#65A30D", tertiary: "#F7FEE7", onTertiary: "#4D7C0F" },
  { name: "Warm Peach", hex: "#FBBF24", secondary: "#D97706", tertiary: "#FFFBEB", onTertiary: "#B45309" },
  { name: "Soft Pink", hex: "#F472B6", secondary: "#DB2777", tertiary: "#FDF2F8", onTertiary: "#BE185D" },
  { name: "Royal Purple", hex: "#A855F7", secondary: "#7E22CE", tertiary: "#FAF5FF", onTertiary: "#6B21A8" },
];

export const light = {
  surface: "#FFFFFF",
  onSurface: "#111827",
  surfaceSecondary: "#F2F4F8",
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

  border: "#EEF2F6",
  borderStrong: "#CBD5E1",
  divider: "#F1F5F9",
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

let currentAccent = ACCENT_COLORS[0];
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
  const savedAccent = await storage.getItem("ticktrack_theme_accent", ACCENT_COLORS[0].hex);
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
