import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, usePathname } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { LogBox, Platform, StatusBar as RNStatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AppProvider } from "@/src/app-context";
import { BiometricAuthProvider } from "@/src/components/biometric-auth-guard";
import { useTheme } from "@/src/theme";

import * as SplashScreen from "expo-splash-screen";
import { installCrashReporter, setCrashScreen } from "@/src/utils/crash-reporter";

// Start recording crashes before anything else can fail.
installCrashReporter();

SplashScreen.preventAutoHideAsync().catch(() => {});

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

function RootLayoutNav() {
  const { scheme } = useTheme();
  const pathname = usePathname();
  useEffect(() => {
    setCrashScreen(pathname);
  }, [pathname]);

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {Platform.OS === "android" && (
        <RNStatusBar
          barStyle={scheme === "dark" ? "light-content" : "dark-content"}
          backgroundColor="transparent"
          translucent
        />
      )}
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  // One app level ErrorBoundary; a render crash shows a reload screen
  // instead of a blank app.
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <BiometricAuthProvider>
              <RootLayoutNav />
            </BiometricAuthProvider>
          </AppProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

