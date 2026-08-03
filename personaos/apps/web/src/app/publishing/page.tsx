import { AppShell } from "@/components/layout/app-shell";
import { PublicationList } from "@/components/publications/publication-list";

export default function PublishingPage() {
  return (
    <AppShell>
      <PublicationList />
    </AppShell>
  );
}
