"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { RoleplayResultDetailPanel } from "@/app/sales/roleplay/results/roleplay-result-analysis";
import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToRoleplayResults, type RoleplayResult } from "@/lib/firebase/roleplay";
import { canUseSalesDomain } from "@/lib/sales-domains";

type RoleplayType = "meeting" | "teleapo";

export default function AdminRoleplayResultDetailPage() {
  const params = useParams<{ resultId: string }>();
  const searchParams = useSearchParams();
  const requestedRoleplayType = readRoleplayType(searchParams.get("category"));
  const { profile } = useAuth();
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const canAccessRoleplay = !profile || canUseSalesDomain(profile, requestedRoleplayType);
  const [results, setResults] = useState<RoleplayResult[]>([]);
  const result = useMemo(() => results.find((item) => item.id === params.resultId) ?? null, [params.resultId, results]);
  const roleplayType = result?.roleplayType ?? requestedRoleplayType;

  useEffect(() => {
    if (!userId || !companyId || !canAccessRoleplay) {
      setResults([]);
      return;
    }

    return subscribeToRoleplayResults(
      { userId, companyId, isAdmin: true },
      setResults,
      () => setResults([]),
    );
  }, [canAccessRoleplay, companyId, requestedRoleplayType, userId]);

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
          <div>
            <div className="text-[12px] font-black uppercase tracking-[0.18em] text-[#b58a00]">
              {roleplayType === "teleapo" ? "Teleapo Roleplay" : "Meeting Roleplay"}
            </div>
            <h1 className="mt-1 text-[22px] font-black tracking-[-0.03em] text-[#171717]">ロープレ分析結果</h1>
          </div>
          <Link href="/admin/roleplay" className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[#e2e6ee] bg-white px-4 text-[13px] font-black text-[#343b48] transition hover:border-[#f0c655] hover:bg-[#fff8d8]">
            一覧へ戻る
          </Link>
        </div>

        <section className="mt-3">
          {result ? (
            <RoleplayResultDetailPanel result={result} />
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#dfe4ec] bg-white px-6 py-10 text-center shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <h1 className="text-[24px] font-black tracking-[-0.04em] text-[#171717]">分析結果を読み込み中です</h1>
              <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-7 text-[#596273]">
                見つからない場合は、ロープレ一覧からもう一度選択してください。
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function readRoleplayType(value: string | null): RoleplayType {
  return value === "teleapo" ? "teleapo" : "meeting";
}
