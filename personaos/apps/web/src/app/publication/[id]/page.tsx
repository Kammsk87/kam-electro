import { AppShell } from "@/components/layout/app-shell";
import { PublicationEditor } from "@/components/publications/publication-editor";

export default async function PublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <PublicationEditor publicationId={id} />
    </AppShell>
  );
}
