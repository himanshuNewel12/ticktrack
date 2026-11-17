// Records app crashes and errors to the backend (table AppCrashLog) so they can be read later
// without plugging a phone into a computer.
//
// What it catches:
//   JS_ERROR / fatal       uncaught JavaScript errors
//   UNHANDLED_REJECTION    promises that rejected with nobody listening
//   RENDER_CRASH           errors caught by the app-level ErrorBoundary
//   ABRUPT_EXIT            the last session was still in the foreground when the process died
//                          (native crash, out-of-memory kill, force stop)
//   BACKGROUND_KILL        the last session was in the background when the process died (Android
//                          reclaiming memory, or the user swiping the app away from recents)
//
// A native crash cannot run JavaScript, so it is detected on the next launch from a marker written
// whenever the app changes state. Reports that cannot be sent (offline, mid-crash) are kept on the
// device and retried on the next launch and the next time the app comes to the foreground.

import Constants from "expo-constants";
import { AppState, Platform } from "react-native";

import { buildUrl } from "../api";
import { storage } from "./storage";

export type CrashType = "JS_ERROR" | "RENDER_CRASH" | "UNHANDLED_REJECTION" | "ABRUPT_EXIT" | "BACKGROUND_KILL";

type CrashReport = {
  type: CrashType;
  fatal?: boolean;
  message: string;
  stack?: string;
  componentStack?: string;
  screen?: string;
  userId?: string;
  userEmail?: string;
  appVersion?: string;
  platform?: string;
  osVersion?: string;
  deviceBrand?: string;
  deviceModel?: string;
  extra?: Record<string, unknown>;
  occurredAt: string;
};

const QUEUE_KEY = "ticktrack_crash_queue";
const SESSION_KEY = "ticktrack_session_state";
const MAX_QUEUE = 20;
const MAX_REPORTS_PER_SESSION = 15; // a render loop must not flood the backend

let installed = false;
let sentThisSession = 0;
let currentScreen: string | undefined;
let currentUser: { id?: string; email?: string } = {};
let flushing = false;
// Set while the app has handed the screen to another Android activity (file picker, browser). If the
// process dies meanwhile, the next launch reports it, which pins the "restarts after picking a file /
// opening an image" problem on that step instead of leaving it a mystery.
let externalActivity: string | null = null;

export function setCrashScreen(screen: string | undefined) {
  currentScreen = screen;
}

export function setCrashUser(user: { id?: string; email?: string } | null) {
  currentUser = user ?? {};
}

/** Call right before launching the file picker / opening a file in another app. Cleared when the app is foregrounded again. */
export function markExternalActivity(label: string) {
  externalActivity = label;
  void writeSessionState(AppState.currentState === "active" ? "active" : "background");
}

function deviceInfo() {
  const c: any = Platform.constants ?? {};
  return {
    appVersion: Constants.expoConfig?.version,
    platform: Platform.OS,
    osVersion: Platform.OS === "android" ? String(c.Release ?? Platform.Version) : String(Platform.Version),
    deviceBrand: Platform.OS === "android" ? c.Brand : "Apple",
    deviceModel: Platform.OS === "android" ? c.Model : c.systemName,
  };
}

async function readQueue(): Promise<CrashReport[]> {
  try {
    const raw = await storage.getItem<string>(QUEUE_KEY, "");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: CrashReport[]) {
  try {
    await storage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    // Reporting must never throw.
  }
}

async function post(report: CrashReport): Promise<boolean> {
  try {
    const res = await fetch(buildUrl("/app-crash-logs"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(report),
    });
    // A 4xx means the backend will never accept this report, so drop it instead of retrying forever.
    return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429);
  } catch {
    return false;
  }
}

/** Sends any reports saved on the device. Safe to call often. */
export async function flushCrashQueue() {
  if (flushing) return;
  flushing = true;
  try {
    const queue = await readQueue();
    if (queue.length === 0) return;
    const remaining: CrashReport[] = [];
    for (const report of queue) {
      if (!(await post(report))) remaining.push(report);
    }
    await writeQueue(remaining);
  } finally {
    flushing = false;
  }
}

/** Saves the report on the device first (so a crash right after can't lose it), then tries to send it. */
export async function reportCrash(
  type: CrashType,
  error: unknown,
  opts: { fatal?: boolean; componentStack?: string; extra?: Record<string, unknown>; occurredAt?: string } = {},
) {
  try {
    if (sentThisSession >= MAX_REPORTS_PER_SESSION) return;
    sentThisSession += 1;

    const err = error as any;
    const message = String(err?.message ?? err ?? "Unknown error").slice(0, 2000);
    const report: CrashReport = {
      type,
      fatal: opts.fatal ?? false,
      message,
      stack: typeof err?.stack === "string" ? err.stack.slice(0, 12000) : undefined,
      componentStack: opts.componentStack?.slice(0, 6000),
      screen: currentScreen,
      userId: currentUser.id,
      userEmail: currentUser.email,
      ...deviceInfo(),
      extra: opts.extra,
      occurredAt: opts.occurredAt ?? new Date().toISOString(),
    };

    const queue = await readQueue();
    await writeQueue([...queue, report]);
    await flushCrashQueue();
  } catch {
    // Reporting must never throw.
  }
}

async function writeSessionState(state: "active" | "background") {
  try {
    await storage.setItem(
      SESSION_KEY,
      JSON.stringify({ state, at: new Date().toISOString(), screen: currentScreen ?? null, external: externalActivity }),
    );
  } catch {
    // ignore
  }
}

async function checkPreviousSession() {
  try {
    const raw = await storage.getItem<string>(SESSION_KEY, "");
    if (!raw) return; // first launch
    const prev = JSON.parse(raw) as { state?: string; at?: string; screen?: string | null; external?: string | null };
    if (prev.state === "active") {
      await reportCrash("ABRUPT_EXIT", new Error("Previous session ended while the app was in the foreground"), {
        fatal: true,
        occurredAt: prev.at,
        extra: { lastScreen: prev.screen ?? null, duringExternalActivity: prev.external ?? null },
      });
    } else if (prev.state === "background") {
      await reportCrash("BACKGROUND_KILL", new Error("Previous session ended while the app was in the background"), {
        occurredAt: prev.at,
        extra: {
          lastScreen: prev.screen ?? null,
          duringExternalActivity: prev.external ?? null,
          note: "Android memory kill, or the app was swiped away",
        },
      });
    }
  } catch {
    // ignore
  }
}

/** Call once, as early as possible (app/_layout.tsx, module scope). */
export function installCrashReporter() {
  if (installed) return;
  installed = true;

  // Uncaught JS errors. The original handler still runs afterwards, so behaviour (red screen in dev,
  // closing the app in release) is unchanged.
  try {
    const errorUtils = (globalThis as any).ErrorUtils;
    const original = errorUtils?.getGlobalHandler?.();
    errorUtils?.setGlobalHandler?.((error: unknown, isFatal?: boolean) => {
      void reportCrash("JS_ERROR", error, { fatal: Boolean(isFatal) });
      original?.(error, isFatal);
    });
  } catch {
    // ignore
  }

  // Unhandled promise rejections (Hermes).
  try {
    const hermes = (globalThis as any).HermesInternal;
    hermes?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id: number, rejection: unknown) => {
        void reportCrash("UNHANDLED_REJECTION", rejection);
      },
    });
  } catch {
    // ignore
  }

  // Session marker used to spot crashes JavaScript could not report.
  void checkPreviousSession().then(() => {
    void writeSessionState(AppState.currentState === "active" ? "active" : "background");
    void flushCrashQueue();
  });
  AppState.addEventListener("change", (next) => {
    if (next === "active") externalActivity = null;
    void writeSessionState(next === "active" ? "active" : "background");
    if (next === "active") void flushCrashQueue();
  });
}
