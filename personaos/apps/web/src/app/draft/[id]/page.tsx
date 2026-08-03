import { DraftEditor } from "@/components/drafts/draft-editor";
import { AppShell } from "@/components/layout/app-shell";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <DraftEditor draftId={id} />
    </AppShell>
  );
}
