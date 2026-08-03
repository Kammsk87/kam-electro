export type AnalyticsSummary = {
  captures: number;
  reflections: number;
  stories: number;
  drafts: number;
  publications: number;
  streak: number;
  longestStreak: number;
};

export type HeatmapDay = {
  date: string;
  count: number;
};

export type ActivityReport = {
  title: string;
  since: string;
  until: string;
  totals: Record<string, number>;
  activeDays: number;
  totalActivity: number;
  highlights: string[];
  recent: Array<{ type: string; title: string; createdAt: string }>;
};
