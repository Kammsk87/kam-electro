import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { GameResult, Pack, PackDetail, Question, TeamScore } from "./types";

interface QuestionRow {
  id: string;
  category: string;
  round: string;
  difficulty: number;
  type: string;
  question: string;
  answer: string;
  media_hint: string | null;
  media_url: string | null;
  source: string | null;
}

function rowToQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    category: row.category,
    round: row.round,
    difficulty: row.difficulty,
    type: row.type as Question["type"],
    question: row.question,
    answer: row.answer,
    mediaHint: row.media_hint ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    source: row.source ?? undefined,
  };
}

export function listQuestions(): Question[] {
  const rows = getDb()
    .prepare("SELECT * FROM questions ORDER BY round, id")
    .all() as QuestionRow[];
  return rows.map(rowToQuestion);
}

export function createQuestion(input: Omit<Question, "id">): Question {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO questions (id, category, round, difficulty, type, question, answer, media_hint, media_url, source)
       VALUES (@id, @category, @round, @difficulty, @type, @question, @answer, @mediaHint, @mediaUrl, @source)`
    )
    .run({
      id,
      category: input.category,
      round: input.round,
      difficulty: input.difficulty,
      type: input.type,
      question: input.question,
      answer: input.answer,
      mediaHint: input.mediaHint ?? null,
      mediaUrl: input.mediaUrl ?? null,
      source: input.source ?? null,
    });
  return { id, ...input };
}

export function updateQuestion(id: string, input: Omit<Question, "id">): void {
  getDb()
    .prepare(
      `UPDATE questions SET category=@category, round=@round, difficulty=@difficulty,
       type=@type, question=@question, answer=@answer, media_hint=@mediaHint, media_url=@mediaUrl, source=@source
       WHERE id=@id`
    )
    .run({
      id,
      category: input.category,
      round: input.round,
      difficulty: input.difficulty,
      type: input.type,
      question: input.question,
      answer: input.answer,
      mediaHint: input.mediaHint ?? null,
      mediaUrl: input.mediaUrl ?? null,
      source: input.source ?? null,
    });
}

export function deleteQuestion(id: string): void {
  getDb().prepare("DELETE FROM questions WHERE id = ?").run(id);
}

interface PackRow {
  id: string;
  name: string;
  created_at: string;
  question_count: number;
}

export function listPacks(): Pack[] {
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.name, p.created_at, COUNT(pq.question_id) as question_count
       FROM packs p
       LEFT JOIN pack_questions pq ON pq.pack_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    )
    .all() as PackRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    questionCount: row.question_count,
  }));
}

export function createPack(name: string, questionIds: string[]): Pack {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const db = getDb();

  const insertPack = db.prepare(
    "INSERT INTO packs (id, name, created_at) VALUES (?, ?, ?)"
  );
  const insertLink = db.prepare(
    "INSERT INTO pack_questions (pack_id, question_id, position) VALUES (?, ?, ?)"
  );

  const run = db.transaction(() => {
    insertPack.run(id, name, createdAt);
    questionIds.forEach((questionId, index) => {
      insertLink.run(id, questionId, index);
    });
  });
  run();

  return { id, name, createdAt, questionCount: questionIds.length };
}

export function deletePack(id: string): void {
  getDb().prepare("DELETE FROM packs WHERE id = ?").run(id);
}

export function getPackDetail(id: string): PackDetail | null {
  const db = getDb();
  const packRow = db.prepare("SELECT * FROM packs WHERE id = ?").get(id) as
    | { id: string; name: string; created_at: string }
    | undefined;
  if (!packRow) return null;

  const rows = db
    .prepare(
      `SELECT q.* FROM pack_questions pq
       JOIN questions q ON q.id = pq.question_id
       WHERE pq.pack_id = ?
       ORDER BY pq.position ASC`
    )
    .all(id) as QuestionRow[];

  const questions = rows.map(rowToQuestion);
  return {
    id: packRow.id,
    name: packRow.name,
    createdAt: packRow.created_at,
    questionCount: questions.length,
    questions,
  };
}

interface GameRow {
  id: string;
  pack_id: string;
  pack_name: string;
  played_at: string;
  results_json: string;
}

export function saveGameResult(
  packId: string,
  packName: string,
  teams: TeamScore[]
): GameResult {
  const id = randomUUID();
  const playedAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO games (id, pack_id, pack_name, played_at, results_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, packId, packName, playedAt, JSON.stringify(teams));
  return { id, packId, packName, playedAt, teams };
}

export function listGames(): GameResult[] {
  const rows = getDb()
    .prepare("SELECT * FROM games ORDER BY played_at DESC")
    .all() as GameRow[];
  return rows.map((row) => ({
    id: row.id,
    packId: row.pack_id,
    packName: row.pack_name,
    playedAt: row.played_at,
    teams: JSON.parse(row.results_json) as TeamScore[],
  }));
}
