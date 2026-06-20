"use client";

import { useEffect, useMemo, useState } from "react";
import type { Pack, Question, QuestionType } from "@/lib/types";

const EMPTY_FORM: Omit<Question, "id"> = {
  category: "",
  round: "",
  difficulty: 1,
  type: "text",
  question: "",
  answer: "",
  mediaHint: "",
  mediaUrl: "",
  source: "",
};

const QUESTION_TYPES: QuestionType[] = ["text", "image", "audio", "video"];

export default function AdminPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Omit<Question, "id">>(EMPTY_FORM);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [packName, setPackName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [questionsRes, packsRes] = await Promise.all([
      fetch("/api/questions"),
      fetch("/api/packs"),
    ]);
    setQuestions(await questionsRes.json());
    setPacks(await packsRes.json());
    setLoading(false);
  }

  const grouped = useMemo(() => {
    const byRound = new Map<string, Question[]>();
    for (const q of questions) {
      const list = byRound.get(q.round) ?? [];
      list.push(q);
      byRound.set(q.round, list);
    }
    return byRound;
  }, [questions]);

  function startEdit(question: Question) {
    setEditingId(question.id);
    setForm({
      category: question.category,
      round: question.round,
      difficulty: question.difficulty,
      type: question.type,
      question: question.question,
      answer: question.answer,
      mediaHint: question.mediaHint ?? "",
      mediaUrl: question.mediaUrl ?? "",
      source: question.source ?? "",
    });
  }

  function startNew() {
    setEditingId("new");
    setForm(EMPTY_FORM);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveQuestion() {
    if (!form.round.trim() || !form.question.trim() || !form.answer.trim()) {
      alert("Заполните раунд, вопрос и ответ");
      return;
    }
    if (editingId === "new") {
      await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else if (editingId) {
      await fetch(`/api/questions/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    cancelEdit();
    await loadAll();
  }

  async function deleteQuestion(id: string) {
    if (!confirm("Удалить вопрос?")) return;
    await fetch(`/api/questions/${id}`, { method: "DELETE" });
    setSelectedIds((ids) => ids.filter((existing) => existing !== id));
    await loadAll();
  }

  function toggleSelect(id: string) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id]
    );
  }

  async function createPack() {
    if (!packName.trim() || selectedIds.length === 0) {
      alert("Укажите название пака и выберите хотя бы один вопрос");
      return;
    }
    await fetch("/api/packs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: packName.trim(), questionIds: selectedIds }),
    });
    setPackName("");
    setSelectedIds([]);
    await loadAll();
  }

  async function deletePack(id: string) {
    if (!confirm("Удалить пак?")) return;
    await fetch(`/api/packs/${id}`, { method: "DELETE" });
    await loadAll();
  }

  if (loading) {
    return <div className="p-8 text-zinc-400">Загрузка…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-8">
      <header>
        <h1 className="text-2xl font-bold">Квиз 1723 — Админка</h1>
        <p className="text-sm text-zinc-500">
          База вопросов и сборка игровых паков. Запуск игры — на странице{" "}
          <a className="underline" href="/control">
            /control
          </a>
          .
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Вопросы ({questions.length})</h2>
          <button
            onClick={startNew}
            className="rounded bg-black px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
          >
            + Новый вопрос
          </button>
        </div>

        {editingId && (
          <div className="space-y-3 rounded border border-zinc-300 p-4">
            <div className="grid grid-cols-2 gap-3">
              <input
                className="rounded border px-2 py-1"
                placeholder="Раунд (например, Картинка)"
                value={form.round}
                onChange={(e) => setForm({ ...form, round: e.target.value })}
              />
              <input
                className="rounded border px-2 py-1"
                placeholder="Категория"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <select
                className="rounded border px-2 py-1"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as QuestionType })
                }
              >
                {QUESTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input
                className="rounded border px-2 py-1"
                type="number"
                min={1}
                max={3}
                placeholder="Сложность (1-3)"
                value={form.difficulty}
                onChange={(e) =>
                  setForm({ ...form, difficulty: Number(e.target.value) })
                }
              />
            </div>
            <textarea
              className="w-full rounded border px-2 py-1"
              placeholder="Текст вопроса"
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
            />
            <input
              className="w-full rounded border px-2 py-1"
              placeholder="Ответ"
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
            />
            <input
              className="w-full rounded border px-2 py-1"
              placeholder="Подсказка по медиа (для image/audio/video)"
              value={form.mediaHint}
              onChange={(e) => setForm({ ...form, mediaHint: e.target.value })}
            />
            <input
              className="w-full rounded border px-2 py-1"
              placeholder="Ссылка/путь к файлу, например /media/images/pictures-01.jpg"
              value={form.mediaUrl}
              onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })}
            />
            <input
              className="w-full rounded border px-2 py-1"
              placeholder="Источник"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
            <div className="flex gap-2">
              <button
                onClick={saveQuestion}
                className="rounded bg-black px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
              >
                Сохранить
              </button>
              <button
                onClick={cancelEdit}
                className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-100"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([round, items]) => (
            <div key={round}>
              <h3 className="mb-2 font-medium text-zinc-700">{round}</h3>
              <div className="space-y-1">
                {items.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between gap-3 rounded border border-zinc-200 px-3 py-2 text-sm"
                  >
                    <label className="flex flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(q.id)}
                        onChange={() => toggleSelect(q.id)}
                      />
                      <span className="text-zinc-400">[{q.type}]</span>
                      <span>{q.question}</span>
                    </label>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => startEdit(q)}
                        className="text-zinc-500 hover:text-black"
                      >
                        изменить
                      </button>
                      <button
                        onClick={() => deleteQuestion(q.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">
          Сборка пака ({selectedIds.length} вопросов выбрано)
        </h2>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-2 py-1"
            placeholder="Название пака (например, Пилотная игра №1)"
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
          />
          <button
            onClick={createPack}
            className="rounded bg-black px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
          >
            Создать пак
          </button>
        </div>

        <div className="space-y-2">
          {packs.map((pack) => (
            <div
              key={pack.id}
              className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 text-sm"
            >
              <span>
                {pack.name} — {pack.questionCount} вопросов
              </span>
              <button
                onClick={() => deletePack(pack.id)}
                className="text-red-500 hover:text-red-700"
              >
                удалить
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
