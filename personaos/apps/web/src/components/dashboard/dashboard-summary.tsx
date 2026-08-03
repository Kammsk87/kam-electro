"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsWidget } from "@/components/analytics/analytics-widget";
import { CaptureInbox } from "@/components/capture/capture-inbox";
import { DraftsWidget } from "@/components/drafts/drafts-widget";
import { OpenInterviews } from "@/components/interviews/open-interviews";
import { MemoryWidget } from "@/components/memory/memory-widget";
import { PersonaDnaWidget } from "@/components/persona/persona-dna-widget";
import { PlannerWidget } from "@/components/planner/planner-widget";
import { PublicationsWidget } from "@/components/publications/publications-widget";
import { StoriesWidget } from "@/components/stories/stories-widget";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";

type DashboardData = {
  user: {
    name: string | null;
    email: string;
    onboardingDone: boolean;
  };
  workspace: {
    name: string;
    description: string | null;
    authorProfile: {
      displayName: string;
      bio: string | null;
      positioning: string | null;
      mainTopics: string[];
      toneOfVoice: string[];
      sarcasmLevel: number;
      depthLevel: number;
      preferredPostLength: string;
    } | null;
    socialAccounts: Array<{
      id: string;
      platform: string;
      accountName: string | null;
      accountUrl: string | null;
      priority: string;
      isActive: boolean;
    }>;
  };
};

async function loadDashboard(): Promise<DashboardData> {
  const [session, workspace] = await Promise.all([
    apiFetch<{ user: DashboardData["user"] }>("/api/auth/me"),
    apiFetch<DashboardData["workspace"]>("/api/workspaces/active")
  ]);

  return {
    user: session.user,
    workspace
  };
}

export function DashboardSummary() {
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: loadDashboard,
    retry: false
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Собираю твой авторский контур...</p>;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Нужно завершить настройку</CardTitle>
          <CardDescription>PersonaOS пока не видит workspace и профиль автора.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push("/onboarding" as Route)}>Перейти к onboarding</Button>
        </CardContent>
      </Card>
    );
  }

  if (!data?.user.onboardingDone || !data.workspace.authorProfile) {
    router.push("/onboarding" as Route);
    return null;
  }

  const profile = data.workspace.authorProfile;
  const activeAccounts = data.workspace.socialAccounts.filter((account) => account.isActive);

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <p className="text-sm font-medium text-muted-foreground">
          Рабочее пространство: {data.workspace.name}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Привет, {profile.displayName}. Что сегодня нельзя потерять?
        </h1>
        <p className="mt-3 text-muted-foreground">{data.workspace.description}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Профиль автора</CardTitle>
            <CardDescription>{profile.positioning}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{profile.bio}</p>
            <div>
              <p className="mb-2 text-sm font-medium">Темы личного бренда</p>
              <TagList values={profile.mainTopics} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Голос автора</p>
              <TagList values={profile.toneOfVoice} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Голос</CardTitle>
            <CardDescription>Базовые настройки интонации</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Metric label="Сарказм" value={profile.sarcasmLevel} />
            <Metric label="Глубина" value={profile.depthLevel} />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Длина</span>
              <span className="font-medium">{label(profile.preferredPostLength)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Активные площадки</CardTitle>
            <CardDescription>Публикации и аналитика будут подключены позже.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{label(account.platform)}</p>
                  <p className="text-muted-foreground">
                    {account.accountName || "Аккаунт можно указать позже"}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2 py-1 text-xs">
                  {label(account.priority)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Сегодня</CardTitle>
            <CardDescription>Сегодняшние задания появятся после настройки планера.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/capture">Создать первую идею</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PersonaDnaWidget />
        <StoriesWidget />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DraftsWidget />
        <PublicationsWidget />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MemoryWidget />
        <PlannerWidget />
      </div>

      <AnalyticsWidget />

      <div className="grid gap-4 lg:grid-cols-4">
        <QuickLink
          href={"/integrations" as Route}
          title="Интеграции"
          description="Подключения соцсетей и задачи синхронизации."
        />
        <QuickLink
          href={"/ai-memory" as Route}
          title="AI-память"
          description="Смысловой поиск, похожие воспоминания и контекст."
        />
        <QuickLink
          href={"/research" as Route}
          title="Исследования"
          description="Темы, форматы, тренды и наблюдения за рынком."
        />
        <QuickLink
          href={"/beta" as Route}
          title="Бета-центр"
          description="Готовность, обратная связь, флаги и экспорт."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Сегодняшние Capture</CardTitle>
          <CardDescription>
            Последние материалы, которые ты сохранил до того, как они исчезли.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CaptureInbox compact />
        </CardContent>
      </Card>

      <OpenInterviews />
    </div>
  );
}

function TagList({ values }: { values: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className="rounded-full bg-secondary px-3 py-1 text-sm">
          {value}
        </span>
      ))}
    </div>
  );
}

function QuickLink({
  href,
  title,
  description
}: {
  href: Route;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="secondary" size="sm">
          <Link href={href}>Открыть</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}/5</span>
    </div>
  );
}
