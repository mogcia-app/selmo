import Link from "next/link";

export default function AdminMeetingDetailLandingPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1480px] px-6 py-10 md:px-10">
      <header className="mb-8 border-b border-[var(--line)] pb-6">
        <h1 className="font-editorial text-[38px] font-bold leading-[1.05] text-[var(--ink)]">
          通話詳細
        </h1>
        <p className="font-mono-ui mt-3 text-[10px] uppercase tracking-[0.22em] text-[var(--gray)]">
          Detail entry point
        </p>
      </header>

      <section className="border border-[var(--line)] bg-[var(--paper)] p-6">
        <p className="text-[14px] leading-7 text-[var(--ink)]">
          実際の通話詳細は一覧から選択して開く形です。まずは一覧で対象データを選んでください。
        </p>
        <div className="mt-5">
          <Link
            href="/meetings"
            className="inline-flex border border-[var(--line)] bg-[var(--ink)] px-4 py-[10px] text-[12.5px] font-medium text-[var(--paper)] transition hover:bg-[var(--line)]"
          >
            通話一覧を開く
          </Link>
        </div>
      </section>
    </main>
  );
}
