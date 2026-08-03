export type PlannerTaskCategory = "CAPTURE" | "REFLECTION" | "STORY" | "WRITING" | "PUBLISHING";
export type PlannerTaskStatus = "TODO" | "DONE" | "SKIPPED";
export type PlannerTaskPriority = "LOW" | "MEDIUM" | "HIGH";

export type PlannerTask = {
  id: string;
  title: string;
  description: string | null;
  category: PlannerTaskCategory;
  status: PlannerTaskStatus;
  priority: PlannerTaskPriority;
  dueDate: string;
  completedAt: string | null;
};

export type WeeklyGoal = {
  id: string;
  title: string;
  description: string | null;
  targetCount: number;
  completedCount: number;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
};

export type PlannerStreak = {
  current: number;
  longest: number;
  lastCompletedAt: string | null;
};

export type CompletionHistoryItem = {
  id: string;
  title: string;
  category: PlannerTaskCategory;
  completedAt: string;
};

export type TodayPlan = {
  tasks: PlannerTask[];
  weeklyGoals: WeeklyGoal[];
  streak: PlannerStreak;
  completionHistory: CompletionHistoryItem[];
};

export type PlannerSummary = {
  tasksToday: number;
  doneToday: number;
  openToday: number;
  weeklyGoals: number;
  streak: number;
};

export const plannerCategories: PlannerTaskCategory[] = [
  "CAPTURE",
  "REFLECTION",
  "STORY",
  "WRITING",
  "PUBLISHING"
];
