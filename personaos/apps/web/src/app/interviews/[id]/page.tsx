import { InterviewPanel } from "@/components/interviews/interview-panel";
import { AppShell } from "@/components/layout/app-shell";

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AppShell>
      <InterviewPanel interviewId={id} />
    </AppShell>
  );
}
