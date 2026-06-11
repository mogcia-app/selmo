import Link from "next/link";

export default function AdminMeetingDetailLandingPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1480px] bg-[#f5f5f6] px-5 py-6 md:px-8 md:py-8">
      <header className="mb-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8a6500]">MEETING DETAIL</p>
        <h1 className="mt-1 text-[32px] font-black tracking-[-0.04em] text-[#171717] md:text-[34px]">
          通話詳細
        </h1>
        <p className="mt-2 text-[14px] leading-7 text-[#596273]">
          Detail entry point
        </p>
      </header>

      <section className="rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
        <p className="text-[14px] leading-7 text-[#343b48]">
          実際の通話詳細は一覧から選択して開く形です。まずは一覧で対象データを選んでください。
        </p>
        <div className="mt-5">
          <Link
            href="/admin/meetings"
            className="inline-flex rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-4 py-3 text-[13px] font-black text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.18)] transition hover:bg-[#ffcf24]"
          >
            商談レビューを開く
          </Link>
        </div>
      </section>
    </main>
  );
}
