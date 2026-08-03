"use client";

import Link from "next/link";
import type { Route } from "next";
import { useQuery } from "@tanstack/react-query";
import { Dna } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PersonaDnaStats } from "@/components/persona/persona-dna-stats";
import { apiFetch } from "@/lib/api";

type PersonaSummary = {
  completeness: number;
  signalCount: number;
  lastVersion: number | null;
};

export function PersonaDnaWidget() {
  const summary = useQuery({
    queryKey: ["persona-summary"],
    queryFn: () => apiFetch<PersonaSummary>("/api/persona/summary"),
    retry: false
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dna className="h-5 w-5" />
          Persona DNA
        </CardTitle>
        <CardDescription>Цифровой профиль автора для будущих модулей PersonaOS.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PersonaDnaStats summary={summary.data} />
        <Button asChild variant="outline" className="w-full">
          <Link href={"/persona" as Route}>Открыть Persona DNA</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
