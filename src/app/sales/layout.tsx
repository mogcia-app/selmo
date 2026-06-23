"use client";

import { usePathname } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { RouteGuard } from "@/features/auth/route-guard";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/sales/demo")) {
    return <DashboardShell variant="sales">{children}</DashboardShell>;
  }

  return (
    <RouteGuard allowedRoles={["sales"]}>
      <DashboardShell variant="sales">{children}</DashboardShell>
    </RouteGuard>
  );
}
