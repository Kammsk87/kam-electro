"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";

type SocialConnection = {
  id: string;
  platform: string;
  status: string;
  accountName: string | null;
  errorMessage: string | null;
  updatedAt: string;
};

type IntegrationJob = {
  id: string;
  platform: string;
  type: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

const platforms = ["TELEGRAM", "INSTAGRAM", "THREADS", "VK"];

export function IntegrationsPanel() {
  const queryClient = useQueryClient();
  const connections = useQuery({
    queryKey: ["social-integrations"],
    queryFn: () => apiFetch<SocialConnection[]>("/api/social-integrations"),
    retry: false
  });
  const jobs = useQuery({
    queryKey: ["social-integration-jobs"],
    queryFn: () => apiFetch<IntegrationJob[]>("/api/social-integrations/jobs"),
    retry: false
  });
  const connect = useMutation({
    mutationFn: (platform: string) =>
      apiFetch(`/api/social-integrations/${platform}/callback`, {
        method: "POST",
        body: JSON.stringify({
          accountName: `${platform} manual`,
          externalUserId: `manual-${platform}`
        })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["social-integrations"] })
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Этап 19</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Социальные интеграции</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          OAuth-ready слой для Telegram, Instagram, Threads и VK. Реальная отправка включается после
          добавления platform credentials; сейчас подключения сохраняются безопасно.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {platforms.map((platform) => {
          const connection = connections.data?.find((item) => item.platform === platform);
          return (
            <Card key={platform}>
              <CardHeader>
                <CardTitle>{label(platform)}</CardTitle>
                <CardDescription>
                  {connection?.status === "CONNECTED" ? "Подключено" : "Не подключено"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {connection?.accountName ?? "Аккаунт еще не подключен."}
                </p>
                {connection?.errorMessage ? (
                  <p className="text-xs text-destructive">{connection.errorMessage}</p>
                ) : null}
                <Button
                  size="sm"
                  variant={connection ? "secondary" : "default"}
                  onClick={() => connect.mutate(platform)}
                >
                  {connection ? "Переподключить" : "Подключить"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Задачи интеграций</CardTitle>
          <CardDescription>
            Публикация, планирование, синхронизация черновиков и статусов.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(jobs.data ?? []).map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between rounded-md border p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {label(job.platform)} · {label(job.type)}
                </p>
                <p className="text-muted-foreground">{job.errorMessage ?? job.createdAt}</p>
              </div>
              <span className="rounded-full bg-secondary px-2 py-1 text-xs">
                {label(job.status)}
              </span>
            </div>
          ))}
          {!jobs.data?.length ? (
            <p className="text-sm text-muted-foreground">Задач пока нет.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
