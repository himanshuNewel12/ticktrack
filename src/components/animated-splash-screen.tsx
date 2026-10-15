import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SplashScreen from "expo-splash-screen";

const { width, height } = Dimensions.get("window");

interface AnimatedSplashScreenProps {
  isReady: boolean;
  onFinish?: () => void;
}

export function AnimatedSplashScreen({ isReady, onFinish }: AnimatedSplashScreenProps) {
  // Animation values
  const logoScale = useRef(new Animated.Value(0.4)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  const contentTranslateY = useRef(new Animated.Value(20)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  const screenOpacity = useRef(new Animated.Value(1)).current;
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Hide native splash screen immediately so our animated splash takes over smoothly
    SplashScreen.hideAsync().catch(() => {});

    // 1. Logo entrance (spring scale + fade-in)
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 600,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 500,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Continuous breathing aura pulse around the logo
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.45,
            duration: 1800,
            easing: Easing.out(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 1800,
            easing: Easing.out(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulseLoop.start();

    // 3. Dot loading pulse loop
    const animateDots = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot1, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(dot1, { toValue: 0.3, duration: 400, useNativeDriver: true }),
            Animated.timing(dot2, { toValue: 0.3, duration: 400, useNativeDriver: true }),
            Animated.timing(dot3, { toValue: 0.3, duration: 400, useNativeDriver: true }),
          ]),
        ])
      ).start();
    };
    animateDots();

    return () => {
      pulseLoop.stop();
    };
  }, []);

  // When app data is loaded (isReady is true), trigger smooth fade-out exit
  useEffect(() => {
    if (isReady) {
      // Hold splash for minimum pleasant duration (at least 900ms total feel)
      const timeout = setTimeout(() => {
        Animated.parallel([
          Animated.timing(screenOpacity, {
            toValue: 0,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 1.08,
            duration: 400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setHidden(true);
          onFinish?.();
        });
      }, 1700);

      return () => clearTimeout(timeout);
    }
  }, [isReady]);

  if (hidden) return null;

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0F1D" translucent />

      {/* Ambient background glow orbs */}
      <View style={styles.ambientGlowTop} />
      <View style={styles.ambientGlowBottom} />

      <View style={styles.centerBox}>
        {/* Pulsing ring aura */}
        <Animated.View
          style={[
            styles.pulseRing,
            {
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            },
          ]}
        />

        {/* Central Logo Mark Card */}
        <Animated.View
          style={[
            styles.logoCard,
            {
              transform: [{ scale: logoScale }],
              opacity: logoOpacity,
            },
          ]}
        >
          <View style={styles.innerIconGlow} />
          <Ionicons name="checkmark-done" size={48} color="#00D2B4" style={styles.logoIcon} />
        </Animated.View>

        {/* Brand Name & Tagline */}
        <Animated.View
          style={[
            styles.textBlock,
            {
              transform: [{ translateY: contentTranslateY }],
              opacity: contentOpacity,
            },
          ]}
        >
          <Text style={styles.brandTitle}>
            Tick<Text style={styles.brandAccent}>Track</Text>
          </Text>
          <Text style={styles.tagline}>Smart Tasks &amp; Workspace</Text>
        </Animated.View>
      </View>

      {/* Bottom Loading Dots & Footer */}
      <View style={styles.bottomArea}>
        <View style={styles.dotsRow}>
          <Animated.View style={[styles.dot, { opacity: dot1, transform: [{ scale: dot1 }] }]} />
          <Animated.View style={[styles.dot, { opacity: dot2, transform: [{ scale: dot2 }] }]} />
          <Animated.View style={[styles.dot, { opacity: dot3, transform: [{ scale: dot3 }] }]} />
        </View>
        <Text style={styles.footerNote}>NEWEL PLANNER REVAMP</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0A0F1D",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
  },
  ambientGlowTop: {
    position: "absolute",
    top: -height * 0.15,
    right: -width * 0.2,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: (width * 0.8) / 2,
    backgroundColor: "rgba(0, 210, 180, 0.08)",
  },
  ambientGlowBottom: {
    position: "absolute",
    bottom: -height * 0.15,
    left: -width * 0.2,
    width: width * 0.85,
    height: width * 0.85,
    borderRadius: (width * 0.85) / 2,
    backgroundColor: "rgba(56, 189, 248, 0.07)",
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: "rgba(0, 210, 180, 0.4)",
    backgroundColor: "rgba(0, 210, 180, 0.06)",
  },
  logoCard: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: "#111C33",
    borderWidth: 1.5,
    borderColor: "rgba(0, 210, 180, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#00D2B4",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  innerIconGlow: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0, 210, 180, 0.15)",
  },
  logoIcon: {
    marginTop: 2,
    marginLeft: 2,
  },
  textBlock: {
    alignItems: "center",
    marginTop: 24,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1.2,
  },
  brandAccent: {
    color: "#00D2B4",
  },
  tagline: {
    marginTop: 8,
    fontSize: 14,
    color: "#94A3B8",
    fontWeight: "500",
    letterSpacing: 0.8,
  },
  bottomArea: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 44 : 32,
    alignItems: "center",
    gap: 14,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00D2B4",
  },
  footerNote: {
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 2,
  },
});
