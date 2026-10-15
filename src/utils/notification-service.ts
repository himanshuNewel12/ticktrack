import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import { parseTaskDate, formatTaskDueDateDisplay } from "./date-utils";
import type { Task } from "../types";

export const isExpoGo =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export let Notifications: any = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require("expo-notifications");
    if (Notifications && typeof Notifications.setNotificationHandler === "function") {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    }
  } catch {
    Notifications = null;
  }
}

/**
 * Configure Android notification channel for high priority alerts & sounds.
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === "android" && Notifications?.setNotificationChannelAsync) {
    try {
      await Notifications.setNotificationChannelAsync("task-reminders", {
        name: "Task Reminders",
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#3B82F6",
        sound: "default",
      });
    } catch {}
  }
}

/**
 * Request notification permissions from the user.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web" || !Notifications) return false;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus === "granted") {
      await setupNotificationChannel();
    }
    return finalStatus === "granted";
  } catch {
    return false;
  }
}

/**
 * Request notification permissions and register for an Expo Push Token.
 * Returns the token string (ExponentPushToken[...]) if successful.
 * Remote push notifications require a development build or standalone build in SDK 53+.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "web" || isExpoGo) {
    if (isExpoGo) {
      console.log(
        "[PushNotifications] Expo Go does not support remote push notifications in SDK 53+. " +
        "Remote push notifications will activate in development / standalone builds."
      );
    }
    return null;
  }

  try {
    if (!Notifications) return null;

    await setupNotificationChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId ??
      "2512b94e-a398-44b6-9c8b-274432555fd7";

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const pushToken = tokenResponse?.data;
    return pushToken || null;
  } catch (error) {
    console.warn("Could not register for push notifications:", error);
    return null;
  }
}

/**
 * Formats a user-friendly reminder description based on due time and reminder offset.
 */
export function getReminderDescription(reminderType: string, dueStr: string): string {
  const normType = (reminderType || "").toLowerCase();
  const dueDisplay = formatTaskDueDateDisplay(dueStr);

  if (normType === "on_due") {
    return dueDisplay ? `Task is due now! (${dueDisplay})` : "Task is due now!";
  }
  if (normType.includes("1_hour") || normType.includes("1hour")) {
    return dueDisplay ? `Upcoming in 1 hour (${dueDisplay})` : "Upcoming task due in 1 hour!";
  }
  if (normType.includes("1_day") || normType.includes("1day")) {
    return dueDisplay ? `Upcoming tomorrow (${dueDisplay})` : "Upcoming task due tomorrow!";
  }
  if (normType.includes("3_day") || normType.includes("3day")) {
    return dueDisplay ? `Upcoming in 3 days (${dueDisplay})` : "Upcoming task due in 3 days!";
  }
  return dueDisplay ? `Upcoming in 15 minutes (${dueDisplay})` : "Upcoming task due in 15 minutes!";
}

/**
 * Calculates the reminder Date for a task.
 * Default: 15 minutes before the task due date/time (Teams meeting style).
 */
export function calculateReminderTime(dueStr: string, reminderType: string = "15_mins_before"): Date | null {
  const parsed = parseTaskDate(dueStr);
  if (!parsed) return null;

  const targetDate = new Date(parsed);

  // If date-only string (no time component specified), default due time is end of workday (18:00)
  // or if today and it's already evening, 21:00
  if (!dueStr.includes("T")) {
    const now = new Date();
    if (parsed.toDateString() === now.toDateString() && now.getHours() >= 17) {
      targetDate.setHours(21, 0, 0, 0);
    } else {
      targetDate.setHours(18, 0, 0, 0);
    }
  }

  const normType = (reminderType || "").toLowerCase();
  const offsetMinutes =
    normType.includes("1_hour") || normType.includes("1hour")
      ? 60
      : normType.includes("1_day") || normType.includes("1day")
      ? 1440
      : normType.includes("3_day") || normType.includes("3day")
      ? 4320
      : normType === "on_due"
      ? 0
      : 15; // default 15 minutes before

  const reminderTime = new Date(targetDate.getTime() - offsetMinutes * 60 * 1000);

  // Only schedule if the reminder time is in the future (at least 15 seconds ahead)
  // This prevents past or immediate tasks from accidentally firing notification upon creation
  if (reminderTime.getTime() > Date.now() + 15000) {
    return reminderTime;
  }

  return null;
}

/**
 * Schedule local mobile reminder notification for a task (15m before due date/time or custom).
 */
export async function scheduleTaskNotification(task: Task): Promise<string[] | null> {
  if (Platform.OS === "web" || !Notifications || !task.due_date || task.completed) return null;

  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return null;

    // Cancel existing scheduled notifications for this task first to avoid duplicates
    await cancelTaskNotification(task.id);

    const reminderTypes = task.reminders && task.reminders.length > 0 ? task.reminders : ["15_mins_before"];
    const scheduledIds: string[] = [];

    for (const reminderType of reminderTypes) {
      const reminderDate = calculateReminderTime(task.due_date, reminderType);
      if (!reminderDate) continue;

      const timingDesc = getReminderDescription(reminderType, task.due_date);
      const bodyText = task.notes && task.notes.trim()
        ? `${timingDesc}\n${task.notes.trim().slice(0, 100)}`
        : timingDesc;

      // In expo-notifications SDK 50+, use SchedulableTriggerInputTypes.DATE to avoid immediate trigger
      const triggerInput = {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
        channelId: "task-reminders",
      };

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏰ Task Reminder: ${task.title}`,
          body: bodyText,
          sound: "default",
          data: { taskId: task.id },
        },
        trigger: triggerInput,
      });

      if (notificationId) {
        scheduledIds.push(notificationId);
      }
    }

    return scheduledIds.length > 0 ? scheduledIds : null;
  } catch (err) {
    console.warn("Failed to schedule notification:", err);
  }

  return null;
}

/**
 * Auto-sync notifications for all active upcoming tasks (deduplicated).
 */
export async function syncAllTaskNotifications(tasks: Task[]): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  try {
    const hasPerm = await requestNotificationPermissions();
    if (!hasPerm) return;

    const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    const alreadyScheduledTaskIds = new Set<string>();

    for (const item of scheduled) {
      const taskId = item.content?.data?.taskId;
      if (taskId) {
        alreadyScheduledTaskIds.add(taskId);
      }
    }

    for (const task of tasks) {
      if (task.completed || !task.due_date) {
        if (alreadyScheduledTaskIds.has(task.id)) {
          await cancelTaskNotification(task.id);
        }
      } else {
        // Only schedule if not already scheduled
        if (!alreadyScheduledTaskIds.has(task.id)) {
          await scheduleTaskNotification(task);
        }
      }
    }
  } catch {}
}

/**
 * Cancel notifications for completed or deleted tasks.
 */
export async function cancelTaskNotification(taskId: string): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      if (item.content?.data?.taskId === taskId) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  } catch {}
}

/**
 * Cancel all scheduled notifications (used on sign-out).
 */
export async function cancelAllTaskNotifications(): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  try {
    if (Notifications.cancelAllScheduledNotificationsAsync) {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  } catch {}
}
