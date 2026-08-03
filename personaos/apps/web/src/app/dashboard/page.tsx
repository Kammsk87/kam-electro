import { AppShell } from "@/components/layout/app-shell";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardSummary />
    </AppShell>
  );
}
