import { AppShell } from "@/components/layout/app-shell";
import { DraftList } from "@/components/drafts/draft-list";

export default function DraftsPage() {
  return (
    <AppShell>
      <DraftList />
    </AppShell>
  );
}
