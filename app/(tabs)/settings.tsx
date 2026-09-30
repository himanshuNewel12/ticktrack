import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState, useEffect, type ComponentType } from "react";
import { Alert, ColorValue, Image, Linking, Modal, Pressable, ScrollView, Text, View, TextInput, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";

import { api } from "@/src/api";
import { useApp } from "@/src/app-context";
import { ConfirmSignOutModal } from "@/src/components/confirm-sign-out-modal";
import { storage } from "@/src/utils/storage";
import { makeStyles, useTheme, ACCENT_COLORS, setAppTheme, getAppThemeConfig } from "@/src/theme";

type LooseIconProps = { name: string; size: number; color?: ColorValue };
const Ionicons = BaseIonicons as unknown as ComponentType<LooseIconProps>;

type RowDef = { key: string; label: string; icon: string; color: string; onPress?: () => void };

const isImageUri = (url?: string | null) => {
  if (!url) return false;
  return url.startsWith("file://") || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:");
};

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, token, tasks, habits, signOut, updateUser } = useApp();
  const [emailInfo, setEmailInfo] = useState<string | null>(null);

  const userFullName = (
    user?.name ??
    [user?.firstName, user?.lastName].filter(Boolean).join(" ")
  ).trim() || user?.email || "TickTrack user";

  // Profile Edit
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [editName, setEditName] = useState(userFullName);
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatarUrl || "👤");

  const pickImageFromGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission Required", "Please allow access to your photo gallery to select a profile picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedAvatar(result.assets[0].uri);
    }
  };

  // Appearance Modal
  const [appearanceModal, setAppearanceModal] = useState(false);
  const themeConfig = getAppThemeConfig();
  const [selectedMode, setSelectedMode] = useState<"light" | "dark" | "system">(themeConfig.mode);
  const [selectedAccent, setSelectedAccent] = useState(themeConfig.accent.hex);

  // Date & Time Modal
  const [dateTimeModal, setDateTimeModal] = useState(false);
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");
  const [firstDayOfWeek, setFirstDayOfWeek] = useState<"sun" | "mon">("sun");
  const [timezoneMode, setTimezoneMode] = useState<"auto" | "ist">("ist");

  // Sounds & Notifications Modal
  const [soundsModal, setSoundsModal] = useState(false);
  const [taskReminders, setTaskReminders] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [hapticVibration, setHapticVibration] = useState(true);
  const [dailyDigest, setDailyDigest] = useState(true);

  // Widgets Modal
  const [widgetsModal, setWidgetsModal] = useState(false);
  const [widgetStyle, setWidgetStyle] = useState<"compact" | "detailed">("compact");
  const [showCompletedInWidget, setShowCompletedInWidget] = useState(false);

  // AI Features Modal
  const [aiModal, setAiModal] = useState(false);
  const [aiBreakdown, setAiBreakdown] = useState(true);
  const [autoDateParsing, setAutoDateParsing] = useState(true);

  // General Settings Modal
  const [generalModal, setGeneralModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(true);
  const [defaultPriority, setDefaultPriority] = useState<"high" | "medium" | "low" | "none">("medium");

  // Tab Bar Modal
  const [tabBarModal, setTabBarModal] = useState(false);
  const [showFocusTab, setShowFocusTab] = useState(true);
  const [showHabitsTab, setShowHabitsTab] = useState(true);

  useEffect(() => {
    (async () => {
      const rawSaved = await storage.getItem<any>("ticktrack_app_preferences", null);
      const saved = typeof rawSaved === "string" ? JSON.parse(rawSaved) : rawSaved;
      if (saved) {
        if (saved.timeFormat) setTimeFormat(saved.timeFormat);
        if (saved.firstDayOfWeek) setFirstDayOfWeek(saved.firstDayOfWeek);
        if (saved.timezoneMode) setTimezoneMode(saved.timezoneMode);
        if (typeof saved.taskReminders === "boolean") setTaskReminders(saved.taskReminders);
        if (typeof saved.soundEffects === "boolean") setSoundEffects(saved.soundEffects);
        if (typeof saved.hapticVibration === "boolean") setHapticVibration(saved.hapticVibration);
        if (typeof saved.dailyDigest === "boolean") setDailyDigest(saved.dailyDigest);
        if (saved.widgetStyle) setWidgetStyle(saved.widgetStyle);
        if (typeof saved.showCompletedInWidget === "boolean") setShowCompletedInWidget(saved.showCompletedInWidget);
        if (typeof saved.aiBreakdown === "boolean") setAiBreakdown(saved.aiBreakdown);
        if (typeof saved.autoDateParsing === "boolean") setAutoDateParsing(saved.autoDateParsing);
        if (typeof saved.confirmDelete === "boolean") setConfirmDelete(saved.confirmDelete);
        if (saved.defaultPriority) setDefaultPriority(saved.defaultPriority);
        if (typeof saved.showFocusTab === "boolean") setShowFocusTab(saved.showFocusTab);
        if (typeof saved.showHabitsTab === "boolean") setShowHabitsTab(saved.showHabitsTab);
      }
    })();
  }, []);

  const savePrefs = (updated: any) => {
    void storage.setItem("ticktrack_app_preferences", JSON.stringify({
      timeFormat, firstDayOfWeek, timezoneMode,
      taskReminders, soundEffects, hapticVibration, dailyDigest,
      widgetStyle, showCompletedInWidget,
      aiBreakdown, autoDateParsing,
      confirmDelete, defaultPriority,
      showFocusTab, showHabitsTab,
      ...updated,
    }));
  };

  const updateTimeFormat = (val: "12h" | "24h") => { setTimeFormat(val); savePrefs({ timeFormat: val }); };
  const updateFirstDayOfWeek = (val: "sun" | "mon") => { setFirstDayOfWeek(val); savePrefs({ firstDayOfWeek: val }); };
  const updateTimezoneMode = (val: "auto" | "ist") => { setTimezoneMode(val); savePrefs({ timezoneMode: val }); };

  const updateTaskReminders = (val: boolean) => { setTaskReminders(val); savePrefs({ taskReminders: val }); };
  const updateSoundEffects = (val: boolean) => { setSoundEffects(val); savePrefs({ soundEffects: val }); };
  const updateHapticVibration = (val: boolean) => { setHapticVibration(val); savePrefs({ hapticVibration: val }); };
  const updateDailyDigest = (val: boolean) => { setDailyDigest(val); savePrefs({ dailyDigest: val }); };

  const updateWidgetStyle = (val: "compact" | "detailed") => { setWidgetStyle(val); savePrefs({ widgetStyle: val }); };
  const updateShowCompletedInWidget = (val: boolean) => { setShowCompletedInWidget(val); savePrefs({ showCompletedInWidget: val }); };

  const updateAiBreakdown = (val: boolean) => { setAiBreakdown(val); savePrefs({ aiBreakdown: val }); };
  const updateAutoDateParsing = (val: boolean) => { setAutoDateParsing(val); savePrefs({ autoDateParsing: val }); };

  const updateConfirmDelete = (val: boolean) => { setConfirmDelete(val); savePrefs({ confirmDelete: val }); };
  const updateDefaultPriority = (val: "high" | "medium" | "low" | "none") => { setDefaultPriority(val); savePrefs({ defaultPriority: val }); };

  const updateShowFocusTab = (val: boolean) => { setShowFocusTab(val); savePrefs({ showFocusTab: val }); };
  const updateShowHabitsTab = (val: boolean) => { setShowHabitsTab(val); savePrefs({ showHabitsTab: val }); };

  const level = 1 + Math.floor(tasks.filter((task) => task.completed).length / 5);
  const badgeCount = 1 + habits.reduce((total, habit) => total + (habit.streak >= 3 ? 1 : 0), 0);

  const handleSaveProfile = () => {
    updateUser({
      name: editName.trim() || userFullName,
      avatarUrl: selectedAvatar,
    });
    setEditProfileModal(false);
  };

  const handleThemeChange = (mode: "light" | "dark" | "system", accentHex?: string) => {
    setSelectedMode(mode);
    if (accentHex) setSelectedAccent(accentHex);
    setAppTheme(mode, accentHex || selectedAccent);
  };

  const showEmail = async () => {
    if (!token) {
      setEmailInfo("inbox-forward-preview@ticktrack.app");
      return;
    }
    try {
      const info = await api<{ forwarding_email: string }>("/inbox/email-info", {}, token);
      setEmailInfo(info.forwarding_email);
    } catch {
      setEmailInfo("inbox-forward-preview@ticktrack.app");
    }
  };

  const [signOutModal, setSignOutModal] = useState(false);

  const doSignOut = () => {
    setSignOutModal(true);
  };

  const handleConfirmSignOut = async () => {
    setSignOutModal(false);
    await signOut();
    router.replace("/");
  };

  const preferencesGroup: RowDef[] = [
    { key: "appearance", label: "Appearance & Theme", icon: "color-palette", color: colors.brandPrimary, onPress: () => setAppearanceModal(true) },
    { key: "date-time", label: "Date & Time", icon: "time", color: colors.brandPrimary, onPress: () => setDateTimeModal(true) },
    { key: "sounds", label: "Sounds & Notifications", icon: "musical-notes", color: colors.brandPrimary, onPress: () => setSoundsModal(true) },
    { key: "widgets", label: "Widgets", icon: "grid", color: colors.brandPrimary, onPress: () => setWidgetsModal(true) },
    { key: "ai", label: "AI Features", icon: "sparkles", color: colors.brandPrimary, onPress: () => setAiModal(true) },
    { key: "general", label: "General", icon: "list", color: colors.brandPrimary, onPress: () => setGeneralModal(true) },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 12, paddingBottom: 140 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Settings</Text>

        <Pressable
          testID="settings-profile"
          onPress={() => {
            setEditName(userFullName);
            setSelectedAvatar(user?.avatarUrl || "👤");
            setEditProfileModal(true);
          }}
          style={({ pressed }) => [styles.profileCard, pressed && styles.rowPressed]}
        >
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {isImageUri(user?.avatarUrl) ? (
                <Image source={{ uri: user!.avatarUrl }} style={{ width: 76, height: 76, borderRadius: 48 }} />
              ) : user?.avatarUrl ? (
                <Text style={{ fontSize: 22 }}>{user.avatarUrl}</Text>
              ) : (
                <Text style={styles.avatarText}>{(userFullName || "T").slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.crownBadge}><Ionicons name="star" size={12} color={colors.onWarning} /></View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{userFullName}</Text>
            <View style={styles.pillsRow}>
              <View style={[styles.levelPill, { backgroundColor: colors.success }]}>
                <Ionicons name="checkmark-circle" size={11} color={colors.onSuccess} />
                <Text style={styles.levelText}>Lv.{level}</Text>
              </View>
              <View style={[styles.levelPill, { backgroundColor: colors.surfaceInverse }]}>
                <Ionicons name="ribbon" size={11} color={colors.onSurfaceInverse} />
                <Text style={[styles.levelText, { color: colors.onSurfaceInverse }]}>{badgeCount} Badge</Text>
              </View>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>

        {/* Encouragement card */}
        {/* <View style={styles.encourageCard}>
          <View style={styles.encourageIcon}><Ionicons name="ribbon" size={22} color={colors.onWarning} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.encourageTitle}>You&apos;re doing great</Text>
            <Text style={styles.encourageCopy}>Every finished task is a small win. Keep the calm going.</Text>
          </View>
        </View> */}

        {/* Tab Bar card */}
        <View style={styles.card}>
          <SettingRow testID="row-tab-bar" icon="apps" iconBg={colors.brandPrimary} label="Tab Bar" onPress={() => setTabBarModal(true)} styles={styles} colors={colors} last />
        </View>

        {/* Preferences card */}
        <View style={styles.card}>
          {preferencesGroup.map((row, index) => (
            <SettingRow
              key={row.key}
              testID={`row-${row.key}`}
              icon={row.icon}
              iconBg={row.color}
              label={row.label}
              onPress={row.onPress ?? (() => {})}
              styles={styles}
              colors={colors}
              last={index === preferencesGroup.length - 1}
            />
          ))}
        </View>

        {/* Integrations card */}
        <View style={styles.card}>
          <SettingRow testID="row-integrations" icon="arrow-forward-circle" iconBg={colors.success} label="Integrations & Import" onPress={showEmail} styles={styles} colors={colors} last />
        </View>

        {/* Community card */}
        <View style={styles.card}>
          <SettingRow testID="row-recommend" icon="thumbs-up" iconBg={colors.warning} label="Recommend to Friends" onPress={() => void Linking.openURL("https://twitter.com/TickTrackApp")} styles={styles} colors={colors} />
          <SettingRow testID="row-help" icon="help-circle" iconBg={colors.warning} label="Help & Feedback" onPress={() => void Linking.openURL("https://help.ticktrack.com")} styles={styles} colors={colors} last />
        </View>

        {/* Tools card */}
        <View style={styles.card}>
          <SettingRow testID="row-focus" icon="timer" iconBg={colors.info} label="Focus timer" onPress={() => router.push("/(tabs)/focus")} styles={styles} colors={colors} />
          <SettingRow testID="row-habits" icon="leaf" iconBg={colors.success} label="Habit tracker" onPress={() => router.push("/(tabs)/habits")} styles={styles} colors={colors} last />
        </View>

        <Pressable testID="settings-sign-out" onPress={doSignOut} style={({ pressed }) => [styles.signOut, pressed && styles.rowPressed]}>
          <Ionicons name="log-out-outline" size={19} color={colors.error} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <Text style={styles.footerNote}>TickTrack · calm space for what matters</Text>
      </ScrollView>

      {/* Email Inbox Modal */}
      <Modal visible={Boolean(emailInfo)} animationType="fade" transparent onRequestClose={() => setEmailInfo(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.emailCard, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.emailIcon}><Ionicons name="mail-open-outline" size={24} color={colors.brandPrimary} /></View>
            <Text style={styles.modalTitle}>Your TickTrack inbox</Text>
            <Text style={styles.modalCopy}>Forward any email here and it becomes a task in your workspace.</Text>
            <View style={styles.emailAddress}>
              <Text selectable style={styles.emailText}>{emailInfo}</Text>
              <Ionicons name="copy-outline" size={18} color={colors.brandPrimary} />
            </View>
            <Pressable testID="email-open" onPress={() => { if (emailInfo) void Linking.openURL(`mailto:${emailInfo}`); }} style={styles.primaryButton}>
              <Text style={styles.primaryText}>Open email</Text>
              <Ionicons name="arrow-up-right" size={18} color={colors.onBrandPrimary} />
            </Pressable>
            <Pressable testID="email-done" onPress={() => setEmailInfo(null)} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={editProfileModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setEditProfileModal(false)}>
        <Pressable onPress={() => setEditProfileModal(false)} style={styles.modalBackdrop}>
          <Pressable onPress={() => { /* trap */ }} style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 24, 24) }]}>
            <View style={styles.modalHeaderIcon}><Ionicons name="person-outline" size={24} color={colors.brandPrimary} /></View>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Text style={styles.modalCopy}>Update your display name and email address.</Text>

            <View style={{ marginTop: 16, gap: 12 }}>
              <View>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Enter name"
                  placeholderTextColor={colors.muted}
                  style={styles.textInput}
                />
              </View>

              <View>
                <Text style={styles.inputLabel}>Profile Photo</Text>
                <View style={{ alignItems: "center", marginVertical: 12 }}>
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      backgroundColor: colors.surfaceSecondary,
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      borderWidth: 2,
                      borderColor: colors.brandPrimary,
                    }}
                  >
                    {isImageUri(selectedAvatar) ? (
                      <Image source={{ uri: selectedAvatar }} style={{ width: 80, height: 80, borderRadius: 40 }} />
                    ) : (
                      <Text style={{ fontSize: 30, fontWeight: "700", color: colors.brandPrimary }}>
                        {(editName || userFullName || "T").slice(0, 1).toUpperCase()}
                      </Text>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Pressable
                      testID="pick-avatar-gallery"
                      onPress={pickImageFromGallery}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 18,
                        backgroundColor: colors.brandPrimary + "18",
                      }}
                    >
                      <Ionicons name="image-outline" size={16} color={colors.brandPrimary} />
                      <Text style={{ color: colors.brandPrimary, fontSize: 13, fontWeight: "600" }}>
                        {isImageUri(selectedAvatar) ? "Change Photo" : "Upload Photo"}
                      </Text>
                    </Pressable>

                    {isImageUri(selectedAvatar) ? (
                      <Pressable
                        testID="remove-avatar-image"
                        onPress={() => setSelectedAvatar("")}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 18,
                          backgroundColor: colors.error + "15",
                        }}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                        <Text style={{ color: colors.error, fontSize: 13, fontWeight: "600" }}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>

              <View>
                <Text style={styles.inputLabel}>Email Address (Read-only)</Text>
                <TextInput
                  value={user?.email || "user@example.com"}
                  editable={false}
                  placeholder="Email address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={colors.muted}
                  style={[styles.textInput, { opacity: 0.65, backgroundColor: colors.surfaceSecondary }]}
                />
              </View>
            </View>

            <Pressable testID="save-profile" onPress={handleSaveProfile} style={[styles.primaryButton, { marginTop: 20 }]}>
              <Text style={styles.primaryText}>Save Profile</Text>
            </Pressable>
            <Pressable onPress={() => setEditProfileModal(false)} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Appearance & Theme Modal */}
      <Modal visible={appearanceModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setAppearanceModal(false)}>
        <Pressable onPress={() => setAppearanceModal(false)} style={styles.modalBackdrop}>
          <Pressable onPress={() => { /* trap */ }} style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 24, 24) }]}>
            <View style={styles.modalHeaderIcon}><Ionicons name="color-palette-outline" size={24} color={colors.brandPrimary} /></View>
            <Text style={styles.modalTitle}>Appearance & Theme</Text>
            <Text style={styles.modalCopy}>Choose your preferred theme mode and primary accent color.</Text>

            <Text style={styles.sectionHeaderTitle}>Theme Mode</Text>
            <View style={styles.segmentContainer}>
              {(["light", "dark", "system"] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => handleThemeChange(m)}
                  style={[
                    styles.segmentButton,
                    selectedMode === m && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                  ]}
                >
                  <Text style={{ color: selectedMode === m ? colors.brandPrimary : colors.muted, fontSize: 13, fontWeight: "600", textTransform: "capitalize" }}>
                    {m}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionHeaderTitle}>Primary Accent Color</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {ACCENT_COLORS.map((item) => {
                const isSelected = selectedAccent.toLowerCase() === item.hex.toLowerCase();
                return (
                  <Pressable
                    key={item.hex}
                    onPress={() => handleThemeChange(selectedMode, item.hex)}
                    style={{ alignItems: "center", width: "30%", marginBottom: 8 }}
                  >
                    <View
                      style={[
                        { width: 42, height: 42, borderRadius: 21, backgroundColor: item.hex, alignItems: "center", justifyContent: "center", marginBottom: 4 },
                        isSelected && { borderWidth: 3, borderColor: colors.onSurface },
                      ]}
                    >
                      {isSelected ? <Ionicons name="checkmark" size={20} color="#FFFFFF" /> : null}
                    </View>
                    <Text style={{ color: colors.onSurface, fontSize: 11, fontWeight: "500", textAlign: "center" }}>{item.name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={() => setAppearanceModal(false)} style={[styles.primaryButton, { marginTop: 16 }]}>
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Date & Time Modal */}
      <Modal visible={dateTimeModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setDateTimeModal(false)}>
        <Pressable onPress={() => setDateTimeModal(false)} style={styles.modalBackdrop}>
          <Pressable onPress={() => { /* trap */ }} style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 24, 24) }]}>
            <View style={styles.modalHeaderIcon}><Ionicons name="time-outline" size={24} color={colors.brandPrimary} /></View>
            <Text style={styles.modalTitle}>Date & Time Settings</Text>
            <Text style={styles.modalCopy}>Configure date formatting, time display, and timezone preferences.</Text>

            <Text style={styles.sectionHeaderTitle}>Time Format</Text>
            <View style={styles.segmentContainer}>
              <Pressable onPress={() => updateTimeFormat("12h")} style={[styles.segmentButton, timeFormat === "12h" && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={{ color: timeFormat === "12h" ? colors.brandPrimary : colors.muted, fontSize: 13, fontWeight: "600" }}>12-Hour (3:30 PM)</Text>
              </Pressable>
              <Pressable onPress={() => updateTimeFormat("24h")} style={[styles.segmentButton, timeFormat === "24h" && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={{ color: timeFormat === "24h" ? colors.brandPrimary : colors.muted, fontSize: 13, fontWeight: "600" }}>24-Hour (15:30)</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionHeaderTitle}>First Day of Week</Text>
            <View style={styles.segmentContainer}>
              <Pressable onPress={() => updateFirstDayOfWeek("sun")} style={[styles.segmentButton, firstDayOfWeek === "sun" && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={{ color: firstDayOfWeek === "sun" ? colors.brandPrimary : colors.muted, fontSize: 13, fontWeight: "600" }}>Sunday</Text>
              </Pressable>
              <Pressable onPress={() => updateFirstDayOfWeek("mon")} style={[styles.segmentButton, firstDayOfWeek === "mon" && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={{ color: firstDayOfWeek === "mon" ? colors.brandPrimary : colors.muted, fontSize: 13, fontWeight: "600" }}>Monday</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionHeaderTitle}>Timezone Mode</Text>
            <View style={styles.segmentContainer}>
              <Pressable onPress={() => updateTimezoneMode("ist")} style={[styles.segmentButton, timezoneMode === "ist" && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={{ color: timezoneMode === "ist" ? colors.brandPrimary : colors.muted, fontSize: 13, fontWeight: "600" }}>IST (Asia/Kolkata)</Text>
              </Pressable>
              <Pressable onPress={() => updateTimezoneMode("auto")} style={[styles.segmentButton, timezoneMode === "auto" && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={{ color: timezoneMode === "auto" ? colors.brandPrimary : colors.muted, fontSize: 13, fontWeight: "600" }}>Auto (Device Local)</Text>
              </Pressable>
            </View>

            <Pressable onPress={() => setDateTimeModal(false)} style={[styles.primaryButton, { marginTop: 20 }]}>
              <Text style={styles.primaryText}>Save Settings</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sounds & Notifications Modal */}
      <Modal visible={soundsModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setSoundsModal(false)}>
        <Pressable onPress={() => setSoundsModal(false)} style={styles.modalBackdrop}>
          <Pressable onPress={() => { /* trap */ }} style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 24, 24) }]}>
            <View style={styles.modalHeaderIcon}><Ionicons name="musical-notes-outline" size={24} color={colors.brandPrimary} /></View>
            <Text style={styles.modalTitle}>Sounds & Notifications</Text>
            <Text style={styles.modalCopy}>Manage task alerts, sound effects, and haptic feedback.</Text>

            <View style={{ marginTop: 14, gap: 12 }}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Task Reminders & Alerts</Text>
                  <Text style={styles.switchSub}>Push notifications for due tasks</Text>
                </View>
                <Switch value={taskReminders} onValueChange={updateTaskReminders} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Completion Sound Effects</Text>
                  <Text style={styles.switchSub}>Play pop sound when checking tasks</Text>
                </View>
                <Switch value={soundEffects} onValueChange={updateSoundEffects} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Haptic Feedback</Text>
                  <Text style={styles.switchSub}>Tactile vibration on gesture interactions</Text>
                </View>
                <Switch value={hapticVibration} onValueChange={updateHapticVibration} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Daily Morning Summary</Text>
                  <Text style={styles.switchSub}>Daily 9:00 AM overview of today&apos;s plan</Text>
                </View>
                <Switch value={dailyDigest} onValueChange={updateDailyDigest} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>
            </View>

            <Pressable onPress={() => setSoundsModal(false)} style={[styles.primaryButton, { marginTop: 20 }]}>
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Widgets Modal */}
      <Modal visible={widgetsModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setWidgetsModal(false)}>
        <Pressable onPress={() => setWidgetsModal(false)} style={styles.modalBackdrop}>
          <Pressable onPress={() => { /* trap */ }} style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 24, 24) }]}>
            <View style={styles.modalHeaderIcon}><Ionicons name="grid-outline" size={24} color={colors.brandPrimary} /></View>
            <Text style={styles.modalTitle}>Widget Preferences</Text>
            <Text style={styles.modalCopy}>Customize home screen widgets and glance view styles.</Text>

            <Text style={styles.sectionHeaderTitle}>Widget Layout Style</Text>
            <View style={styles.segmentContainer}>
              <Pressable onPress={() => updateWidgetStyle("compact")} style={[styles.segmentButton, widgetStyle === "compact" && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={{ color: widgetStyle === "compact" ? colors.brandPrimary : colors.muted, fontSize: 13, fontWeight: "600" }}>Compact List</Text>
              </Pressable>
              <Pressable onPress={() => updateWidgetStyle("detailed")} style={[styles.segmentButton, widgetStyle === "detailed" && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={{ color: widgetStyle === "detailed" ? colors.brandPrimary : colors.muted, fontSize: 13, fontWeight: "600" }}>Detailed Cards</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 14, gap: 12 }}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Show Completed Tasks</Text>
                  <Text style={styles.switchSub}>Include recently finished items on widget</Text>
                </View>
                <Switch value={showCompletedInWidget} onValueChange={updateShowCompletedInWidget} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>
            </View>

            <Pressable onPress={() => setWidgetsModal(false)} style={[styles.primaryButton, { marginTop: 20 }]}>
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* AI Features Modal */}
      <Modal visible={aiModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setAiModal(false)}>
        <Pressable onPress={() => setAiModal(false)} style={styles.modalBackdrop}>
          <Pressable onPress={() => { /* trap */ }} style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 24, 24) }]}>
            <View style={styles.modalHeaderIcon}><Ionicons name="sparkles-outline" size={24} color={colors.brandPrimary} /></View>
            <Text style={styles.modalTitle}>AI Features & Automation</Text>
            <Text style={styles.modalCopy}>Manage intelligent task parsing and breakdown assistants.</Text>

            <View style={{ marginTop: 14, gap: 12 }}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>AI Task Breakdown</Text>
                  <Text style={styles.switchSub}>Suggest sub-tasks for large goals</Text>
                </View>
                <Switch value={aiBreakdown} onValueChange={updateAiBreakdown} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Auto Date & Time Parsing</Text>
                  <Text style={styles.switchSub}>Extract &quot;Tomorrow 5pm&quot; from title text</Text>
                </View>
                <Switch value={autoDateParsing} onValueChange={updateAutoDateParsing} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>
            </View>

            <Pressable onPress={() => setAiModal(false)} style={[styles.primaryButton, { marginTop: 20 }]}>
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* General Settings Modal */}
      <Modal visible={generalModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setGeneralModal(false)}>
        <Pressable onPress={() => setGeneralModal(false)} style={styles.modalBackdrop}>
          <Pressable onPress={() => { /* trap */ }} style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 24, 24) }]}>
            <View style={styles.modalHeaderIcon}><Ionicons name="list-outline" size={24} color={colors.brandPrimary} /></View>
            <Text style={styles.modalTitle}>General Preferences</Text>
            <Text style={styles.modalCopy}>Manage default task behavior and deletion confirmations.</Text>

            <Text style={styles.sectionHeaderTitle}>Default Priority for New Tasks</Text>
            <View style={styles.segmentContainer}>
              {(["high", "medium", "low", "none"] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => updateDefaultPriority(p)}
                  style={[
                    styles.segmentButton,
                    defaultPriority === p && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                  ]}
                >
                  <Text style={{ color: defaultPriority === p ? colors.brandPrimary : colors.muted, fontSize: 12, fontWeight: "600", textTransform: "capitalize" }}>
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ marginTop: 14, gap: 12 }}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Confirm Before Task Delete</Text>
                  <Text style={styles.switchSub}>Show warning dialog when deleting items</Text>
                </View>
                <Switch value={confirmDelete} onValueChange={updateConfirmDelete} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>
            </View>

            <Pressable onPress={() => setGeneralModal(false)} style={[styles.primaryButton, { marginTop: 20 }]}>
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Tab Bar Settings Modal */}
      <Modal visible={tabBarModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setTabBarModal(false)}>
        <Pressable onPress={() => setTabBarModal(false)} style={styles.modalBackdrop}>
          <Pressable onPress={() => { /* trap */ }} style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 24, 24) }]}>
            <View style={styles.modalHeaderIcon}><Ionicons name="apps-outline" size={24} color={colors.brandPrimary} /></View>
            <Text style={styles.modalTitle}>Tab Bar Settings</Text>
            <Text style={styles.modalCopy}>Toggle visible navigation tabs on the bottom bar.</Text>

            <View style={{ marginTop: 14, gap: 12 }}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Focus Timer Tab</Text>
                  <Text style={styles.switchSub}>Show Pomodoro focus tab</Text>
                </View>
                <Switch value={showFocusTab} onValueChange={updateShowFocusTab} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Habit Tracker Tab</Text>
                  <Text style={styles.switchSub}>Show daily habit streak tab</Text>
                </View>
                <Switch value={showHabitsTab} onValueChange={updateShowHabitsTab} trackColor={{ false: colors.border, true: colors.brandPrimary }} />
              </View>
            </View>

            <Pressable onPress={() => setTabBarModal(false)} style={[styles.primaryButton, { marginTop: 20 }]}>
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmSignOutModal
        visible={signOutModal}
        onClose={() => setSignOutModal(false)}
        onConfirm={handleConfirmSignOut}
      />
    </View>
  );
}

function SettingRow({ testID, icon, iconBg, label, onPress, styles, colors, last }: { testID: string; icon: string; iconBg: string; label: string; onPress: () => void; styles: ReturnType<typeof useStyles>; colors: ReturnType<typeof useTheme>["colors"]; last?: boolean }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed, !last && styles.rowDivider]}>
      <View style={[styles.rowIcon, { backgroundColor: `${iconBg}22` }]}>
        <Ionicons name={icon} size={18} color={iconBg} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surfaceSecondary },
  content: { paddingHorizontal: 16 },
  pageTitle: { color: colors.onSurface, fontSize: 26, fontWeight: "700", marginBottom: 18, marginLeft: 4 },

  profileCard: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 8, paddingVertical: 12, marginBottom: 14 },
  avatarWrap: { position: "relative", width: 76, height: 76 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandPrimary, fontSize: 30, fontWeight: "700" },
  crownBadge: { position: "absolute", top: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surfaceSecondary },
  profileName: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
  pillsRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  levelPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  levelText: { color: colors.onSuccess, fontSize: 11, fontWeight: "700" },

  encourageCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 14 },
  encourageIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center" },
  encourageTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  encourageCopy: { color: colors.muted, fontSize: 12, marginTop: 3 },

  card: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: 14, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "500", flex: 1 },
  rowPressed: { opacity: 0.75 },

  signOut: { minHeight: 48, borderRadius: 14, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 12, borderWidth: 1, borderColor: colors.divider },
  signOutText: { color: colors.error, fontSize: 14, fontWeight: "500" },
  footerNote: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 18 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(28,30,36,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderRadius: 26, padding: 24, margin: 16 },
  modalHeaderIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emailCard: { backgroundColor: colors.surface, borderRadius: 26, padding: 24, margin: 16 },
  emailIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "600" },
  modalCopy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  emailAddress: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18 },
  emailText: { color: colors.onSurface, fontSize: 13, flex: 1 },
  primaryButton: { minHeight: 52, borderRadius: 16, backgroundColor: colors.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 18 },
  primaryText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "500" },
  cancelButton: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 6 },
  cancelText: { color: colors.brandPrimary, fontWeight: "500" },

  inputLabel: { color: colors.muted, fontSize: 12, fontWeight: "600", marginBottom: 6 },
  textInput: { minHeight: 48, borderRadius: 12, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, paddingHorizontal: 14, fontSize: 15, fontWeight: "600" },
  sectionHeaderTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "600", marginTop: 16, marginBottom: 8 },
  segmentContainer: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 3, gap: 4 },
  segmentButton: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 10 },

  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 4 },
  switchLabel: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  switchSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
}));
