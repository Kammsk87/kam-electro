export type MemoryImportance = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type MemoryRelation = "RELATED" | "SIMILAR" | "FOLLOWUP" | "CONTRADICTION";

export type MemoryItem = {
  id: string;
  sourceType: "CAPTURE" | "REFLECTION" | "STORY";
  sourceId: string;
  title: string | null;
  summary: string | null;
  tags: string[];
  importance: MemoryImportance;
  createdAt: string;
  updatedAt: string;
  linksFrom?: Array<{ id: string; relation: MemoryRelation; toMemory: MemoryItem }>;
  linksTo?: Array<{ id: string; relation: MemoryRelation; fromMemory: MemoryItem }>;
};

export type MemorySummary = {
  count: number;
  recent: MemoryItem[];
};

export const memoryImportanceValues: MemoryImportance[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const memoryRelationValues: MemoryRelation[] = [
  "RELATED",
  "SIMILAR",
  "FOLLOWUP",
  "CONTRADICTION"
];
