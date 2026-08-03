"use client";

import Link from "next/link";
import type { Route } from "next";
import { FormEvent, useMemo, useState } from "react";
import { Dna, RefreshCw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";

type PersonaProfile = {
  id: string;
  summary: string | null;
  values: string[];
  beliefs: string[];
  themes: string[];
  tone: string[];
  humorStyle: string | null;
  sarcasmLevel: number;
  emotionalityLevel: number;
  riskAttitude: string | null;
  businessAttitude: string | null;
  peopleAttitude: string | null;
  moneyAttitude: string | null;
  familyAttitude: string | null;
  forbiddenTopics: string[];
  preferredFormats: string[];
};

type PersonaSignal = {
  id: string;
  sourceType: string;
  sourceId: string | null;
  signalType: string;
  value: string;
  confidence: number;
  weight: number;
  createdAt: string;
};

type PersonaVersion = {
  id: string;
  version: number;
  reason: string | null;
  createdAt: string;
};

const signalTypes = [
  "VALUE",
  "BELIEF",
  "THEME",
  "TONE",
  "HUMOR",
  "STYLE",
  "TOPIC",
  "EMOTION",
  "DECISION_PATTERN",
  "FORBIDDEN_TOPIC"
];

export function PersonaDnaPanel() {
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ["persona-profile"],
    queryFn: () => apiFetch<PersonaProfile>("/api/persona")
  });
  const signals = useQuery({
    queryKey: ["persona-signals"],
    queryFn: () => apiFetch<PersonaSignal[]>("/api/persona/signals")
  });
  const versions = useQuery({
    queryKey: ["persona-versions"],
    queryFn: () => apiFetch<PersonaVersion[]>("/api/persona/versions")
  });
  const [signalValue, setSignalValue] = useState("");
  const [signalType, setSignalType] = useState("THEME");
  const [confidence, setConfidence] = useState(0.7);
  const [weight, setWeight] = useState(1);
  const [versionReason, setVersionReason] = useState("Ручной снимок Persona DNA");

  const completeness = useMemo(() => {
    if (!profile.data) return 0;
    const fields = [
      profile.data.summary,
      profile.data.values.length,
      profile.data.beliefs.length,
      profile.data.themes.length,
      profile.data.tone.length,
      profile.data.humorStyle,
      profile.data.riskAttitude,
      profile.data.businessAttitude,
      profile.data.peopleAttitude,
      profile.data.moneyAttitude,
      profile.data.familyAttitude,
      profile.data.forbiddenTopics.length,
      profile.data.preferredFormats.length
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [profile.data]);

  const updateProfile = useMutation({
    mutationFn: (input: Partial<PersonaProfile>) =>
      apiFetch("/api/persona", {
        method: "PUT",
        body: JSON.stringify(input)
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["persona-profile"] })
  });

  const addSignal = useMutation({
    mutationFn: () =>
      apiFetch("/api/persona/signals", {
        method: "POST",
        body: JSON.stringify({
          sourceType: "MANUAL",
          signalType,
          value: signalValue,
          confidence,
          weight
        })
      }),
    onSuccess: async () => {
      setSignalValue("");
      await queryClient.invalidateQueries({ queryKey: ["persona-signals"] });
    }
  });

  const removeSignal = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/persona/signals/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["persona-signals"] })
  });

  const createVersion = useMutation({
    mutationFn: () =>
      apiFetch("/api/persona/versions", {
        method: "POST",
        body: JSON.stringify({ reason: versionReason })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["persona-versions"] })
  });

  const rebuild = useMutation({
    mutationFn: () => apiFetch("/api/persona/rebuild", { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["persona-profile"] });
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Persona DNA</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Цифровой профиль автора</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Это не Memory Engine и не AI. Сейчас Persona DNA редактируется вручную и собирает
            сигналы, которые позже будут питать Memory, Planner, Story и Writing.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={"/dashboard" as Route}>Назад в Dashboard</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{completeness}%</CardTitle>
            <CardDescription>Заполненность профиля</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{signals.data?.length ?? 0}</CardTitle>
            <CardDescription>Сигналы Persona</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{versions.data?.[0]?.version ?? "—"}</CardTitle>
            <CardDescription>Последняя версия</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {profile.data ? (
        <PersonaProfileForm
          key={profile.data.id}
          initialProfile={profile.data}
          isSaving={updateProfile.isPending}
          onSave={(input) => updateProfile.mutate(input)}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Профиль Persona</CardTitle>
            <CardDescription>Загружаю цифровой профиль автора...</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Сигналы</CardTitle>
          <CardDescription>
            Ручные и будущие автоматические сигналы, из которых собирается Persona DNA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_1fr_120px_120px_auto]">
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={signalType}
              onChange={(event) => setSignalType(event.target.value)}
            >
              {signalTypes.map((type) => (
                <option key={type} value={type}>
                  {label(type)}
                </option>
              ))}
            </select>
            <input
              className="h-10 rounded-md border bg-background px-3"
              placeholder="Значение сигнала"
              value={signalValue}
              onChange={(event) => setSignalValue(event.target.value)}
            />
            <input
              className="h-10 rounded-md border bg-background px-3"
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={confidence}
              onChange={(event) => setConfidence(Number(event.target.value))}
            />
            <input
              className="h-10 rounded-md border bg-background px-3"
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={weight}
              onChange={(event) => setWeight(Number(event.target.value))}
            />
            <Button
              onClick={() => addSignal.mutate()}
              disabled={!signalValue || addSignal.isPending}
            >
              Добавить
            </Button>
          </div>
          <div className="space-y-2">
            {(signals.data ?? []).map((signal) => (
              <div
                key={signal.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{signal.value}</p>
                  <p className="text-muted-foreground">
                    {label(signal.signalType)} · {label(signal.sourceType)} · уверенность{" "}
                    {signal.confidence} · вес {signal.weight}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeSignal.mutate(signal.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="secondary" onClick={() => rebuild.mutate()}>
            <RefreshCw className="h-4 w-4" />
            Пересобрать из сигналов
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Версии</CardTitle>
          <CardDescription>Снимки Persona DNA во времени.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <input
              className="h-10 flex-1 rounded-md border bg-background px-3"
              value={versionReason}
              onChange={(event) => setVersionReason(event.target.value)}
            />
            <Button onClick={() => createVersion.mutate()}>
              <Dna className="h-4 w-4" />
              Создать версию Persona
            </Button>
          </div>
          <div className="space-y-2">
            {(versions.data ?? []).map((version) => (
              <div key={version.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">Версия {version.version}</p>
                <p className="text-muted-foreground">
                  {version.reason || "Причина не указана"} ·{" "}
                  {new Date(version.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PersonaProfileForm({
  initialProfile,
  isSaving,
  onSave
}: {
  initialProfile: PersonaProfile;
  isSaving: boolean;
  onSave: (input: Partial<PersonaProfile>) => void;
}) {
  const [form, setForm] = useState<Partial<PersonaProfile>>(initialProfile);

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(form);
  }

  function updateArrayField(field: keyof PersonaProfile, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    }));
  }

  return (
    <form className="grid gap-4 lg:grid-cols-2" onSubmit={submitProfile}>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Краткое описание Persona</CardTitle>
          <CardDescription>Короткое описание того, как человек мыслит и звучит.</CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            className="min-h-28 w-full rounded-md border bg-background p-3"
            value={form.summary ?? ""}
            onChange={(event) =>
              setForm((current) => ({ ...current, summary: event.target.value }))
            }
          />
        </CardContent>
      </Card>

      <ArrayCard
        title="Ценности"
        value={form.values ?? []}
        onChange={(value) => updateArrayField("values", value)}
      />
      <ArrayCard
        title="Убеждения"
        value={form.beliefs ?? []}
        onChange={(value) => updateArrayField("beliefs", value)}
      />
      <ArrayCard
        title="Темы"
        value={form.themes ?? []}
        onChange={(value) => updateArrayField("themes", value)}
      />
      <ArrayCard
        title="Голос автора"
        value={form.tone ?? []}
        onChange={(value) => updateArrayField("tone", value)}
      />
      <ArrayCard
        title="Запрещенные темы"
        value={form.forbiddenTopics ?? []}
        onChange={(value) => updateArrayField("forbiddenTopics", value)}
      />
      <ArrayCard
        title="Любимые форматы"
        value={form.preferredFormats ?? []}
        onChange={(value) => updateArrayField("preferredFormats", value)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Юмор и сарказм</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            className="h-10 w-full rounded-md border bg-background px-3"
            value={form.humorStyle ?? ""}
            onChange={(event) =>
              setForm((current) => ({ ...current, humorStyle: event.target.value }))
            }
            placeholder="сухой сарказм..."
          />
          <Slider
            label="Сарказм"
            value={form.sarcasmLevel ?? 2}
            onChange={(value) => setForm((current) => ({ ...current, sarcasmLevel: value }))}
          />
          <Slider
            label="Эмоциональность"
            value={form.emotionalityLevel ?? 3}
            onChange={(value) => setForm((current) => ({ ...current, emotionalityLevel: value }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Отношения к важным темам</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(
            [
              "riskAttitude",
              "businessAttitude",
              "peopleAttitude",
              "moneyAttitude",
              "familyAttitude"
            ] as const
          ).map((field) => (
            <input
              key={field}
              className="h-10 w-full rounded-md border bg-background px-3"
              value={form[field] ?? ""}
              onChange={(event) =>
                setForm((current) => ({ ...current, [field]: event.target.value }))
              }
              placeholder={attitudeLabels[field]}
            />
          ))}
        </CardContent>
      </Card>

      <div className="lg:col-span-2">
        <Button type="submit" disabled={isSaving}>
          Сохранить профиль Persona
        </Button>
      </div>
    </form>
  );
}

const attitudeLabels = {
  riskAttitude: "Отношение к риску",
  businessAttitude: "Отношение к бизнесу",
  peopleAttitude: "Отношение к людям",
  moneyAttitude: "Отношение к деньгам",
  familyAttitude: "Отношение к семье"
} as const;

function ArrayCard({
  title,
  value,
  onChange
}: {
  title: string;
  value: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Через запятую</CardDescription>
      </CardHeader>
      <CardContent>
        <textarea
          className="min-h-24 w-full rounded-md border bg-background p-3"
          value={value.join(", ")}
          onChange={(event) => onChange(event.target.value)}
        />
      </CardContent>
    </Card>
  );
}

function Slider({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="flex justify-between">
        {label}
        <span className="text-muted-foreground">{value}/5</span>
      </span>
      <input
        className="w-full"
        min={1}
        max={5}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
