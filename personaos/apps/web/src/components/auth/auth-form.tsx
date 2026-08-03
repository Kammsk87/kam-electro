"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignUp = mode === "sign-up";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      ...(isSignUp ? { name: String(formData.get("name") ?? "") } : {})
    };

    try {
      await apiFetch(isSignUp ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const nextRoute = (
        isSignUp ? "/onboarding" : searchParams.get("next") || "/dashboard"
      ) as Route;
      router.push(nextRoute);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Что-то пошло не так.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {isSignUp ? (
        <label className="block space-y-2 text-sm">
          <span className="font-medium">Имя</span>
          <input
            name="name"
            required
            minLength={2}
            className="h-11 w-full rounded-md border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
            placeholder="Александр"
          />
        </label>
      ) : null}
      <label className="block space-y-2 text-sm">
        <span className="font-medium">Email</span>
        <input
          name="email"
          required
          type="email"
          className="h-11 w-full rounded-md border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
          placeholder="you@example.com"
        />
      </label>
      <label className="block space-y-2 text-sm">
        <span className="font-medium">Пароль</span>
        <input
          name="password"
          required
          type="password"
          minLength={8}
          className="h-11 w-full rounded-md border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
          placeholder="Минимум 8 символов"
        />
      </label>
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <Button className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Сохраняю..." : isSignUp ? "Создать PersonaOS" : "Войти"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Уже есть аккаунт?" : "Еще нет аккаунта?"}{" "}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href={(isSignUp ? "/auth/sign-in" : "/auth/sign-up") as Route}
        >
          {isSignUp ? "Войти" : "Зарегистрироваться"}
        </Link>
      </p>
    </form>
  );
}
