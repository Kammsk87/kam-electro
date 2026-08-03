import { CaptureDetail } from "@/components/capture/capture-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function CaptureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AppShell>
      <CaptureDetail captureId={id} />
    </AppShell>
  );
}
