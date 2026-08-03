export type StoryStatus = "DRAFT" | "READY" | "ARCHIVED";

export type Story = {
  id: string;
  reflectionId: string;
  title: string | null;
  hook: string | null;
  context: string | null;
  conflict: string | null;
  insight: string | null;
  takeaway: string | null;
  status: StoryStatus;
  createdAt: string;
  updatedAt: string;
  reflection?: {
    id: string;
    status: string;
    capture?: {
      id: string;
      title: string | null;
      description: string | null;
      sourceType: string;
    };
  };
};

export const storyBlocks = [
  { key: "hook", label: "Зацепка", helper: "Первое напряжение: почему это стоит читать." },
  {
    key: "context",
    label: "Контекст",
    helper: "Что произошло и где читатель должен оказаться."
  },
  {
    key: "conflict",
    label: "Конфликт",
    helper: "Что было сложно, странно, болезненно или неожиданно."
  },
  { key: "insight", label: "Инсайт", helper: "Что автор понял, увидел или переосмыслил." },
  { key: "takeaway", label: "Вывод", helper: "Что читатель может забрать себе." }
] as const;

export type StoryBlockKey = (typeof storyBlocks)[number]["key"];
