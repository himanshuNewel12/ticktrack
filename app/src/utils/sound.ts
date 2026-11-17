import * as Haptics from "expo-haptics";
import { storage } from "./storage";

let cachedSoundEnabled = true;
let cachedHapticsEnabled = true;

void storage.getItem<any>("ticktrack_app_preferences", null).then((raw) => {
  if (raw) {
    const prefs = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof prefs.soundEffects === "boolean") cachedSoundEnabled = prefs.soundEffects;
    if (typeof prefs.hapticVibration === "boolean") cachedHapticsEnabled = prefs.hapticVibration;
  }
});

export function updateSoundPreferences(sound: boolean, haptics: boolean) {
  cachedSoundEnabled = sound;
  cachedHapticsEnabled = haptics;
}

export function playPopSound() {
  if (cachedHapticsEnabled) {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }

  if (!cachedSoundEnabled) return;

  try {
    const AudioContextClass = typeof window !== "undefined" && (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1050, ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.07);
    }
  } catch {}
}
