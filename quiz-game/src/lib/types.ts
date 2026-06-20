export type QuestionType = "text" | "image" | "audio" | "video";

export interface Question {
  id: string;
  category: string;
  round: string;
  difficulty: number;
  type: QuestionType;
  question: string;
  answer: string;
  mediaHint?: string;
  mediaUrl?: string;
  source?: string;
}

export interface Pack {
  id: string;
  name: string;
  createdAt: string;
  questionCount: number;
}

export interface PackDetail extends Pack {
  questions: Question[];
}

export interface TeamScore {
  name: string;
  score: number;
}

export interface GameResult {
  id: string;
  packId: string;
  packName: string;
  playedAt: string;
  teams: TeamScore[];
}

export type ControlMessage =
  | { type: "idle" }
  | { type: "round"; round: string; roundIndex: number; totalRounds: number }
  | { type: "question"; question: Question; index: number; total: number }
  | { type: "reveal"; answer: string }
  | { type: "timer-start"; durationSeconds: number; startedAt: number }
  | { type: "timer-stop" }
  | { type: "leaderboard"; teams: TeamScore[] }
  | { type: "final"; teams: TeamScore[] };

export const BROADCAST_CHANNEL_NAME = "quiz-1723-presenter";
