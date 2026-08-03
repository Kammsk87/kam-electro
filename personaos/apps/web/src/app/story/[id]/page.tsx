import { AppShell } from "@/components/layout/app-shell";
import { StoryEditor } from "@/components/stories/story-editor";

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <StoryEditor storyId={id} />
    </AppShell>
  );
}
