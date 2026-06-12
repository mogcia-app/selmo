import { DashboardShell } from "@/components/dashboard-shell";
import { RouteGuard } from "@/features/auth/route-guard";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard allowedRoles={["sales"]}>
      <DashboardShell variant="sales">{children}</DashboardShell>
    </RouteGuard>
  );
}
