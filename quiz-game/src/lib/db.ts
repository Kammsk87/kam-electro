import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Question } from "./types";

const DB_PATH = path.join(process.cwd(), "data", "db.sqlite");
const QUESTIONS_DIR = path.join(process.cwd(), "data", "questions");

declare global {
  var __quizDb: Database.Database | undefined;
}

function createConnection(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      round TEXT NOT NULL,
      difficulty INTEGER NOT NULL,
      type TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      media_hint TEXT,
      media_url TEXT,
      source TEXT
    );
    CREATE TABLE IF NOT EXISTS packs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pack_questions (
      pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      PRIMARY KEY (pack_id, question_id)
    );
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      pack_id TEXT REFERENCES packs(id) ON DELETE SET NULL,
      pack_name TEXT NOT NULL,
      played_at TEXT NOT NULL,
      results_json TEXT NOT NULL
    );
  `);
  seedQuestionsIfEmpty(db);
  return db;
}

function seedQuestionsIfEmpty(db: Database.Database) {
  const { count } = db
    .prepare("SELECT COUNT(*) as count FROM questions")
    .get() as { count: number };
  if (count > 0) return;
  if (!fs.existsSync(QUESTIONS_DIR)) return;

  const insert = db.prepare(`
    INSERT INTO questions (id, category, round, difficulty, type, question, answer, media_hint, media_url, source)
    VALUES (@id, @category, @round, @difficulty, @type, @question, @answer, @mediaHint, @mediaUrl, @source)
  `);

  const insertAll = db.transaction((questions: Question[]) => {
    for (const q of questions) {
      insert.run({
        id: q.id,
        category: q.category,
        round: q.round,
        difficulty: q.difficulty,
        type: q.type,
        question: q.question,
        answer: q.answer,
        mediaHint: q.mediaHint ?? null,
        mediaUrl: q.mediaUrl ?? null,
        source: q.source ?? null,
      });
    }
  });

  const files = fs
    .readdirSync(QUESTIONS_DIR)
    .filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const raw = fs.readFileSync(path.join(QUESTIONS_DIR, file), "utf-8");
    const questions = JSON.parse(raw) as Question[];
    insertAll(questions);
  }
}

export function getDb(): Database.Database {
  if (!global.__quizDb) {
    global.__quizDb = createConnection();
  }
  return global.__quizDb;
}
