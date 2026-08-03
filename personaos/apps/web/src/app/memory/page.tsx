import { AppShell } from "@/components/layout/app-shell";
import { MemoryList } from "@/components/memory/memory-list";

export default function MemoryPage() {
  return (
    <AppShell>
      <MemoryList />
    </AppShell>
  );
}
