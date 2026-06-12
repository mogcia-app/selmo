"use client";

import Link from "next/link";

import { useAuth } from "@/features/auth/auth-provider";
import { canUseSalesDomain, type SalesDomain } from "@/lib/sales-domains";

export function SalesDomainGuard({
  children,
  domain,
  label,
}: {
  children: React.ReactNode;
  domain: SalesDomain;
  label: string;
}) {
  const { isLoading, profile } = useAuth();

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#f7f7f8] px-5 py-6 md:px-8 md:py-7">
        <div className="rounded-[24px] border border-[#eceef4] bg-white px-6 py-10 text-[14px] text-[#7a808c]">
          読み込み中です。
        </div>
      </main>
    );
  }

  if (!canUseSalesDomain(profile, domain)) {
    return (
      <main className="min-h-screen bg-[#f7f7f8] px-5 py-6 md:px-8 md:py-7">
        <div className="mx-auto max-w-[860px] rounded-[24px] border border-[#f2d6d6] bg-white px-6 py-12 text-center shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <h1 className="text-[28px] font-black tracking-[-0.04em] text-[#171717]">この機能は利用できません</h1>
          <p className="mt-3 text-[15px] leading-7 text-[#596273]">
            {label}の利用権限がありません。必要な場合は管理者に依頼してください。
          </p>
          <Link href="/sales/dashboard" className="mt-6 inline-flex h-12 items-center justify-center rounded-[14px] bg-[#ffd12f] px-6 text-[14px] font-black text-[#171717]">
            ダッシュボードへ戻る
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
