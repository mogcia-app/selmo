"use client";

import { usePathname } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { RouteGuard } from "@/features/auth/route-guard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <RouteGuard allowedRoles={["admin"]}>
      <DashboardShell variant="admin">{children}</DashboardShell>
    </RouteGuard>
  );
}
