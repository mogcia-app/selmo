import Link from "next/link";

import { EmptyState, PageHeader, PageShell, Panel } from "@/app/admin/_components/admin-insights";

export default function AdminRepDetailPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="REP DETAIL"
          title="営業マン詳細"
          description="営業マン別一覧から対象の営業担当を選択すると、実データの詳細レビューを確認できます。"
        />

        <Panel title="営業担当を選択">
          <EmptyState
            title="対象の営業担当が選択されていません"
            body="営業マン別一覧、または営業メンバー画面から対象者を開いてください。"
          />
          <div className="mt-5">
            <Link
              href="/admin/reps"
              className="inline-flex rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 py-3 text-[13px] font-black text-[#171717]"
            >
              営業マン別一覧へ
            </Link>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
