import { DashboardShell } from "@/components/dashboard-shell";
import { RouteGuard } from "@/features/auth/route-guard";

export default function MeetingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard allowedRoles={["sales", "admin"]}>
      <DashboardShell variant="sales">{children}</DashboardShell>
    </RouteGuard>
  );
}
