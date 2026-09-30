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
  assignee?: { id: string; firstName?: string | null; lastName?: string | null; email?: string } | null;
  assigneeName?: string | null;
  source?: string;
  completed: boolean;
  created_at?: string;
  createdAt?: string;
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