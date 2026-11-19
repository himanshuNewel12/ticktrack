export type User = {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  role?: string;
  permissions?: string[];
  isReportingAuthority?: boolean;
  forwarding_email?: string;
};

export type AssignableUser = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  role?: { name: string } | string;
};

export type TaskAction = {
  id: string;
  type: "CREATED" | "POSTPONED" | "COMPLETED" | "CANCELLED" | "SERIES_CANCELLED" | "REMARK_ADDED" | "UPDATE" | "CREATE" | string;
  actorId?: string | null;
  actor?: { id: string; firstName?: string | null; lastName?: string | null; email?: string } | null;
  actorName?: string | null;
  fromStartAt?: string | null;
  fromEndAt?: string | null;
  toStartAt?: string | null;
  toEndAt?: string | null;
  remarks?: string | null;
  /** Voice-note remark, when one was recorded. */
  audio?: VoiceNote | null;
  attachments?: TaskAttachment[];
  before?: any;
  after?: any;
  createdAt: string;
};

/**
 * A voice note being attached in the UI: either freshly recorded (`uri`, not yet uploaded)
 * or already stored on the server (`file`).
 */
export type VoiceNote = { uri?: string; file?: string; durationSec: number };

/** A file stored in S3 and attached to a remark. */
export type TaskAttachment = { key: string; name: string; size: number; mimeType: string };

/** A file picked on the device, not uploaded yet. */
export type LocalAttachment = { uri: string; name: string; size: number; mimeType: string };

export type Task = {
  id: string;
  title: string;
  notes?: string;
  /** Voice-note description, when the activity has one. */
  descriptionAudio?: VoiceNote | null;
  due_date?: string | null;
  priority: "low" | "medium" | "high" | "none" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  urgent?: boolean;
  important?: boolean;
  recurrence?: string;
  recurrenceId?: string | null;
  recurrenceRule?: string;
  repeatDays?: number[];
  reminders?: string[];
  dismissed_reminders?: string[];
  tags?: string[];
  list_id?: string | null;
  projectId?: string | null;
  assigneeId?: string | null;
  assignee_id?: string | null;
  assigneeIds?: string[] | null;
  assignee?: { id: string; firstName?: string | null; lastName?: string | null; email?: string } | null;
  assignees?: { id: string; name: string; email?: string; avatarUrl?: string }[] | null;
  assigneeName?: string | null;
  informers?: { id: string; name: string; email?: string }[] | null;
  escalators?: { id: string; name: string; email?: string }[] | null;
  isEscalator?: boolean;
  source?: string;
  completed: boolean;
  status?: string;
  completedAt?: string | null;
  updatedAt?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  window?: string | null;
  postponeCount?: number;
  created_at?: string;
  createdAt?: string;
  createdById?: string | null;
  createdBy?: { id: string; firstName?: string | null; lastName?: string | null; email?: string; name?: string } | null;
  createdByName?: string | null;
  assignedById?: string | null;
  assignedByName?: string | null;
  actions?: TaskAction[];
  auditLogs?: any[];
};

export type UpdateTaskPayload = {
  title?: string;
  notes?: string;
  /** Newly recorded voice-note description (uploaded on save). */
  voice?: VoiceNote;
  /** Remove the existing voice-note description. */
  removeVoice?: boolean;
  due_date?: string | null;
  priority?: string;
  assigneeIds?: string[];
  informerIds?: string[];
  escalatorIds?: string[];
  recurrence?: string;
  repeatDays?: number[];
};

export type TaskList = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  system?: boolean;
  order: number;
  created_at: string;
};

export type Reminder = {
  task_id: string;
  title: string;
  due_date: string;
  reminder_key: string;
  trigger_at: string;
  fired: boolean;
};

export type Habit = {
  id: string;
  name: string;
  category: string;
  target: string;
  completed_today: boolean;
  streak: number;
};

export type CatalogHabit = { id: string; name: string; category: string };

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  metadata?: { entityType?: string; entityId?: string; link?: string } | null;
  createdAt: string;
};

export type Attendance = {
  id: string;
  userId: string;
  date: string;
  checkIn: string | null;
  checkInTimeZone: string | null;
  checkOut: string | null;
  checkOutTimeZone: string | null;
  status: string;
  remarks: string | null;
  isWfh: boolean;
  overtimeHours?: number;
  shiftId?: string | null;
  shift?: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
  } | null;
};
