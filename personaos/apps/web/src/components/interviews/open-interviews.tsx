"use client";

import Link from "next/link";
import type { Route } from "next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";

type OpenInterview = {
  id: string;
  status: string;
  currentStep: number;
  updatedAt: string;
  capture: {
    title: string | null;
    sourceType: string;
    description: string | null;
  };
};

export function OpenInterviews() {
  const interviews = useQuery({
    queryKey: ["open-interviews"],
    queryFn: () => apiFetch<OpenInterview[]>("/api/interviews?status=open"),
    retry: false
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Открытые интервью</CardTitle>
        <CardDescription>Новые, активные и незавершенные разговоры.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {interviews.isLoading ? (
          <p className="text-sm text-muted-foreground">Загружаю интервью...</p>
        ) : null}
        {(interviews.data ?? []).map((interview) => (
          <div
            key={interview.id}
            className="flex items-center justify-between gap-3 rounded-md border p-3"
          >
            <div>
              <p className="font-medium">
                {interview.capture.title || label(interview.capture.sourceType)}
              </p>
              <p className="text-sm text-muted-foreground">
                {label(interview.status)} · шаг {interview.currentStep + 1}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/interviews/${interview.id}` as Route}>Открыть</Link>
            </Button>
          </div>
        ))}
        {!interviews.isLoading && !interviews.data?.length ? (
          <p className="text-sm text-muted-foreground">Пока нет открытых интервью.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
