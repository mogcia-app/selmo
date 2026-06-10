"use client";

import Link from "next/link";

import {
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  StatusBadge,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";

export default function AdminRoleplayPage() {
  const { roleplayScenarios, roleplayResults, memberRows, products, error } = useAdminInsights();
  const completedUserIds = new Set(roleplayResults.map((result) => result.userId));
  const inactiveMembers = memberRows.filter((member) => !completedUserIds.has(member.id));
  const averageScore = roleplayResults.length > 0 ? Math.round(roleplayResults.reduce((sum, result) => sum + result.score, 0) / roleplayResults.length) : null;

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="ROLEPLAY MANAGEMENT"
          title="ロープレ管理"
          description="商品別シナリオと実施状況を確認し、未実施者や低スコアのメンバーに指導をつなげます。"
          action={<Link href="/sales/roleplay/scenarios" className="rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 py-3 text-[13px] font-black text-[#171717]">シナリオ作成</Link>}
        />
        {error ? <ErrorBox message={error} /> : null}

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <KpiCard label="シナリオ" value={`${roleplayScenarios.length}件`} note="登録済み" />
          <KpiCard label="実施回数" value={`${roleplayResults.length}回`} note="結果保存済み" />
          <KpiCard label="平均スコア" value={averageScore === null ? "-" : `${averageScore}点`} note={averageScore === null ? "集計準備中" : "全体平均"} />
          <KpiCard label="未実施者" value={`${inactiveMembers.length}人`} note="結果未保存の営業メンバー" />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
          <Panel title="シナリオ一覧">
            {roleplayScenarios.length > 0 ? (
              <div className="space-y-3">
                {roleplayScenarios.map((scenario) => {
                  const results = roleplayResults.filter((result) => result.scenarioId === scenario.id);
                  const score = results.length > 0 ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length) : null;
                  const product = products.find((item) => item.id === scenario.productId);
                  return (
                    <div key={scenario.id} className="grid gap-3 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 md:grid-cols-[minmax(0,1fr)_120px_120px_120px]">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-black text-[#171717]">{scenario.title}</div>
                        <div className="mt-1 truncate text-[12px] text-[#7a808c]">{product?.name || scenario.productName || "商材未設定"} ・ {scenario.customerRole}</div>
                      </div>
                      <span className="text-[13px] font-bold text-[#596273]">{formatDifficulty(scenario.difficulty)}</span>
                      <span className="text-[13px] font-bold text-[#596273]">{results.length}回実施</span>
                      <span className="text-[13px] font-bold text-[#596273]">{score === null ? "集計準備中" : `${score}点`}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="シナリオはまだありません" body="シナリオ作成後、実施状況を確認できます。" />
            )}
          </Panel>

          <div className="space-y-5">
            <Panel title="未実施者一覧">
              {inactiveMembers.length > 0 ? (
                <div className="space-y-2">
                  {inactiveMembers.map((member) => (
                    <Link key={member.id} href={`/admin/members/${member.id}`} className="flex items-center justify-between rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                      <span className="text-[13px] font-black text-[#171717]">{member.name}</span>
                      <StatusBadge tone="risk" label="未実施" />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="未実施者はいません" body="全員にロープレ結果が保存されています。" />
              )}
            </Panel>

            <Panel title="対象営業マン指定">
              <Placeholder>割り当て機能は集計準備中</Placeholder>
            </Panel>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function formatDifficulty(value: string) {
  if (value === "easy") return "やさしい";
  if (value === "hard") return "難しい";
  return "標準";
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
