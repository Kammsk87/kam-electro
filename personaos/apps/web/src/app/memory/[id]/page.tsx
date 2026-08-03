import { AppShell } from "@/components/layout/app-shell";
import { MemoryDetail } from "@/components/memory/memory-detail";

export default async function MemoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <MemoryDetail memoryId={id} />
    </AppShell>
  );
}
