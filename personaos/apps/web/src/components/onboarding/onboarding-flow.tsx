"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label as translateLabel } from "@/lib/labels";

const topicOptions = [
  "бизнес",
  "жизнь",
  "психология поведения",
  "отношения",
  "юмор",
  "путешествия",
  "ошибки",
  "победы",
  "обучение",
  "предпринимательство"
];

const toneOptions = [
  "живой",
  "честный",
  "с сарказмом",
  "без инфоцыганства",
  "глубокий смысл без пафоса",
  "практичный",
  "предпринимательский"
];

const defaultPlatforms = [
  { platform: "TELEGRAM", label: "Telegram", priority: "PRIMARY" },
  { platform: "INSTAGRAM", label: "Instagram", priority: "PRIMARY" },
  { platform: "THREADS", label: "Threads", priority: "SECONDARY" },
  { platform: "VK", label: "VK", priority: "LOW" }
] as const;

type Platform = (typeof defaultPlatforms)[number]["platform"];
type Priority = "PRIMARY" | "SECONDARY" | "LOW";

type PlatformState = Record<
  Platform,
  {
    isActive: boolean;
    accountName: string;
    accountUrl: string;
    priority: Priority;
  }
>;

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [occupation, setOccupation] = useState("");
  const [topics, setTopics] = useState<string[]>(["бизнес", "жизнь", "предпринимательство"]);
  const [tone, setTone] = useState<string[]>(["честный", "без инфоцыганства", "практичный"]);
  const [sarcasmLevel, setSarcasmLevel] = useState(3);
  const [depthLevel, setDepthLevel] = useState(4);
  const [personalLevel, setPersonalLevel] = useState(3);
  const [expertiseLevel, setExpertiseLevel] = useState(4);
  const [preferredPostLength, setPreferredPostLength] = useState("MIXED");
  const [workspaceName, setWorkspaceName] = useState("Стенгазета");
  const [workspaceDescription, setWorkspaceDescription] = useState(
    "Личный бренд предпринимателя: бизнес, жизнь, психология, отношения, сарказм."
  );
  const [platforms, setPlatforms] = useState<PlatformState>({
    TELEGRAM: { isActive: true, accountName: "", accountUrl: "", priority: "PRIMARY" },
    INSTAGRAM: { isActive: true, accountName: "", accountUrl: "", priority: "PRIMARY" },
    THREADS: { isActive: true, accountName: "", accountUrl: "", priority: "SECONDARY" },
    VK: { isActive: false, accountName: "", accountUrl: "", priority: "LOW" }
  });

  const canContinue = useMemo(() => {
    if (step === 1)
      return name.trim().length >= 2 && bio.trim().length >= 2 && occupation.trim().length >= 2;
    if (step === 2) return topics.length > 0;
    if (step === 3) return tone.length > 0;
    if (step === 5)
      return workspaceName.trim().length >= 2 && workspaceDescription.trim().length >= 2;
    return true;
  }, [
    bio,
    name,
    occupation,
    step,
    tone.length,
    topics.length,
    workspaceDescription,
    workspaceName
  ]);

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function complete() {
    setError(null);
    setIsSubmitting(true);

    try {
      await apiFetch("/api/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({
          user: { name, bio, occupation },
          workspace: {
            name: workspaceName,
            description: workspaceDescription
          },
          authorProfile: {
            displayName: name,
            bio,
            positioning: `${occupation}. ${workspaceDescription}`,
            mainTopics: topics,
            forbiddenTopics: ["фальшивые истории", "инфоцыганство"],
            toneOfVoice: tone,
            sarcasmLevel,
            depthLevel,
            personalLevel,
            expertiseLevel,
            preferredPostLength,
            contentGoals: ["сохранять опыт", "развивать личный бренд", "публиковать честно"]
          },
          socialAccounts: defaultPlatforms.map(({ platform }) => ({
            platform,
            accountName: platforms[platform].accountName || null,
            accountUrl: platforms[platform].accountUrl || null,
            priority: platforms[platform].priority,
            isActive: platforms[platform].isActive,
            publishingEnabled: false,
            analyticsEnabled: false,
            notes: null
          }))
        })
      });

      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось завершить onboarding.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Шаг {step} из 5</p>
        <div className="mt-3 h-2 rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-accent transition-all"
            style={{ width: `${step * 20}%` }}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 && "Кто ты?"}
            {step === 2 && "О чем твой личный бренд?"}
            {step === 3 && "Как ты звучишь?"}
            {step === 4 && "Где публикуемся?"}
            {step === 5 && "Первое рабочее пространство"}
          </CardTitle>
          <CardDescription>
            {step === 1 && "PersonaOS начинает не с контент-плана, а с понимания человека."}
            {step === 2 && "Выбери темы, к которым твоя жизнь и опыт возвращаются чаще всего."}
            {step === 3 && "Настроим голос так, чтобы AI не сглаживал тебя до пустой правильности."}
            {step === 4 && "Площадки можно подключить позже. Сейчас важно задать приоритеты."}
            {step === 5 && "Это пространство станет домом для твоего авторского опыта."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 1 ? (
            <div className="space-y-4">
              <Field label="Имя" value={name} onChange={setName} placeholder="Александр" />
              <Field
                label="Краткое описание"
                value={bio}
                onChange={setBio}
                placeholder="Предприниматель, который пишет из жизни и бизнеса."
              />
              <Field
                label="Чем занимаешься"
                value={occupation}
                onChange={setOccupation}
                placeholder="Развиваю бизнес, команду и личный бренд."
              />
            </div>
          ) : null}

          {step === 2 ? (
            <ChipGrid
              values={topicOptions}
              selected={topics}
              onToggle={(value) => toggle(topics, value, setTopics)}
            />
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <ChipGrid
                values={toneOptions}
                selected={tone}
                onToggle={(value) => toggle(tone, value, setTone)}
              />
              <Slider label="Сарказм" value={sarcasmLevel} onChange={setSarcasmLevel} />
              <Slider label="Глубина" value={depthLevel} onChange={setDepthLevel} />
              <Slider label="Личное" value={personalLevel} onChange={setPersonalLevel} />
              <Slider label="Экспертность" value={expertiseLevel} onChange={setExpertiseLevel} />
              <label className="block space-y-2 text-sm">
                <span className="font-medium">Длина постов</span>
                <select
                  className="h-11 w-full rounded-md border bg-background px-3"
                  value={preferredPostLength}
                  onChange={(event) => setPreferredPostLength(event.target.value)}
                >
                  <option value="SHORT">Короткие</option>
                  <option value="MEDIUM">Средние</option>
                  <option value="LONG">Длинные</option>
                  <option value="MIXED">Смешанный ритм</option>
                </select>
              </label>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3">
              {defaultPlatforms.map(({ platform, label }) => (
                <div key={platform} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-3 font-medium">
                      <input
                        type="checkbox"
                        checked={platforms[platform].isActive}
                        onChange={(event) =>
                          setPlatforms((current) => ({
                            ...current,
                            [platform]: { ...current[platform], isActive: event.target.checked }
                          }))
                        }
                      />
                      {label}
                    </label>
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={platforms[platform].priority}
                      onChange={(event) =>
                        setPlatforms((current) => ({
                          ...current,
                          [platform]: {
                            ...current[platform],
                            priority: event.target.value as Priority
                          }
                        }))
                      }
                    >
                      <option value="PRIMARY">{translateLabel("PRIMARY")}</option>
                      <option value="SECONDARY">{translateLabel("SECONDARY")}</option>
                      <option value="LOW">{translateLabel("LOW")}</option>
                    </select>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      placeholder="@account"
                      value={platforms[platform].accountName}
                      onChange={(event) =>
                        setPlatforms((current) => ({
                          ...current,
                          [platform]: { ...current[platform], accountName: event.target.value }
                        }))
                      }
                    />
                    <input
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      placeholder="https://..."
                      value={platforms[platform].accountUrl}
                      onChange={(event) =>
                        setPlatforms((current) => ({
                          ...current,
                          [platform]: { ...current[platform], accountUrl: event.target.value }
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <Field
                label="Название workspace"
                value={workspaceName}
                onChange={setWorkspaceName}
                placeholder="Стенгазета"
              />
              <label className="block space-y-2 text-sm">
                <span className="font-medium">Описание</span>
                <textarea
                  className="min-h-28 w-full rounded-md border bg-background p-3 outline-none focus:ring-2 focus:ring-ring"
                  value={workspaceDescription}
                  onChange={(event) => setWorkspaceDescription(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <div className="flex justify-between pt-2">
            <Button
              variant="ghost"
              disabled={step === 1 || isSubmitting}
              onClick={() => setStep((current) => current - 1)}
            >
              Назад
            </Button>
            {step < 5 ? (
              <Button disabled={!canContinue} onClick={() => setStep((current) => current + 1)}>
                Продолжить
              </Button>
            ) : (
              <Button disabled={!canContinue || isSubmitting} onClick={complete}>
                {isSubmitting ? "Создаю..." : "Перейти в Dashboard"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="h-11 w-full rounded-md border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function ChipGrid({
  values,
  selected,
  onToggle
}: {
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => {
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            className={`rounded-full border px-3 py-2 text-sm transition ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:bg-secondary"
            }`}
          >
            {value}
          </button>
        );
      })}
    </div>
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
      <span className="flex items-center justify-between font-medium">
        {label}
        <span className="text-muted-foreground">{value}/5</span>
      </span>
      <input
        className="w-full"
        type="range"
        min={1}
        max={5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
