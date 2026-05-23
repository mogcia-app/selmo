type CallDetailPageProps = {
  params: Promise<{
    callId: string;
  }>;
};

const checklist = [
  { label: "必要なヒアリング", status: "OK" },
  { label: "料金説明", status: "要改善" },
  { label: "不安への対応", status: "OK" },
  { label: "次回アクションの明確化", status: "NG" },
];

export default async function CallDetailPage({ params }: CallDetailPageProps) {
  const { callId } = await params;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 md:px-10">
      <div className="rounded-[28px] border border-border bg-white/85 p-8 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-deep">
          Call Detail
        </p>
        <h1 className="mt-2 text-3xl font-semibold">通話詳細: {callId}</h1>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="text-lg font-semibold">数値指標</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between border-b border-border pb-3">
                <dt>通話時間</dt>
                <dd>74分</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-3">
                <dt>営業マン発話比率</dt>
                <dd>61%</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-3">
                <dt>質問数</dt>
                <dd>12</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-3">
                <dt>結果</dt>
                <dd>検討中</dd>
              </div>
            </dl>
          </section>
          <section>
            <h2 className="text-lg font-semibold">マニュアルチェック</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {checklist.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"
                >
                  <span>{item.label}</span>
                  <span className="font-semibold">{item.status}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="mt-8">
          <h2 className="text-lg font-semibold">AIコメント</h2>
          <p className="mt-3 rounded-2xl bg-brand-soft p-4 text-sm leading-7 text-ink">
            ヒアリングの流れは安定していますが、料金説明の直後に顧客の懸念を言語化させる質問が少ないため、
            次回は「何が一番気になりますか？」のような深掘りを1回挟むとクロージング精度が上がります。
          </p>
        </section>
      </div>
    </main>
  );
}
