import { AppShell } from "@/components/layout/app-shell";
import { QuickCapture } from "@/components/capture/quick-capture";

export default function CapturePage() {
  return (
    <AppShell>
      <div className="mb-6 max-w-3xl">
        <p className="text-sm font-medium text-muted-foreground">Цикл Capture</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Сохрани момент за несколько секунд
        </h1>
        <p className="mt-3 text-muted-foreground">
          Это не идея, не пост и не память. Это сырой опыт, который не должен исчезнуть.
        </p>
      </div>
      <QuickCapture />
    </AppShell>
  );
}
