import { CaptureInbox } from "@/components/capture/capture-inbox";
import { AppShell } from "@/components/layout/app-shell";

export default function CaptureInboxPage() {
  return (
    <AppShell>
      <div className="mb-6 max-w-3xl">
        <p className="text-sm font-medium text-muted-foreground">Входящие Capture</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Входящие для мыслей</h1>
        <p className="mt-3 text-muted-foreground">
          Все фото, голос, текст, видео, ссылки и локации попадают сюда до любого осмысления.
        </p>
      </div>
      <CaptureInbox />
    </AppShell>
  );
}
