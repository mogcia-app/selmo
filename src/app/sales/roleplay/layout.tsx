"use client";

import { SalesDomainGuard } from "@/components/sales-domain-guard";

export default function SalesRoleplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <SalesDomainGuard domain="teleapo" label="ロープレ">
      {children}
    </SalesDomainGuard>
  );
}
