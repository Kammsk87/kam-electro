import { AppShell } from "@/components/layout/app-shell";

export default function SettingsPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Настройки</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Здесь появятся настройки рабочего пространства, авторизации, приватности и интеграций.
      </p>
    </AppShell>
  );
}
