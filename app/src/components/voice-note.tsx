import { Ionicons } from "@expo/vector-icons";
import { requireOptionalNativeModule } from "expo";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, Linking, Modal, PanResponder, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { voiceNoteUrl } from "@/src/api";
import { useApp } from "@/src/app-context";
import { useTheme } from "@/src/theme";
import type { VoiceNote } from "@/src/types";

export const MAX_VOICE_SECONDS = 120;
const MIN_VOICE_SECONDS = 1;

// expo-audio is native-only. In Expo Go / dev builds made before it was added, importing it eagerly
// would crash the whole app, so load it only when the native side exists.
const audio: typeof import("expo-audio") | null = requireOptionalNativeModule("ExpoAudio")
  ? require("expo-audio")
  : null;

export const voiceNotesSupported = audio !== null;

const formatClock = (totalSeconds: number) => {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ── Animations ──────────────────────────────────────────────────────────────

// Looping value that eases between 0 and 1 while `active`, and rests at 0 otherwise.
function useLoop(active: boolean, duration: number, delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, duration, delay, value]);
  return value;
}

/** Ripple that expands and fades out behind the mic while it is recording. */
function PulseRing({ active, color, size, delay }: { active: boolean; color: string; size: number; delay: number }) {
  const t = useLoop(active, 700, delay);
  if (!active) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
      }}
    />
  );
}

/** Equalizer bars shown in place of the mic icon while recording. */
function WaveBars({ color, height }: { color: string; height: number }) {
  const a = useLoop(true, 320);
  const b = useLoop(true, 450, 90);
  const c = useLoop(true, 380, 180);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2.5, height }}>
      {[a, b, c, b].map((t, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height,
            borderRadius: 2,
            backgroundColor: color,
            transform: [{ scaleY: t.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
          }}
        />
      ))}
    </View>
  );
}

/** Blinking red dot beside the recording timer. */
function RecordingDot({ color }: { color: string }) {
  const t = useLoop(true, 500);
  return (
    <Animated.View
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: color,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] }),
      }}
    />
  );
}

// ── Recording ───────────────────────────────────────────────────────────────

type RecordButtonProps = {
  /** Called with the finished recording (local file, not yet uploaded). */
  onRecorded: (note: VoiceNote) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Push-to-talk recorder: hold the mic to record a real voice note, release to finish.
 * Unlike dictation, the audio itself is kept and played back later.
 */
export function VoiceRecordButton(props: RecordButtonProps) {
  return audio ? <VoiceRecordButtonInner {...props} /> : <VoiceRecordButtonUnavailable {...props} />;
}

function VoiceRecordButtonUnavailable({ size = 18, style, testID }: RecordButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() =>
        Alert.alert(
          "Voice notes not in this build",
          "Recording needs the TickTrack development/release build. It isn't available in Expo Go or in builds made before it was added. Rebuild with `npx expo run:android`."
        )
      }
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Voice note unavailable"
      style={[
        {
          width: size + 14,
          height: size + 14,
          borderRadius: (size + 14) / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.brandTertiary,
          opacity: 0.5,
        },
        style,
      ]}
      testID={testID}
    >
      <Ionicons name="mic-off" size={size} color={colors.muted} />
    </Pressable>
  );
}

function VoiceRecordButtonInner({ onRecorded, size = 18, style, testID }: RecordButtonProps) {
  const { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } = audio!;
  const { colors } = useTheme();

  // Speech-grade settings (mono AAC): a minute of speech stays well under the 5 MB upload cap.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, sampleRate: 22050, numberOfChannels: 1, bitRate: 48000 });
  const recorderState = useAudioRecorderState(recorder, 250);

  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  // Bumped on every press so a slow start (permission prompt, prepare) can tell it was released.
  const pressRef = useRef(0);
  const holdingRef = useRef(false);
  const recordingRef = useRef(false);
  const lockedRef = useRef(false);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef(0);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;
  // Finger travel while holding, drives the "slide to cancel" fade.
  const dragX = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  const setRec = (value: boolean) => {
    recordingRef.current = value;
    setRecording(value);
  };

  const resetGesture = () => {
    lockedRef.current = false;
    setLocked(false);
    dragX.setValue(0);
    dragY.setValue(0);
  };

  const clearLimitTimer = () => {
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    limitTimerRef.current = null;
  };

  const finish = async () => {
    clearLimitTimer();
    if (!recordingRef.current) return;
    setRec(false);
    resetGesture();
    const elapsedSec = (Date.now() - startedAtRef.current) / 1000;
    try {
      await recorder.stop();
    } catch {
      /* nothing was captured */
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = recorder.uri;
    if (!uri || elapsedSec < MIN_VOICE_SECONDS) {
      Alert.alert("Too short", "Press and hold the mic while you speak, then release.");
      return;
    }
    onRecordedRef.current({ uri, durationSec: Math.min(MAX_VOICE_SECONDS, Math.round(elapsedSec)) });
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  /** Throw the recording away (slide-to-cancel or the locked Cancel button). */
  const discard = async () => {
    clearLimitTimer();
    holdingRef.current = false;
    cancelledRef.current = true;
    const wasRecording = recordingRef.current;
    setRec(false);
    resetGesture();
    if (!wasRecording) return;
    await recorder.stop().catch(() => {});
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  };
  const discardRef = useRef(discard);
  discardRef.current = discard;

  const startHold = async () => {
    const press = ++pressRef.current;
    holdingRef.current = true;
    cancelledRef.current = false;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        holdingRef.current = false;
        Alert.alert(
          "Microphone access needed",
          "Allow microphone access in Settings to record voice notes.",
          [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      // A previous press may have left the recorder prepared; reset it first.
      await recorder.stop().catch(() => {});
      await recorder.prepareToRecordAsync();
      // Released/cancelled while the permission prompt or setup was running: don't start.
      if (!holdingRef.current || pressRef.current !== press) {
        await recorder.stop().catch(() => {});
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        return;
      }
      recorder.record();
      startedAtRef.current = Date.now();
      setRec(true);
      limitTimerRef.current = setTimeout(() => void finishRef.current(), MAX_VOICE_SECONDS * 1000);
    } catch (err: any) {
      holdingRef.current = false;
      setRec(false);
      resetGesture();
      await recorder.stop().catch(() => {});
      Alert.alert("Could not record", err?.message || "Could not start recording. Please try again.");
    }
  };
  const startHoldRef = useRef(startHold);
  startHoldRef.current = startHold;

  const CANCEL_DX = -90;
  const LOCK_DY = -70;

  // WhatsApp-style gesture: hold to record, slide left to cancel, slide up to lock hands-free.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragX.setValue(0);
        dragY.setValue(0);
        void startHoldRef.current();
      },
      onPanResponderMove: (_e, g) => {
        if (lockedRef.current || cancelledRef.current || !holdingRef.current) return;
        dragX.setValue(Math.min(0, g.dx));
        dragY.setValue(Math.max(LOCK_DY, Math.min(0, g.dy)));
        if (g.dx < CANCEL_DX) {
          void discardRef.current();
        } else if (g.dy < LOCK_DY && recordingRef.current) {
          lockedRef.current = true;
          setLocked(true);
          dragX.setValue(0);
          dragY.setValue(0);
        }
      },
      onPanResponderRelease: () => {
        if (lockedRef.current) return;
        holdingRef.current = false;
        if (recordingRef.current) void finishRef.current();
      },
      onPanResponderTerminate: () => {
        if (lockedRef.current) return;
        holdingRef.current = false;
        if (recordingRef.current) void finishRef.current();
      },
    })
  ).current;

  // Drop the recording if the field unmounts mid-hold.
  useEffect(() => {
    return () => {
      clearLimitTimer();
      holdingRef.current = false;
    };
  }, []);

  const box = size + 14;
  const elapsed = recording ? Math.max(recorderState.durationMillis / 1000, (Date.now() - startedAtRef.current) / 1000) : 0;

  // Overlay animation: bar/mic spring in, shrink out; lock hint follows the finger upward.
  const [overlay, setOverlay] = useState(false);
  const show = useRef(new Animated.Value(0)).current;
  const lockAnim = useRef(new Animated.Value(0)).current;
  const bob = useLoop(recording && !locked, 650);
  useEffect(() => {
    if (recording) {
      setOverlay(true);
      show.setValue(0);
      Animated.spring(show, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }).start();
    } else {
      Animated.timing(show, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setOverlay(false);
      });
    }
  }, [recording, show]);
  useEffect(() => {
    Animated.spring(lockAnim, { toValue: locked ? 1 : 0, friction: 6, tension: 80, useNativeDriver: true }).start();
  }, [locked, lockAnim]);

  const hintOpacity = dragX.interpolate({ inputRange: [CANCEL_DX, -20, 0], outputRange: [0.15, 0.8, 1], extrapolate: "clamp" });
  const hintShift = dragX.interpolate({ inputRange: [CANCEL_DX, 0], outputRange: [-24, 0], extrapolate: "clamp" });
  const barShift = show.interpolate({ inputRange: [0, 1], outputRange: [48, 0] });
  const micScale = Animated.multiply(show, lockAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }));
  const pillOpacity = Animated.multiply(show, lockAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }));
  const pillShift = show.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const pillScale = dragY.interpolate({ inputRange: [LOCK_DY, 0], outputRange: [1.18, 1], extrapolate: "clamp" });
  const chevronShift = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const MIC = 64;
  const MIC_RIGHT = 14;
  const BAR_BOTTOM = 26;
  const BAR_H = 56;
  const micBottom = BAR_BOTTOM + BAR_H / 2 - MIC / 2;
  return (
    <View style={[{ width: box, height: box, alignItems: "center", justifyContent: "center" }, style]}>
      <Modal transparent visible={overlay} animationType="none" statusBarTranslucent onRequestClose={() => void discard()}>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.25)", opacity: show }]}
          />
          {/* Lock hint, centred above the mic */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              right: MIC_RIGHT + (MIC - 46) / 2,
              bottom: micBottom + MIC + 14,
              width: 46,
              paddingVertical: 10,
              borderRadius: 23,
              alignItems: "center",
              gap: 6,
              backgroundColor: colors.surface,
              elevation: 6,
              opacity: pillOpacity,
              transform: [{ translateY: pillShift }, { scale: pillScale }],
            }}
          >
            <Ionicons name={locked ? "lock-closed" : "lock-open-outline"} size={20} color={colors.onSurface} />
            <Animated.View style={{ transform: [{ translateY: chevronShift }] }}>
              <Ionicons name="chevron-up" size={16} color={colors.muted} />
            </Animated.View>
          </Animated.View>
          {/* Recording bar */}
          <Animated.View
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: BAR_BOTTOM,
              height: BAR_H,
              borderRadius: BAR_H / 2,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 18,
              paddingRight: locked ? 8 : MIC + MIC_RIGHT + 4,
              gap: 10,
              backgroundColor: colors.surface,
              elevation: 8,
              opacity: show,
              transform: [{ translateY: barShift }],
            }}
          >
            <RecordingDot color={colors.error} />
            <Text style={{ color: colors.onSurface, fontSize: 17, fontWeight: "600", minWidth: 44 }}>{formatClock(elapsed)}</Text>
            {locked ? (
              <>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => void discard()}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel recording"
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 40 }}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                  <Text style={{ color: colors.error, fontSize: 14, fontWeight: "600" }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void finish()}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Send voice note"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.brandPrimary,
                  }}
                >
                  <Ionicons name="checkmark" size={24} color={colors.onBrandPrimary} />
                </Pressable>
              </>
            ) : (
              <Animated.View
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, opacity: hintOpacity, transform: [{ translateX: hintShift }] }}
              >
                <Ionicons name="chevron-back" size={16} color={colors.muted} />
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 15 }}>
                  Slide to cancel
                </Text>
              </Animated.View>
            )}
          </Animated.View>
          {/* Big mic that follows the finger while holding */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              right: MIC_RIGHT,
              bottom: micBottom,
              width: MIC,
              height: MIC,
              borderRadius: MIC / 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.error,
              elevation: 10,
              transform: [{ translateX: dragX }, { translateY: dragY }, { scale: micScale }],
            }}
          >
            <Ionicons name="mic" size={30} color={colors.onBrandPrimary} />
          </Animated.View>
        </View>
      </Modal>
      <PulseRing active={recording} color={colors.error} size={box} delay={0} />
      <PulseRing active={recording} color={colors.error} size={box} delay={350} />
      <View
        {...panResponder.panHandlers}
        hitSlop={8}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Hold to record a voice note"
        accessibilityHint="Press and hold while speaking, release to finish. Slide left to cancel, slide up to lock."
        style={{
          width: box,
          height: box,
          borderRadius: box / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: recording ? colors.error : colors.brandTertiary,
        }}
        testID={testID}
      >
        {recording ? (
          <WaveBars color={colors.onBrandPrimary} height={size * 0.75} />
        ) : (
          <Ionicons name="mic" size={size} color={colors.brandPrimary} />
        )}
      </View>
    </View>
  );
}

// ── Playback ────────────────────────────────────────────────────────────────

type PlayerProps = {
  note: VoiceNote;
  /** When set, shows a remove (x) button. */
  onRemove?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Play / pause bar for a voice note, whether it is still local or already stored on the server. */
export function VoiceNotePlayer(props: PlayerProps) {
  return audio ? <VoiceNotePlayerInner {...props} /> : null;
}

function VoiceNotePlayerInner({ note, onRemove, style, testID }: PlayerProps) {
  const { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } = audio!;
  const { colors } = useTheme();
  const { token } = useApp();

  const source = useMemo(
    () =>
      note.uri
        ? { uri: note.uri }
        : note.file
          ? { uri: voiceNoteUrl(note.file), headers: token ? { Authorization: `Bearer ${token}` } : undefined }
          : null,
    [note.uri, note.file, token]
  );
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const [failed, setFailed] = useState(false);

  // Ensure looping is disabled so voice notes play only once.
  useEffect(() => {
    try {
      player.loop = false;
    } catch {}
  }, [player]);

  // Pause and rewind once it has played through so the next tap replays from the start.
  useEffect(() => {
    if (status.didJustFinish) {
      try {
        player.pause();
      } catch {}
      try {
        void player.seekTo(0);
      } catch {}
    }
  }, [status.didJustFinish, player]);

  // Stop playback when unmounting.
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  const total = status.duration > 0 ? status.duration : note.durationSec;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  const toggle = async () => {
    try {
      if (status.playing) {
        player.pause();
        return;
      }
      setFailed(false);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      try {
        player.loop = false;
      } catch {}
      // If at the end or previously finished, seek back to start before playing
      if (status.didJustFinish || (total > 0 && status.currentTime >= total - 0.2)) {
        try {
          await player.seekTo(0);
        } catch {}
      }
      player.play();
    } catch {
      setFailed(true);
    }
  };

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 6,
          paddingLeft: 6,
          paddingRight: 12,
          borderRadius: 999,
          backgroundColor: colors.brandTertiary,
        },
        style,
      ]}
      testID={testID}
    >
      <Pressable
        onPress={toggle}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "Pause voice note" : "Play voice note"}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.brandPrimary,
        }}
      >
        <Ionicons
          name={status.playing ? "pause" : "play"}
          size={16}
          color={colors.onBrandPrimary}
          style={status.playing ? undefined : { marginLeft: 2 }}
        />
      </Pressable>
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.divider, overflow: "hidden" }}>
        <View style={{ width: `${progress * 100}%`, height: 4, backgroundColor: colors.brandPrimary }} />
      </View>
      <Text style={{ color: failed ? colors.error : colors.onBrandTertiary, fontSize: 12, fontWeight: "600" }}>
        {failed ? "Can't play" : status.playing || status.currentTime > 0 ? formatClock(status.currentTime) : formatClock(total)}
      </Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove voice note">
          <Ionicons name="close-circle" size={20} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
