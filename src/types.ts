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
  actor?: { id: string; firstName?: string | null; lastName?: string | null; email?: string } | null;
  actorName?: string | null;
  fromStartAt?: string | null;
  fromEndAt?: string | null;
  toStartAt?: string | null;
  toEndAt?: string | null;
  remarks?: string | null;
  before?: any;
  after?: any;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  notes?: string;
  due_date?: string | null;
  priority: "low" | "medium" | "high" | "none" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  urgent?: boolean;
  important?: boolean;
  recurrence?: string;
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
  source?: string;
  completed: boolean;
  startAt?: string | null;
  endAt?: string | null;
  window?: string | null;
  postponeCount?: number;
  created_at?: string;
  createdAt?: string;
  createdById?: string | null;
  createdBy?: { id: string; firstName?: string | null; lastName?: string | null; email?: string; name?: string } | null;
  createdByName?: string | null;
  actions?: TaskAction[];
  auditLogs?: any[];
};

export type UpdateTaskPayload = {
  title?: string;
  notes?: string;
  due_date?: string | null;
  priority?: string;
  assigneeIds?: string[];
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