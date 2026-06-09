import Image from "next/image";
import Link from "next/link";

export default function SalesDashboardPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f8] px-5 py-6 md:px-8 md:py-7">
      <div className="mx-auto max-w-[1380px]">
        <section className="flex flex-col gap-5 rounded-[24px] border border-[#eceef4] bg-white px-6 py-8 shadow-[0_10px_28px_rgba(17,24,39,0.05)] md:px-8">
          <div className="flex items-start gap-4">
            <Image
              src="/da.png"
              alt="dashboard avatar"
              width={64}
              height={64}
              className="mt-1 h-14 w-14 object-contain"
              priority
            />
            <div>
              <h1 className="text-[24px] font-bold tracking-[-0.03em] text-[#171717]">
                ダッシュボード
              </h1>
              <p className="mt-2 max-w-[720px] text-[15px] leading-7 text-[#7a808c]">
                打ち合わせデータが追加されると、成約率・通話傾向・AIフィードバックがここに表示されます。
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {["成約率", "打ち合わせ件数", "平均通話時間", "マニュアル準拠率"].map((label) => (
              <article
                key={label}
                className="rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-5"
              >
                <div className="text-[13px] font-semibold text-[#7a808c]">{label}</div>
                <div className="mt-4 text-[30px] font-bold tracking-[-0.04em] text-[#171717]">--</div>
                <div className="mt-2 text-[13px] text-[#9aa1ac]">データ未登録</div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <article className="rounded-[24px] border border-[#eceef4] bg-white px-6 py-10 text-center shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
            <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-[16px] bg-[#fffdf7] text-[#9c7600] shadow-[0_6px_14px_rgba(17,24,39,0.04)]">
              <ChartIcon />
            </span>
            <h2 className="mt-4 text-[22px] font-bold text-[#171717]">まだ分析データがありません</h2>
            <p className="mx-auto mt-2 max-w-[500px] text-[14px] leading-7 text-[#7a808c]">
              音声をアップロードして分析が完了すると、AIからのフィードバックや推移グラフを確認できます。
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/meetings/upload"
                className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#f0c655] bg-white px-5 text-[14px] font-semibold text-[#171717]"
              >
                音声をアップロード
              </Link>
              <Link
                href="/meetings"
                className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e5e9f0] bg-white px-5 text-[14px] font-semibold text-[#3d4350]"
              >
                打ち合わせ一覧を見る
              </Link>
            </div>
          </article>

          <aside className="rounded-[24px] border border-[#eceef4] bg-white px-6 py-6 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
            <h2 className="text-[20px] font-bold text-[#171717]">今日の確認事項</h2>
            <div className="mt-5 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-8 text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-[#8f96a3] shadow-[0_6px_14px_rgba(17,24,39,0.04)]">
                <BellIcon />
              </span>
              <h3 className="mt-4 text-[18px] font-bold text-[#171717]">通知はありません</h3>
              <p className="mt-2 text-[13px] leading-6 text-[#7a808c]">
                分析完了や次回アクションがあるとここに表示されます。
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]">
      <path d="M4 19.5h16" />
      <path d="M7 16V9M12 16V5M17 16v-4" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.9]">
      <path d="M18 9.8a6 6 0 0 0-12 0c0 6-2 6.7-2 6.7h16s-2-.7-2-6.7Z" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}
