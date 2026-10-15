import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/app-context";
import { ACCENT_COLORS, makeStyles, setAppTheme, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import { AnimatedSplashScreen } from "@/src/components/animated-splash-screen";

export default function Entry() {
  const { token, onboarded, loading } = useApp();
  const [splashFinished, setSplashFinished] = useState(false);

  useEffect(() => {
    if (!loading && splashFinished && onboarded && token) {
      router.replace("/(tabs)/tasks");
    }
  }, [loading, splashFinished, onboarded, token]);

  if (!splashFinished) {
    return (
      <AnimatedSplashScreen
        isReady={!loading}
        onFinish={() => {
          setSplashFinished(true);
          if (onboarded && token) {
            router.replace("/(tabs)/tasks");
          }
        }}
      />
    );
  }

  if (!onboarded) return <Welcome />;
  if (!token) return <Auth />;
  return (
    <AnimatedSplashScreen
      isReady={true}
      onFinish={() => router.replace("/(tabs)/tasks")}
    />
  );
}

function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.brandPrimary} size="large" />
    </View>
  );
}

const ONBOARDING_LISTS = [
  { id: "work", name: "Work", emoji: "💼" },
  { id: "personal", name: "Personal", emoji: "🏠" },
  { id: "shopping", name: "Shopping", emoji: "📦" },
  { id: "learning", name: "Learning", emoji: "📖" },
  { id: "wishlist", name: "Wish List", emoji: "🦄" },
  { id: "fitness", name: "Fitness", emoji: "🏃" },
];

function Welcome() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { markOnboarded } = useApp();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedLists, setSelectedLists] = useState<string[]>(["Work", "Personal"]);
  const [selectedThemeHex, setSelectedThemeHex] = useState(ACCENT_COLORS[0].hex);

  const toggleList = (name: string) => {
    setSelectedLists((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const handleSelectTheme = (hex: string) => {
    setSelectedThemeHex(hex);
    setAppTheme("light", hex);
  };

  const finishOnboarding = async () => {
    await storage.setItem("ticktrack_onboarding_lists", JSON.stringify(selectedLists));
    setAppTheme("light", selectedThemeHex);
    await markOnboarded();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      {/* Top Nav Row for Steps 2 & 3 */}
      {step > 1 ? (
        <View style={styles.onboardingNav}>
          <Pressable
            hitSlop={12}
            onPress={() => setStep((s) => (s === 3 ? 2 : 1) as any)}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.logoRow}>
          <Image source={require("../assets/images/ticktrack.png")} style={styles.logoImage} contentFit="contain" />
          <Text style={styles.logoText}>TickTrack</Text>
        </View>
      )}

      {/* Screen Body by Step */}
      <View style={styles.stepBody}>
        {step === 1 && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepScroll}>
            <View style={styles.hero}>
              <View style={styles.heroGlow} />
              <View style={styles.heroCard}>
                <Text style={styles.heroDate}>TODAY · TUESDAY</Text>
                <Text style={styles.heroTitle}>Make space for what matters.</Text>
                <View style={styles.heroLine}>
                  <View style={styles.heroDot} />
                  <Text style={styles.heroTask}>Plan the day with calm</Text>
                </View>
                <View style={[styles.heroLine, { opacity: 0.55 }]}>
                  <View style={styles.heroDot} />
                  <Text style={styles.heroTask}>Focus on one thing</Text>
                </View>
              </View>
            </View>

            <View style={styles.welcomeCopy}>
              <Text style={styles.eyebrow}>A calmer way to get things done</Text>
              <Text style={styles.title}>Your day, with room to breathe.</Text>
              <Text style={styles.subtitle}>
                Tasks, habits, and focus time in one bright workspace built for momentum.
              </Text>
            </View>
          </ScrollView>
        )}

        {step === 2 && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepScroll}>
            {/* Top Preview Card (Image 1 reference) */}
            <View style={styles.previewContainer}>
              <View style={styles.previewSidebar}>
                <View style={styles.previewSidebarItem}>
                  <Text style={styles.previewSidebarEmoji}>📅</Text>
                  <Text style={styles.previewSidebarText}>Today</Text>
                </View>
                <View style={styles.previewSidebarItem}>
                  <Text style={styles.previewSidebarEmoji}>📥</Text>
                  <Text style={styles.previewSidebarText}>Inbox</Text>
                </View>
                <View style={styles.previewSidebarItem}>
                  <Text style={styles.previewSidebarEmoji}>💼</Text>
                  <Text style={styles.previewSidebarText}>Work</Text>
                </View>
                <View style={[styles.previewSidebarItem, styles.previewSidebarActive]}>
                  <Text style={styles.previewSidebarEmoji}>🏠</Text>
                  <Text style={[styles.previewSidebarText, { color: colors.brandPrimary, fontWeight: "600" }]}>
                    Personal
                  </Text>
                </View>
              </View>
              <View style={styles.previewBezel} />
            </View>

            <Text style={styles.onboardingTitle}>Choose the lists you need</Text>

            {/* List Selection Grid */}
            <View style={styles.listGrid}>
              {ONBOARDING_LISTS.map((item) => {
                const selected = selectedLists.includes(item.name);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleList(item.name)}
                    style={({ pressed }) => [
                      styles.listCard,
                      selected && styles.listCardSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    {selected && (
                      <View style={[styles.cardCheckBadge, { backgroundColor: colors.brandPrimary }]}>
                        <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                      </View>
                    )}
                    <Text style={styles.listCardEmoji}>{item.emoji}</Text>
                    <Text style={styles.listCardText}>{item.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        {step === 3 && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepScroll}>
            {/* Mockup Phone Calendar (Image 2 reference) */}
            <View style={styles.phoneMockup}>
              {/* Phone Header */}
              <View style={styles.mockupHeader}>
                <Text style={styles.mockupMonth}>October</Text>
                <View style={styles.mockupIcons}>
                  <Ionicons name="options-outline" size={16} color="#4B5563" />
                  <Ionicons name="calendar-outline" size={16} color="#4B5563" />
                  <Ionicons name="ellipsis-vertical" size={16} color="#4B5563" />
                </View>
              </View>

              {/* Day Headers */}
              <View style={styles.mockupWeekdays}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <Text key={day} style={styles.mockupWeekdayText}>{day}</Text>
                ))}
              </View>

              {/* Dates Grid */}
              <View style={styles.mockupDatesGrid}>
                {/* Row 1 */}
                <Text style={styles.mockupDateMuted}>27</Text>
                <Text style={styles.mockupDateMuted}>28</Text>
                <Text style={styles.mockupDateMuted}>29</Text>
                <Text style={styles.mockupDateMuted}>30</Text>
                <Text style={styles.mockupDate}>1</Text>
                <Text style={styles.mockupDate}>2</Text>
                <Text style={styles.mockupDate}>3</Text>
                {/* Row 2 */}
                <Text style={styles.mockupDate}>4</Text>
                <Text style={styles.mockupDate}>5</Text>
                <Text style={styles.mockupDate}>6</Text>
                <Text style={styles.mockupDate}>7</Text>
                <Text style={styles.mockupDate}>8</Text>
                <Text style={styles.mockupDate}>9</Text>
                <Text style={styles.mockupDate}>10</Text>
                {/* Row 3 */}
                <Text style={styles.mockupDate}>11</Text>
                <View style={[styles.mockupActiveDateCircle, { backgroundColor: selectedThemeHex }]}>
                  <Text style={styles.mockupActiveDateText}>12</Text>
                </View>
                <Text style={styles.mockupDate}>13</Text>
                <Text style={styles.mockupDate}>14</Text>
                <Text style={styles.mockupDate}>15</Text>
                <Text style={styles.mockupDate}>16</Text>
                <Text style={styles.mockupDate}>17</Text>
              </View>

              {/* Mockup Floating Task Card */}
              <View style={styles.mockupTaskCard}>
                <Text style={styles.mockupTodayLabel}>Today</Text>
                <View style={styles.mockupTaskRow}>
                  <View style={styles.mockupCheckbox} />
                  <Text style={styles.mockupTaskText}>Write the summary of today</Text>
                </View>
                <View style={styles.mockupTaskRow}>
                  <View style={styles.mockupCheckbox} />
                  <Text style={styles.mockupTaskText}>Organize my computer desktop</Text>
                </View>
                <View style={styles.mockupTaskRow}>
                  <View style={styles.mockupCheckbox} />
                  <Text style={styles.mockupTaskText}>Remember to water the flowers</Text>
                </View>
              </View>
            </View>

            <Text style={styles.onboardingTitle}>Choose your favorite theme</Text>

            {/* Theme Swatches Row */}
            <View style={styles.themeRow}>
              {ACCENT_COLORS.map((color) => {
                const isSelected = selectedThemeHex.toLowerCase() === color.hex.toLowerCase();
                return (
                  <Pressable
                    key={color.hex}
                    onPress={() => handleSelectTheme(color.hex)}
                    style={({ pressed }) => [
                      styles.themeSwatch,
                      { backgroundColor: color.hex },
                      pressed && styles.pressed,
                    ]}
                  >
                    {isSelected && (
                      <View style={styles.themeCheckBadge}>
                        <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Bottom Action Area */}
      <View style={styles.bottom}>
        <Pressable
          testID="onboarding-continue"
          accessibilityRole="button"
          onPress={() => {
            if (step === 1) setStep(2);
            else if (step === 2) setStep(3);
            else finishOnboarding();
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.brandPrimary },
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryText}>Continue</Text>
          {step === 1 ? <Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} /> : null}
        </Pressable>

        {/* 3 Pagination Dots */}
        <View style={styles.pagerDots}>
          <View style={[styles.pagerDot, step === 1 ? [styles.pagerDotActive, { backgroundColor: colors.brandPrimary }] : null]} />
          <View style={[styles.pagerDot, step === 2 ? [styles.pagerDotActive, { backgroundColor: colors.brandPrimary }] : null]} />
          <View style={[styles.pagerDot, step === 3 ? [styles.pagerDotActive, { backgroundColor: colors.brandPrimary }] : null]} />
        </View>
      </View>
    </View>
  );
}

function Auth() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { signIn, error } = useApp();
  const insets = useSafeAreaInsets();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const submit = async () => {
    if (!email || password.length < 4) {
      setLocalError("Enter a valid email and password.");
      return;
    }
    setBusy(true);
    setLocalError("");
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ImageBackground
      source={require("../assets/images/login_bg.png")}
      style={styles.bgContainer}
      resizeMode="cover"
    >
      <KeyboardAvoidingView style={styles.screenAuth} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.authWrap, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.authCard}>
            <Image source={require("../assets/images/ticktrack.png")} style={styles.cardLogoImage} contentFit="contain" />
            <Text style={styles.authTitle}>{register ? "Create your workspace" : "Welcome back"}</Text>
            <Text style={styles.subtitle}>
              {register ? "A few details, then your day gets lighter." : "Pick up where you left off."}
            </Text>
            {register ? (
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            ) : null}
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email address"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            {localError || error ? <Text style={styles.error}>{localError || error}</Text> : null}
            <Pressable
              testID="auth-submit"
              accessibilityRole="button"
              onPress={submit}
              disabled={busy}
              style={({ pressed }) => [
                styles.primaryButton,
                styles.authSubmitButton,
                { backgroundColor: colors.brandPrimary },
                pressed && styles.pressed,
                busy && { opacity: 0.65 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <>
                  <Text style={styles.primaryText}>{register ? "Create account" : "Sign in"}</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} />
                </>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRegister((value) => !value)}
              style={styles.switchButton}
            >
              <Text style={[styles.switchText, { color: colors.brandPrimary }]}>
                {register ? "Already have an account? Sign in" : "New here? Create an account"}
              </Text>
            </Pressable>
            <View style={styles.authNote}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.success} />
              <Text style={styles.authNoteText}>Cloud sync keeps your tasks available across devices.</Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 22 },
  stepBody: { flex: 1 },
  stepScroll: { paddingBottom: 16 },
  onboardingNav: { height: 42, justifyContent: "center", marginBottom: 6 },
  backButton: { width: 36, height: 36, justifyContent: "center" },

  logoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  logoImage: { width: 38, height: 38, borderRadius: 10 },
  logoText: { color: colors.onSurface, fontSize: 22, fontWeight: "600" },

  hero: {
    height: 290,
    marginTop: 20,
    borderRadius: 26,
    backgroundColor: colors.brandTertiary,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  heroGlow: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.brandSecondary,
    opacity: 0.35,
    top: -40,
    right: -55,
  },
  heroCard: {
    width: "84%",
    borderRadius: 20,
    padding: 20,
    backgroundColor: colors.surface,
    shadowColor: colors.surfaceInverse,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  heroDate: { color: colors.brandPrimary, fontSize: 11, fontWeight: "600", letterSpacing: 1.1, marginBottom: 12 },
  heroTitle: { color: colors.onSurface, fontSize: 22, lineHeight: 29, fontWeight: "600", marginBottom: 20 },
  heroLine: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  heroDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.brandPrimary },
  heroTask: { color: colors.onSurfaceSecondary, fontSize: 13 },

  welcomeCopy: { marginTop: 28 },
  eyebrow: { color: colors.brandPrimary, fontSize: 13, fontWeight: "600", marginBottom: 8 },
  title: { color: colors.onSurface, fontSize: 30, lineHeight: 37, fontWeight: "700" },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22, marginTop: 8 },

  /* Step 2: Lists Selection */
  previewContainer: {
    height: 250,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  previewSidebar: { flex: 1, padding: 18, justifyContent: "space-around" },
  previewSidebarItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  previewSidebarActive: { backgroundColor: "#EEF2FF" },
  previewSidebarEmoji: { fontSize: 18 },
  previewSidebarText: { fontSize: 15, color: "#1F2937", fontWeight: "500" },
  previewBezel: { width: 44, backgroundColor: "#6B7280" },

  onboardingTitle: {
    color: colors.onSurface,
    fontSize: 23,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 22,
    marginBottom: 16,
  },

  listGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  listCard: {
    width: "48%",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingVertical: 18,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    position: "relative",
  },
  listCardSelected: {
    borderColor: colors.brandPrimary,
  },
  cardCheckBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  listCardEmoji: { fontSize: 20 },
  listCardText: { fontSize: 15, fontWeight: "600", color: "#1F2937" },

  /* Step 3: Phone Mockup & Themes */
  phoneMockup: {
    height: 310,
    borderRadius: 30,
    backgroundColor: "#EDF2FB",
    borderWidth: 7,
    borderColor: "#374151",
    padding: 14,
    marginTop: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  mockupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  mockupMonth: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  mockupIcons: { flexDirection: "row", gap: 10 },
  mockupWeekdays: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  mockupWeekdayText: { fontSize: 10, color: "#6B7280", width: 28, textAlign: "center" },
  mockupDatesGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  mockupDate: { fontSize: 11, color: "#1F2937", width: 28, textAlign: "center", fontWeight: "500" },
  mockupDateMuted: { fontSize: 11, color: "#9CA3AF", width: 28, textAlign: "center" },
  mockupActiveDateCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  mockupActiveDateText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },

  mockupTaskCard: {
    position: "absolute",
    bottom: 12,
    left: 14,
    right: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  mockupTodayLabel: { fontSize: 12, fontWeight: "700", color: "#111827", marginBottom: 8 },
  mockupTaskRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  mockupCheckbox: { width: 14, height: 14, borderRadius: 4, borderWidth: 1.5, borderColor: "#9CA3AF" },
  mockupTaskText: { fontSize: 11, color: "#1F2937", fontWeight: "500" },

  themeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginTop: 4,
  },
  themeSwatch: {
    width: 40,
    height: 40,
    borderRadius: 12,
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  themeCheckBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },

  /* Common Actions & Pager */
  bottom: { marginTop: "auto", paddingTop: 10 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "600" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  pagerDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingBottom: 4,
  },
  pagerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#D1D5DB" },
  pagerDotActive: { width: 18, height: 6, borderRadius: 3 },

  /* Auth screen styles */
  bgContainer: { flex: 1, width: "100%", height: "100%" },
  screenAuth: { flex: 1, paddingHorizontal: 20 },
  cardLogoImage: { width: 42, height: 42, borderRadius: 8, marginBottom: 12 },
  authWrap: { flex: 1, justifyContent: "center", width: "100%", maxWidth: 420, alignSelf: "center" },
  authCard: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: colors.surface,
    shadowColor: colors.surfaceInverse,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 5,
  },
  authTitle: { color: colors.onSurface, fontSize: 30, fontWeight: "600" },
  input: {
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 16,
    color: colors.onSurface,
    fontSize: 16,
    marginTop: 14,
  },
  error: { color: colors.error, fontSize: 13, marginTop: 12, lineHeight: 18 },
  authSubmitButton: { marginTop: 20 },
  switchButton: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 12 },
  switchText: { fontSize: 14, fontWeight: "600" },
  authNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 24 },
  authNoteText: { color: colors.muted, fontSize: 12, textAlign: "center" },
}));