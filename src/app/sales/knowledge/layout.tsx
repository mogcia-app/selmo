"use client";

import { SalesDomainGuard } from "@/components/sales-domain-guard";

export default function SalesKnowledgeLayout({ children }: { children: React.ReactNode }) {
  return (
    <SalesDomainGuard domain="meeting" label="ナレッジ">
      {children}
    </SalesDomainGuard>
  );
}
