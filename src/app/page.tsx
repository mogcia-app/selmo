import Link from "next/link";

import { StatCard } from "@/components/stat-card";

const highlights = [
  "営業マン別の成約率・失注率を可視化",
  "通話ごとの文字起こし、話者分離、数値分析を一元管理",
  "AIは補足コメントだけに限定し、集計はプログラムで処理",
];

const phaseOneMetrics = [
  { label: "月間通話件数", value: "900-1000", helper: "非同期バッチ処理前提" },
  { label: "対象ユーザー", value: "25名", helper: "admin / sales の2権限" },
  { label: "音声長", value: "60-90分", helper: "一部4時間の例外に対応" },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 md:px-10">
      <section className="rounded-[32px] border border-border bg-surface/90 p-8 shadow-panel md:p-12">
        <div className="mb-8 inline-flex rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-semibold text-ink">
          Sales Call AI Dashboard MVP
        </div>
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
              営業通話の状態を、
              <span className="block text-brand-deep">管理者がすぐ判断できる形で可視化する。</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              SelmoのMVPは、通話音声のアップロードから文字起こし、数値分析、
              マニュアルチェック、AIコメントまでをつなぎ、上層部向けの確認画面を
              最短で成立させる構成です。
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/admin/dashboard"
                className="rounded-full bg-brand px-6 py-3 font-semibold text-ink transition hover:translate-y-[-1px]"
              >
                管理者ダッシュボードへ
              </Link>
              <Link
                href="/sales/dashboard"
                className="rounded-full border border-ink/15 px-6 py-3 font-semibold text-ink"
              >
                営業マン画面を見る
              </Link>
            </div>
            <ul className="mt-8 space-y-3 text-sm text-muted">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-brand" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[28px] border border-brand/30 bg-hero p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-deep">
              Phase 1 Targets
            </p>
            <div className="mt-6 grid gap-4">
              {phaseOneMetrics.map((metric) => (
                <StatCard key={metric.label} {...metric} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
