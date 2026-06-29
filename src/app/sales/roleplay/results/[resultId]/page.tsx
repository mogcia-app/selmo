"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToRoleplayResults, type RoleplayResult } from "@/lib/firebase/roleplay";
import { RoleplayResultDetailPanel } from "@/app/sales/roleplay/results/roleplay-result-analysis";
import { canUseSalesDomain } from "@/lib/sales-domains";

export default function SalesRoleplayResultDetailPage() {
  const params = useParams<{ resultId: string }>();
  const searchParams = useSearchParams();
  const roleplayType = readRoleplayType(searchParams.get("category"));
  const resultId = params.resultId;
  const { profile } = useAuth();
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const isAdmin = profile?.role === "admin";
  const canAccessRoleplay = !profile || canUseSalesDomain(profile, roleplayType);
  const [results, setResults] = useState<RoleplayResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const result = useMemo(() => results.find((item) => item.id === resultId) ?? null, [resultId, results]);

  useEffect(() => {
    if (!userId || !companyId || !canAccessRoleplay) {
      setResults([]);
      return;
    }

    return subscribeToRoleplayResults(
      { userId, companyId, isAdmin },
      setResults,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [canAccessRoleplay, companyId, isAdmin, roleplayType, userId]);

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
      <div className="mx-auto max-w-[1180px]">
        <RoleplayHeader roleplayType={roleplayType} />

        <div className="mt-3">
          <Link href={`/sales/roleplay/results?category=${roleplayType}`} className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[#e2e6ee] bg-white px-4 text-[13px] font-black text-[#343b48] transition hover:border-[#f0c655] hover:bg-[#fff8d8]">
            分析履歴へ戻る
          </Link>
        </div>

        {error ? (
          <div className="mt-4 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        <section className="mt-3">
          {result ? (
            <RoleplayResultDetailPanel result={result} />
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#dfe4ec] bg-white px-6 py-10 text-center shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <h1 className="text-[24px] font-black tracking-[-0.04em] text-[#171717]">分析結果を読み込み中です</h1>
              <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-7 text-[#596273]">
                見つからない場合は、分析履歴からもう一度選択してください。
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function RoleplayHeader({ roleplayType }: { roleplayType: RoleplayType }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
      <span className="sr-only">ロープレナビゲーション</span>
      <div className="hidden items-center gap-2 lg:flex">
        <Step number="1" label="シナリオ選択" href={`/sales/roleplay/scenarios?category=${roleplayType}`} />
        <Step number="2" label="ロープレ中" href={`/sales/roleplay?category=${roleplayType}`} />
        <Step number="3" label="分析結果" active href={`/sales/roleplay/results?category=${roleplayType}`} />
      </div>
    </header>
  );
}

type RoleplayType = "meeting" | "teleapo";

function readRoleplayType(value: string | null): RoleplayType {
  return value === "teleapo" ? "teleapo" : "meeting";
}

function Step({ number, label, active = false, href }: { number: string; label: string; active?: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-10 min-w-[170px] items-center justify-center gap-3 rounded-[12px] border px-4 text-[13px] font-bold ${
        active ? "border-[#f0c655] bg-[#fff3c8] text-[#171717]" : "border-[#dce1ea] bg-white text-[#596273]"
      }`}
    >
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[12px] ${active ? "bg-[#ffd12f] text-[#171717]" : "border border-[#9aa1ac]"}`}>
        {number}
      </span>
      {label}
    </Link>
  );
}
