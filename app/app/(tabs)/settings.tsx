import { Ionicons as BaseIonicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState, useEffect, type ComponentType } from "react";
import { Alert, ColorValue, Image, Modal, Pressable, ScrollView, Text, View, TextInput, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";

import { useApp } from "@/src/app-context";
import { ConfirmSignOutModal } from "@/src/components/confirm-sign-out-modal";
import { ClockWidget } from "@/src/components/clock-widget";
import { useBiometrics } from "@/src/components/biometric-auth-guard";
import { storage } from "@/src/utils/storage";
import { markExternalActivity } from "@/src/utils/crash-reporter";
import { updateSoundPreferences } from "@/src/utils/sound";
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
  const { user, signOut, updateUser } = useApp();
  const {
    isBiometricSupported,
    isBiometricEnabled,
    biometryTypeLabel,
    enableBiometrics,
    disableBiometrics,
  } = useBiometrics();

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

    markExternalActivity("avatar-image-picker");
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

  // Sounds & Notifications Modal
  const [soundsModal, setSoundsModal] = useState(false);
  const [taskReminders, setTaskReminders] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [hapticVibration, setHapticVibration] = useState(true);
  const [dailyDigest, setDailyDigest] = useState(true);

  useEffect(() => {
    (async () => {
      const rawSaved = await storage.getItem<any>("ticktrack_app_preferences", null);
      const saved = typeof rawSaved === "string" ? JSON.parse(rawSaved) : rawSaved;
      if (saved) {
        let sound = soundEffects;
        let haptic = hapticVibration;
        if (typeof saved.taskReminders === "boolean") setTaskReminders(saved.taskReminders);
        if (typeof saved.soundEffects === "boolean") {
          sound = saved.soundEffects;
          setSoundEffects(saved.soundEffects);
        }
        if (typeof saved.hapticVibration === "boolean") {
          haptic = saved.hapticVibration;
          setHapticVibration(saved.hapticVibration);
        }
        if (typeof saved.dailyDigest === "boolean") setDailyDigest(saved.dailyDigest);
        updateSoundPreferences(sound, haptic);
      }
    })();
  }, []);

  const savePrefs = (updated: any) => {
    void storage.setItem("ticktrack_app_preferences", JSON.stringify({
      taskReminders,
      soundEffects,
      hapticVibration,
      dailyDigest,
      ...updated,
    }));
  };

  const updateTaskReminders = (val: boolean) => {
    setTaskReminders(val);
    savePrefs({ taskReminders: val });
  };
  const updateSoundEffects = (val: boolean) => {
    setSoundEffects(val);
    updateSoundPreferences(val, hapticVibration);
    savePrefs({ soundEffects: val });
  };
  const updateHapticVibration = (val: boolean) => {
    setHapticVibration(val);
    updateSoundPreferences(soundEffects, val);
    savePrefs({ hapticVibration: val });
  };
  const updateDailyDigest = (val: boolean) => {
    setDailyDigest(val);
    savePrefs({ dailyDigest: val });
  };

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
    { key: "sounds", label: "Sounds & Notifications", icon: "musical-notes", color: colors.brandPrimary, onPress: () => setSoundsModal(true) },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 12, paddingBottom: 140 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Settings</Text>

        {/* Profile Card */}
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
                <Image source={{ uri: user!.avatarUrl }} style={{ width: 76, height: 76, borderRadius: 38 }} />
              ) : user?.avatarUrl ? (
                <Text style={{ fontSize: 22 }}>{user.avatarUrl}</Text>
              ) : (
                <Text style={styles.avatarText}>{(userFullName || "T").slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName} numberOfLines={1}>{userFullName}</Text>
            {user?.email ? (
              <Text style={styles.profileEmail} numberOfLines={1}>{user.email}</Text>
            ) : null}
            {user?.role ? (
              <View style={styles.roleBadge}>
                <Ionicons name="shield-checkmark-outline" size={12} color={colors.brandPrimary} />
                <Text style={styles.roleBadgeText}>{user.role}</Text>
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>

        {/* Attendance & Clock In / Out Card */}
        <View style={{ marginBottom: 14 }}>
          <ClockWidget variant="card" />
        </View>

        {/* Security / Biometric Lock Card */}
        {isBiometricSupported ? (
          <View style={styles.card}>
            <View style={[styles.row, { paddingVertical: 12 }]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.brandPrimary }]}>
                <Ionicons
                  name={biometryTypeLabel === "Face ID" ? "scan" : "finger-print"}
                  size={18}
                  color="#FFFFFF"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Quick {biometryTypeLabel} Login</Text>
                <Text style={styles.switchSub}>
                  Use {biometryTypeLabel} to sign in quickly from the login screen
                </Text>
              </View>
              <Switch
                value={isBiometricEnabled}
                onValueChange={async (val) => {
                  if (val) {
                    await enableBiometrics();
                  } else {
                    await disableBiometrics();
                  }
                }}
                trackColor={{ false: colors.border, true: colors.brandPrimary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        ) : null}

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

        {/* Tools card */}
        <View style={styles.card}>
          <SettingRow testID="row-focus" icon="timer" iconBg={colors.info} label="Focus timer" onPress={() => router.push("/(tabs)/focus")} styles={styles} colors={colors} last />
        </View>

        {/* Sign Out */}
        <Pressable testID="settings-sign-out" onPress={doSignOut} style={({ pressed }) => [styles.signOut, pressed && styles.rowPressed]}>
          <Ionicons name="log-out-outline" size={19} color={colors.error} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <Text style={styles.footerNote}>TickTrack · Newel Planner</Text>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editProfileModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setEditProfileModal(false)}>
        <Pressable onPress={() => setEditProfileModal(false)} style={styles.modalBackdrop}>
          <Pressable onPress={() => { /* trap */ }} style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 24, 24) }]}>
            <View style={styles.modalHeaderIcon}><Ionicons name="person-outline" size={24} color={colors.brandPrimary} /></View>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Text style={styles.modalCopy}>Update your display name and profile picture.</Text>

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
  profileName: { color: colors.onSurface, fontSize: 19, fontWeight: "700" },
  profileEmail: { color: colors.muted, fontSize: 13, marginTop: 2 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
    backgroundColor: colors.brandPrimary + "15",
  },
  roleBadgeText: {
    color: colors.brandPrimary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },

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
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "600" },
  modalCopy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
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
