import { Platform } from "react-native";
import { parseTaskDate } from "./date-utils";
import type { Task } from "../types";

let Notifications: any = null;
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
 * Calculates the reminder Date for a task.
 * Default: 15 minutes before the task due date/time (Teams meeting style).
 */
export function calculateReminderTime(dueStr: string, reminderType: string = "15_mins_before"): Date | null {
  const parsed = parseTaskDate(dueStr);
  if (!parsed) return null;

  const targetDate = new Date(parsed);

  // If date-only string (no time component specified), default due time is 9:00 AM on due date
  if (!dueStr.includes("T")) {
    targetDate.setHours(9, 0, 0, 0);
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

  // Only schedule if the reminder time is in the future
  if (reminderTime.getTime() > Date.now()) {
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

      const triggerSeconds = Math.max(1, Math.floor((reminderDate.getTime() - Date.now()) / 1000));

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏰ Task Reminder: ${task.title}`,
          body: task.notes ? task.notes.slice(0, 100) : `Upcoming task due in 15 minutes!`,
          sound: "default",
          data: { taskId: task.id },
        },
        trigger: Platform.OS === "android"
          ? { channelId: "task-reminders", seconds: triggerSeconds }
          : { seconds: triggerSeconds },
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
