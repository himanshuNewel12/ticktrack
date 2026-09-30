import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ImageBackground, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/app-context";
import { makeStyles, useTheme } from "@/src/theme";

export default function Entry() {
  const { token, onboarded, loading } = useApp();
  useEffect(() => { if (!loading && onboarded && token) router.replace("/(tabs)/tasks"); }, [loading, onboarded, token]);
  if (loading) return <Loading />;
  if (!onboarded) return <Welcome />;
  if (!token) return <Auth />;
  return <Loading />;
}

function Loading() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>;
}

function Welcome() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { markOnboarded } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 18 }]}>
      <View style={styles.logoRow}><Image source={require("../assets/images/ticktrack.png")} style={styles.logoImage} contentFit="contain" /><Text style={styles.logoText}>TickTrack</Text></View>
      <View style={styles.hero}>
        <View style={styles.heroGlow} /><View style={styles.heroCard}><Text style={styles.heroDate}>TODAY · TUESDAY</Text><Text style={styles.heroTitle}>Make space for what matters.</Text><View style={styles.heroLine}><View style={styles.heroDot} /><Text style={styles.heroTask}>Plan the day with calm</Text></View><View style={[styles.heroLine, { opacity: 0.55 }]}><View style={styles.heroDot} /><Text style={styles.heroTask}>Focus on one thing</Text></View></View>
      </View>
      <View style={styles.welcomeCopy}><Text style={styles.eyebrow}>A calmer way to get things done</Text><Text style={styles.title}>Your day, with room to breathe.</Text><Text style={styles.subtitle}>Tasks, habits, and focus time in one bright workspace built for momentum.</Text></View>
      <View style={styles.bottom}><Pressable testID="get-started" accessibilityRole="button" onPress={markOnboarded} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryText}>Get started</Text><Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} /></Pressable><Text style={styles.privacy}>Your workspace stays yours, synced securely.</Text></View>
    </View>
  );
}

function Auth() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { signIn, error } = useApp();
  const insets = useSafeAreaInsets();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [localError, setLocalError] = useState("");
  const submit = async () => { if (!email || password.length < 4) { setLocalError("Enter a valid email and password."); return; } setBusy(true); setLocalError(""); try { await signIn(email.trim(), password); } catch (err) { setLocalError(err instanceof Error ? err.message : "Could not sign in"); } finally { setBusy(false); } };
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
            <Text style={styles.subtitle}>{register ? "A few details, then your day gets lighter." : "Pick up where you left off."}</Text>
            {register ? <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.muted} style={styles.input} /> : null}
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email address" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor={colors.muted} style={styles.input} />
            {localError || error ? <Text style={styles.error}>{localError || error}</Text> : null}
            <Pressable testID="auth-submit" accessibilityRole="button" onPress={submit} disabled={busy} style={({ pressed }) => [styles.primaryButton, styles.authSubmitButton, pressed && styles.pressed, busy && { opacity: 0.65 }]}>{busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Text style={styles.primaryText}>{register ? "Create account" : "Sign in"}</Text><Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} /></>}</Pressable>
            <Pressable accessibilityRole="button" onPress={() => setRegister((value) => !value)} style={styles.switchButton}><Text style={styles.switchText}>{register ? "Already have an account? Sign in" : "New here? Create an account"}</Text></Pressable>
            <View style={styles.authNote}><Ionicons name="shield-checkmark-outline" size={18} color={colors.success} /><Text style={styles.authNoteText}>Cloud sync keeps your tasks available across devices.</Text></View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const useStyles = makeStyles((colors) => ({
  bgContainer: { flex: 1, width: "100%", height: "100%" },
  screenAuth: { flex: 1, paddingHorizontal: 20 },
  topHeader: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start", marginBottom: 16, paddingLeft: 4 },
  logoImageHeader: { width: 34, height: 34, borderRadius: 9 },
  logoTextHeader: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", letterSpacing: 1.2, textShadowColor: "rgba(0,0,0,0.25)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  cardLogoImage: { width: 42, height: 42, borderRadius: 8, marginBottom: 12 },
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 24 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 }, logoImage: { width: 40, height: 40, borderRadius: 12 }, logo: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandPrimary }, logoText: { color: colors.onSurface, fontSize: 22, fontWeight: "500" },
  hero: { height: 310, marginTop: 34, borderRadius: 28, backgroundColor: colors.brandTertiary, overflow: "hidden", justifyContent: "center", alignItems: "center" }, heroGlow: { position: "absolute", width: 250, height: 250, borderRadius: 125, backgroundColor: colors.brandSecondary, opacity: 0.35, top: -40, right: -55 }, heroCard: { width: "82%", borderRadius: 20, padding: 22, backgroundColor: colors.surface, shadowColor: colors.surfaceInverse, shadowOpacity: 0.08, shadowRadius: 18, elevation: 3 }, heroDate: { color: colors.brandPrimary, fontSize: 11, fontWeight: "500", letterSpacing: 1.1, marginBottom: 12 }, heroTitle: { color: colors.onSurface, fontSize: 24, lineHeight: 31, fontWeight: "500", marginBottom: 22 }, heroLine: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }, heroDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.brandPrimary }, heroTask: { color: colors.onSurfaceSecondary, fontSize: 14 },
  welcomeCopy: { marginTop: 32 }, eyebrow: { color: colors.brandPrimary, fontSize: 13, fontWeight: "500", marginBottom: 10 }, title: { color: colors.onSurface, fontSize: 32, lineHeight: 39, fontWeight: "500" }, subtitle: { color: colors.onSurfaceSecondary, fontSize: 16, lineHeight: 24, marginTop: 10, marginBottom: 8 }, bottom: { marginTop: "auto" }, primaryButton: { minHeight: 54, borderRadius: 18, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 12 }, primaryText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "500" }, pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] }, privacy: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 14 },
  authWrap: { flex: 1, justifyContent: "center", width: "100%", maxWidth: 420, alignSelf: "center" }, authCard: { padding: 24, borderRadius: 24, backgroundColor: colors.surface, shadowColor: colors.surfaceInverse, shadowOpacity: 0.12, shadowRadius: 24, elevation: 5 },  authTitle: { color: colors.onSurface, fontSize: 30, fontWeight: "500" }, input: { minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 16, color: colors.onSurface, fontSize: 16, marginTop: 14 }, error: { color: colors.error, fontSize: 13, marginTop: 12, lineHeight: 18 }, authSubmitButton: { marginTop: 20 }, switchButton: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 12 }, switchText: { color: colors.brandPrimary, fontSize: 14, fontWeight: "500" }, authNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 24 }, authNoteText: { color: colors.muted, fontSize: 12, textAlign: "center" },
}));