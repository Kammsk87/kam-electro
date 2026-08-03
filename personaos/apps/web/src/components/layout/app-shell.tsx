import Link from "next/link";
import type { Route } from "next";
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/layout/logout-button";

const navigation: Array<{ href: Route; label: string }> = [
  { href: "/dashboard", label: "Сегодня" },
  { href: "/capture", label: "Capture" },
  { href: "/capture/inbox" as Route, label: "Входящие" },
  { href: "/persona" as Route, label: "Persona DNA" },
  { href: "/stories", label: "Истории" },
  { href: "/drafts" as Route, label: "Черновики" },
  { href: "/publishing" as Route, label: "Публикации" },
  { href: "/integrations" as Route, label: "Интеграции" },
  { href: "/planner", label: "Планер" },
  { href: "/analytics" as Route, label: "Аналитика" },
  { href: "/memory", label: "Память" },
  { href: "/ai-memory" as Route, label: "AI-память" },
  { href: "/research" as Route, label: "Исследования" },
  { href: "/beta" as Route, label: "Бета" },
  { href: "/settings", label: "Настройки" }
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            PersonaOS
          </Link>
          <nav className="hidden max-w-4xl items-center gap-1 overflow-x-auto md:flex">
            {navigation.map((item) => (
              <Button key={item.href} asChild variant="ghost" size="sm">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/capture">Сохранить</Link>
            </Button>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
