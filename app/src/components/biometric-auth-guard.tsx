import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  AppState,
  AppStateStatus,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { storage } from "../utils/storage";
import { useApp } from "../app-context";

const BIOMETRIC_KEY = "ticktrack_biometric_enabled";
const AUTO_LOCK_GRACE_PERIOD_MS = 60 * 1000; // 60 seconds grace period

type BiometricContextType = {
  isBiometricSupported: boolean;
  isBiometricEnabled: boolean;
  biometryTypeLabel: string;
  enableBiometrics: () => Promise<boolean>;
  disableBiometrics: () => Promise<void>;
  authenticate: () => Promise<boolean>;
};

const BiometricContext = createContext<BiometricContextType>({
  isBiometricSupported: false,
  isBiometricEnabled: false,
  biometryTypeLabel: "Biometrics",
  enableBiometrics: async () => false,
  disableBiometrics: async () => {},
  authenticate: async () => false,
});

export const useBiometrics = () => useContext(BiometricContext);

export function BiometricAuthProvider({ children }: { children: React.ReactNode }) {
  const { token, user, loading, signOut } = useApp();
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [biometryTypeLabel, setBiometryTypeLabel] = useState("Biometrics");
  const [isLocked, setIsLocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const isInitialMountRef = useRef(true);
  const backgroundTimeRef = useRef<number | null>(null);
  const lastAuthTimeRef = useRef<number>(Date.now());
  const isAuthenticatingRef = useRef<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const supported = hasHardware && isEnrolled;
        setIsBiometricSupported(supported);

        if (supported) {
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometryTypeLabel("Face ID");
          } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
            setBiometryTypeLabel("Fingerprint");
          } else {
            setBiometryTypeLabel("Biometrics");
          }
        }

        const savedEnabled = await storage.getItem<boolean>(BIOMETRIC_KEY, false);
        if (savedEnabled && supported) {
          setIsBiometricEnabled(true);
        }
      } catch (e) {
        console.warn("Biometric init check error:", e);
      }
    })();
  }, []);

  // When user is not authenticated or logs out, ensure the lock overlay is never active
  useEffect(() => {
    if (!token && isLocked) {
      setIsLocked(false);
      setAuthError(null);
    }
  }, [token, isLocked]);

  // Note: Do not auto-lock the app on launch or backgrounding.
  // Biometric authentication is exclusively used on the login screen after manual sign-out.

  const performAuth = async (): Promise<boolean> => {
    if (isAuthenticatingRef.current) return false;
    isAuthenticatingRef.current = true;
    setAuthError(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock TickTrack",
        fallbackLabel: "Use Device PIN",
        disableDeviceFallback: false,
        cancelLabel: "Cancel",
      });

      if (result.success) {
        lastAuthTimeRef.current = Date.now();
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setIsLocked(false);
        setAuthError(null);
        return true;
      } else {
        if ((result as any).error === "user_fallback") {
          void handleUsePassword();
          return false;
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setAuthError("Authentication cancelled or not recognized.");
        return false;
      }
    } catch (err: any) {
      setAuthError(err?.message || "Biometric authentication failed");
      return false;
    } finally {
      isAuthenticatingRef.current = false;
    }
  };

  const handleUsePassword = async () => {
    setIsLocked(false);
    setAuthError(null);
    if (user?.email) {
      await storage.setItem("ticktrack_last_email", user.email);
    }
    await signOut();
    router.replace("/");
  };

  const enableBiometrics = async (): Promise<boolean> => {
    const success = await performAuth();
    if (success) {
      lastAuthTimeRef.current = Date.now();
      setIsBiometricEnabled(true);
      await storage.setItem(BIOMETRIC_KEY, true);
      return true;
    }
    return false;
  };

  const disableBiometrics = async (): Promise<void> => {
    setIsBiometricEnabled(false);
    setIsLocked(false);
    await storage.setItem(BIOMETRIC_KEY, false);
  };

  return (
    <BiometricContext.Provider
      value={{
        isBiometricSupported,
        isBiometricEnabled,
        biometryTypeLabel,
        enableBiometrics,
        disableBiometrics,
        authenticate: performAuth,
      }}
    >
      {children}

      {/* Full-screen lock overlay if locked */}
      {isLocked ? (
        <View style={lockStyles.overlay}>
          <View style={lockStyles.content}>
            <View style={lockStyles.iconContainer}>
              <Image
                source={require("../../assets/images/ticktrack.png")}
                style={lockStyles.logo}
                resizeMode="contain"
              />
            </View>

            <Text style={lockStyles.title}>TickTrack is Locked</Text>
            <Text style={lockStyles.subtitle}>
              Authenticate with {biometryTypeLabel} to access your planner
            </Text>

            {authError ? (
              <Text style={lockStyles.errorText}>{authError}</Text>
            ) : null}

            <Pressable
              onPress={performAuth}
              style={({ pressed }) => [
                lockStyles.unlockBtn,
                pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons
                name={biometryTypeLabel === "Face ID" ? "scan-outline" : "finger-print-outline"}
                size={22}
                color="#06B6D4"
              />
              <Text style={lockStyles.unlockBtnText}>Unlock with {biometryTypeLabel}</Text>
            </Pressable>

            <Pressable
              testID="lock-use-password-btn"
              onPress={handleUsePassword}
              style={({ pressed }) => [
                lockStyles.usePasswordBtn,
                pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons name="key-outline" size={18} color="#94A3B8" />
              <Text style={lockStyles.usePasswordText}>Log in with Password</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </BiometricContext.Provider>
  );
}

const lockStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0B1120",
    zIndex: 99999,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    maxWidth: 340,
    width: "100%",
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: "#162032",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  logo: {
    width: 64,
    height: 64,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#F8FAFC",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  errorText: {
    fontSize: 13,
    color: "#EF4444",
    textAlign: "center",
    marginBottom: 20,
  },
  unlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#1E293B",
    borderWidth: 1.5,
    borderColor: "#06B6D4",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
  },
  unlockBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#F8FAFC",
  },
  usePasswordBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
    marginTop: 12,
  },
  usePasswordText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#94A3B8",
  },
});
