"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

type Metric = {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "good" | "warn" | "risk";
};

type TableRow = {
  name: string;
  sub: string;
  status: string;
  score: string;
  note: string;
  tone?: "good" | "warn" | "risk";
};

type ProgressRow = {
  label: string;
  value: string;
  percent: number;
  note: string;
};

const adminMetrics: Metric[] = [
  { label: "営業メンバー", value: "24人", note: "アクティブ 21人" },
  { label: "今月の商談", value: "186件", note: "先月比 +18件", tone: "good" },
  { label: "成約率", value: "37.6%", note: "前月比 +4.2pt", tone: "good" },
  { label: "要フォロー", value: "6人", note: "優先対応 2人", tone: "warn" },
  { label: "共有ナレッジ", value: "128件", note: "商材 12カテゴリ" },
];

const adminRows: TableRow[] = [
  { name: "佐藤 美咲", sub: "SaaS提案 / 3年目", status: "優先対応", score: "62", note: "ヒアリング深掘り不足", tone: "risk" },
  { name: "高橋 健", sub: "新規開拓 / 2年目", status: "要確認", score: "71", note: "競合比較の説明を強化", tone: "warn" },
  { name: "山田 葵", sub: "エンタープライズ / 5年目", status: "好調", score: "88", note: "決裁者確認が安定", tone: "good" },
  { name: "田中 翔", sub: "インサイドセールス / 1年目", status: "要確認", score: "69", note: "次回アクションが曖昧", tone: "warn" },
];

const productRows: ProgressRow[] = [
  { label: "クラウド勤怠パック", value: "46%", percent: 46, note: "商談 42件 / 成約 19件" },
  { label: "営業AIレポート", value: "39%", percent: 39, note: "商談 31件 / 成約 12件" },
  { label: "オンボーディング支援", value: "28%", percent: 28, note: "商談 25件 / 成約 7件" },
];

const adminIndividualMetrics: Metric[] = [
  { label: "成約率", value: "28.6%", note: "商談結果 / 前月比 +3.1pt", tone: "warn" },
  { label: "商談数", value: "21件", note: "分析済み 18件" },
  { label: "平均商談時間", value: "42分", note: "音声アップロード対象" },
  { label: "ロープレ", value: "7回", note: "低スコア 2件", tone: "risk" },
  { label: "AI評価", value: "72点", note: "ロープレ平均", tone: "warn" },
  { label: "次アクション遅れ", value: "3件", note: "優先確認", tone: "risk" },
];

const adminIndividualMeetings: TableRow[] = [
  { name: "株式会社アオバ", sub: "2026/06/21 / クラウド勤怠パック", status: "検討中", score: "76", note: "決裁者同席の打診が必要", tone: "warn" },
  { name: "Nexseed Japan", sub: "2026/06/14 / オンボーディング支援", status: "失注", score: "61", note: "価格反論の根拠提示が不足", tone: "risk" },
  { name: "田町物流", sub: "2026/06/10 / クラウド勤怠パック", status: "検討中", score: "79", note: "現場定着の説明は良好", tone: "warn" },
];

const adminIndividualProgress: ProgressRow[] = [
  { label: "ヒアリング", value: "84", percent: 84, note: "課題確認は安定" },
  { label: "反論処理", value: "63", percent: 63, note: "価格・既存運用への切り返しを強化" },
  { label: "次回設定", value: "58", percent: 58, note: "期限と同席者の明確化が不足" },
];

const salesMetrics: Metric[] = [
  { label: "今月の商談", value: "18件", note: "分析済み 15件" },
  { label: "AI平均スコア", value: "82点", note: "前月比 +7点", tone: "good" },
  { label: "成約率", value: "33.3%", note: "目標まで +2件", tone: "warn" },
  { label: "ロープレ", value: "9回", note: "推奨 週2回" },
];

const salesRows: TableRow[] = [
  { name: "株式会社アオバ", sub: "2026/06/21", status: "検討中", score: "86", note: "決裁プロセスの確認が必要", tone: "warn" },
  { name: "北辰フーズ", sub: "2026/06/18", status: "成約", score: "91", note: "導入後の運用像まで合意", tone: "good" },
  { name: "Nexseed Japan", sub: "2026/06/14", status: "失注", score: "67", note: "価格反論への切り返し不足", tone: "risk" },
  { name: "田町物流", sub: "2026/06/10", status: "検討中", score: "79", note: "費用対効果を次回提示", tone: "warn" },
];

const actionRows: ProgressRow[] = [
  { label: "ヒアリング", value: "88", percent: 88, note: "課題の言語化は安定" },
  { label: "提案構成", value: "81", percent: 81, note: "事例の接続を強化" },
  { label: "クロージング", value: "72", percent: 72, note: "期限と決裁者確認が改善余地" },
];

const customerRows = [
  {
    company: "株式会社アオバ",
    contact: "人事部 部長 / 林 直人",
    product: "クラウド勤怠パック",
    status: "提案中",
    temperature: "高",
    lastContact: "2026/06/21",
    nextAction: "費用対効果シートを送付",
    amount: "120万円",
    tone: "good",
  },
  {
    company: "北辰フーズ",
    contact: "管理本部 / 村上 彩",
    product: "営業AIレポート",
    status: "契約中",
    temperature: "高",
    lastContact: "2026/06/18",
    nextAction: "初期設定MTG",
    amount: "84万円",
    tone: "good",
  },
  {
    company: "Nexseed Japan",
    contact: "営業企画 / 田辺 翼",
    product: "オンボーディング支援",
    status: "失注",
    temperature: "低",
    lastContact: "2026/06/14",
    nextAction: "半年後に再提案",
    amount: "60万円",
    tone: "risk",
  },
  {
    company: "田町物流",
    contact: "総務 / 小野 祐介",
    product: "クラウド勤怠パック",
    status: "商談予定",
    temperature: "中",
    lastContact: "2026/06/10",
    nextAction: "現場責任者を同席依頼",
    amount: "96万円",
    tone: "warn",
  },
];

const knowledgeProducts = [
  { name: "クラウド勤怠パック", count: "24件", summary: "料金、導入手順、競合比較、FAQ" },
  { name: "営業AIレポート", count: "18件", summary: "提案トーク、事例、反論処理、活用例" },
  { name: "オンボーディング支援", count: "13件", summary: "初期設計、運用定着、更新提案" },
  { name: "セキュリティ監査", count: "9件", summary: "権限、ログ、監査証跡、稟議回答" },
];

const knowledgeItems = [
  { title: "価格が高いと言われた時の切り返し", tag: "反論処理", body: "月額ではなく、締め作業の削減時間とミス削減額で比較する。" },
  { title: "決裁者確認の質問例", tag: "ヒアリング", body: "導入判断に関わる部署、稟議の順番、期限を自然に確認する。" },
  { title: "北辰フーズ導入事例", tag: "事例", body: "勤怠締め作業を月18時間削減。初月から現場入力率が92%に改善。" },
];

const roleplayMessages = [
  {
    role: "customer",
    label: "AI顧客",
    body: "正直、今の勤怠管理でも回っているので、急いで変える理由がまだ弱いです。",
  },
  {
    role: "sales",
    label: "営業",
    body: "ありがとうございます。今回の目的は置き換え自体ではなく、月末の集計負荷と確認漏れをどれくらい減らせるかの確認です。",
  },
  {
    role: "customer",
    label: "AI顧客",
    body: "なるほど。ただ現場が入力してくれるかが心配です。以前ツール導入で定着しなかったことがありまして。",
  },
  {
    role: "sales",
    label: "営業",
    body: "そこは重要ですね。初月は現場責任者向けの15分説明と、未入力アラートの運用設計まで一緒に進めます。",
  },
];

export function AdminDemoDashboard() {
  const [viewMode, setViewMode] = useState<"overview" | "individual">("overview");

  return (
    <main className="overflow-x-hidden bg-[#f6f7f9] px-4 pb-8 pt-4 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DemoHeader
            eyebrow="Admin Demo"
            title={viewMode === "overview" ? "チーム営業サマリー" : "佐藤 美咲さんの育成ダッシュボード"}
            body={
              viewMode === "overview"
                ? "営業メンバーの活動、商談レビュー、育成優先度をデモデータで確認できます。"
                : "個別メンバーの商談、ロープレ、次に見るべき改善ポイントをデモデータで確認できます。"
            }
          />
          <div className="inline-flex shrink-0 items-center gap-1 rounded-[12px] border border-[#e3e7ee] bg-white p-1 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <button
              type="button"
              onClick={() => setViewMode("overview")}
              className={`rounded-[9px] px-4 py-2 text-[13px] font-black transition ${
                viewMode === "overview" ? "bg-[#171717] text-white shadow-sm" : "text-[#596273] hover:bg-[#f7f7fa] hover:text-[#171717]"
              }`}
            >
              総合
            </button>
            <button
              type="button"
              onClick={() => setViewMode("individual")}
              className={`rounded-[9px] px-4 py-2 text-[13px] font-black transition ${
                viewMode === "individual" ? "bg-[#171717] text-white shadow-sm" : "text-[#596273] hover:bg-[#f7f7fa] hover:text-[#171717]"
              }`}
            >
              個別
            </button>
          </div>
        </div>

        {viewMode === "overview" ? <AdminDemoOverview /> : <AdminDemoIndividual />}
      </div>
    </main>
  );
}

function AdminDemoOverview() {
  return (
    <>
      <MetricGrid metrics={adminMetrics} columns="xl:grid-cols-5" />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <Panel title="指導必要ユーザー" caption="AIが商談・ロープレの記録から優先度を整理">
          <DemoTable rows={adminRows} />
        </Panel>

        <Panel title="営業パフォーマンス分布" caption="成約率とAI評価の偏りをチーム単位で可視化">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "High Performer", value: "7人", className: "border-[#bfe8cc] bg-[#f1fbf4] text-[#16834f]" },
              { label: "Stable", value: "11人", className: "border-[#e5e8ef] bg-[#fcfcfd] text-[#343b48]" },
              { label: "Needs Coaching", value: "6人", className: "border-[#f5d394] bg-[#fff8e8] text-[#9c6500]" },
              { label: "Risk", value: "2人", className: "border-[#ffc9c0] bg-[#fff2ef] text-[#d63c2f]" },
            ].map((item) => (
              <div key={item.label} className={`rounded-[16px] border p-4 ${item.className}`}>
                <div className="text-[12px] font-black uppercase tracking-[0.12em]">{item.label}</div>
                <div className="mt-3 text-[30px] font-black leading-none">{item.value}</div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Panel title="商材別 成約率" caption="商品ごとの勝ち筋とナレッジ整備状況">
          <ProgressList rows={productRows} />
        </Panel>

        <Panel title="最近の活動状況" caption="営業活動、ナレッジ更新、ロープレ実施を時系列で表示">
          <Timeline
            items={[
              ["09:42", "佐藤 美咲さんの商談レビューに改善コメントを追加"],
              ["11:10", "営業AIレポートの反論処理ナレッジが更新されました"],
              ["14:25", "高橋 健さんが価格交渉ロープレを完了"],
              ["16:05", "北辰フーズ商談が成約として登録されました"],
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function AdminDemoIndividual() {
  return (
    <>
      <section className="rounded-[18px] border border-[#e4e8ef] bg-white shadow-[0_8px_22px_rgba(17,24,39,0.05)]">
        <div className="grid gap-5 border-b border-[#eef1f5] px-5 py-5 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center">
            <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#fff3cf] text-[28px] font-black text-[#8a6500]">
              佐
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[26px] font-black tracking-[-0.03em] text-[#171717]">佐藤 美咲</h2>
                <span className="rounded-full bg-[#fff0ed] px-2.5 py-1 text-[11px] font-black text-[#d63c2f]">優先対応</span>
                <span className="rounded-full bg-[#fff3cf] px-2.5 py-1 text-[11px] font-black text-[#8a6500]">3年目</span>
              </div>
              <p className="mt-1.5 text-[13px] font-bold text-[#596273]">misaki.sato@example.com ・ SaaS新規提案チーム</p>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                <div className="rounded-[12px] border border-[#ead8a8] bg-[#fffbf1] px-4 py-3">
                  <div className="text-[12px] font-bold text-[#8a909b]">次に見ること</div>
                  <div className="mt-1 text-[16px] font-black text-[#171717]">価格反論後の次回設定率を確認</div>
                </div>
                <div className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                  <div className="text-[12px] font-bold text-[#8a909b]">直近活動</div>
                  <div className="mt-1 text-[16px] font-black text-[#343b48]">2時間前</div>
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="h-11 rounded-[10px] border border-[#dfe4ec] bg-white px-3 py-3 text-[13px] font-black text-[#343b48]">
              佐藤 美咲
            </div>
            <div className="flex h-11 items-center justify-center rounded-[10px] border border-[#f0c655] bg-[#ffd84d] px-4 text-[13px] font-black text-[#171717]">
              詳細ページを見る
            </div>
          </div>
        </div>
        <MetricGrid metrics={adminIndividualMetrics} columns="xl:grid-cols-6" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="space-y-5">
          <Panel title="優先して見ること" caption="商談分析とロープレ結果から改善テーマを抽出">
            <div className="grid gap-3">
              {[
                ["価格反論への切り返し", "費用対効果の根拠を出す前に値引き余地の話へ流れやすい"],
                ["次回アクションの明確化", "誰が、いつ、何を判断するかの確認が不足"],
                ["決裁者同席の打診", "担当者評価は高いが、決裁者接続まで進まない商談が多い"],
              ].map(([title, body]) => (
                <div key={title} className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                  <div className="text-[14px] font-black text-[#171717]">{title}</div>
                  <p className="mt-1 text-[13px] font-bold leading-6 text-[#7a808c]">{body}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="直近の商談" caption="AIスコア、結果、レビュー注目点">
            <DemoTable rows={adminIndividualMeetings} />
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="商談スキル" caption="商談分析の評価項目をスキル別に表示">
            <ProgressList rows={adminIndividualProgress} />
          </Panel>

          <Panel title="管理者アクション" caption="次の1on1やロープレ課題に反映">
            <Timeline
              items={[
                ["1", "価格反論ロープレを今週中に1回アサイン"],
                ["2", "次回設定の良かった商談を1件一緒に確認"],
                ["3", "北辰フーズ事例を提案前トークに組み込む"],
              ]}
            />
          </Panel>
        </div>
      </section>
    </>
  );
}

export function SalesDemoDashboard() {
  return (
    <main className="overflow-x-hidden bg-transparent px-4 pb-8 pt-4 md:px-7 md:pt-5">
      <div className="mx-auto max-w-[1440px] space-y-5">
        <SalesDemoNav active="dashboard" />
        <DemoHeader
          eyebrow="Sales Demo"
          title="こんにちは、佐藤さん"
          body="商談・ロープレ・ナレッジから、今日見るべき改善ポイントをデモデータで表示します。"
        />

        <MetricGrid metrics={salesMetrics} columns="xl:grid-cols-4" />

        <Panel title="直近商談一覧" caption="AIスコア、結果、次回確認ポイントを一覧化">
          <DemoTable rows={salesRows} />
        </Panel>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel title="OODA 営業アクション" caption="観察、整理、判断、実行をカードで提示">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Observe", "今週の記録", "商談 5件 / 分析済み 4件"],
                ["Orient", "商談の傾向", "価格質問後に失速しやすい"],
                ["Decide", "改善テーマ", "費用対効果の先出し"],
                ["Act", "次の行動", "北辰フーズ事例を提案資料に追加"],
              ].map(([label, title, body]) => (
                <article key={label} className="min-h-[142px] rounded-[18px] border border-[#edf0f4] bg-[#fcfcfd] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[16px] font-black text-[#171717]">{title}</h3>
                    <span className="rounded-full border border-[#f0d46b] bg-[#fffaf0] px-2.5 py-1 text-[11px] font-black text-[#8a6500]">
                      {label}
                    </span>
                  </div>
                  <p className="mt-4 text-[13px] font-bold leading-6 text-[#596273]">{body}</p>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="スキル別評価" caption="商談分析の評価項目をスキル別に表示">
            <ProgressList rows={actionRows} />
          </Panel>
        </section>
      </div>
    </main>
  );
}

export function SalesDemoCustomers() {
  return (
    <main className="overflow-x-hidden bg-[#f6f7f9] px-4 pb-8 pt-5 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px] space-y-5">
        <SalesDemoNav active="customers" />
        <DemoHeader
          eyebrow="Customer Karte Demo"
          title="顧客カルテ"
          body="担当顧客の状態、温度感、契約状況、次回アクションをデモデータで確認できます。"
        />

        <MetricGrid
          columns="xl:grid-cols-4"
          metrics={[
            { label: "担当顧客", value: "42件", note: "自分の担当カルテ" },
            { label: "契約中", value: "11件", note: "成約後フォロー対象", tone: "good" },
            { label: "提案中", value: "8件", note: "追客強化対象", tone: "warn" },
            { label: "期限超過", value: "2件", note: "次回アクション遅れ", tone: "risk" },
          ]}
        />

        <section className="rounded-[18px] border border-[#e4e8ef] bg-white shadow-[0_8px_22px_rgba(17,24,39,0.05)]">
          <div className="grid gap-3 border-b border-[#eef1f5] px-4 py-4 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
            <div className="h-11 rounded-[10px] border border-[#dfe4ec] bg-white px-3 py-3 text-[13px] font-bold text-[#9aa1ad]">
              会社名・担当者名・次回アクションで検索
            </div>
            <div className="h-11 rounded-[10px] border border-[#dfe4ec] bg-white px-3 py-3 text-[13px] font-bold text-[#343b48]">
              全ステータス
            </div>
            <div className="h-11 rounded-[10px] border border-[#dfe4ec] bg-white px-3 py-3 text-[13px] font-bold text-[#343b48]">
              佐藤 美咲
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead className="bg-[#fcfcfd]">
                <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
                  <th className="px-4 py-3 font-bold">顧客名/会社名</th>
                  <th className="px-4 py-3 font-bold">商材</th>
                  <th className="px-4 py-3 font-bold">ステータス</th>
                  <th className="px-4 py-3 font-bold">温度感</th>
                  <th className="px-4 py-3 font-bold">最終接触日</th>
                  <th className="px-4 py-3 font-bold">次回アクション</th>
                  <th className="px-4 py-3 font-bold">見込み金額</th>
                </tr>
              </thead>
              <tbody>
                {customerRows.map((customer) => (
                  <tr key={customer.company} className="border-b border-[#f0f2f6] last:border-b-0">
                    <td className="px-4 py-4">
                      <div className="text-[14px] font-black text-[#171717]">{customer.company}</div>
                      <div className="mt-1 text-[12px] font-bold text-[#8a909b]">{customer.contact}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-[#fffaf0] px-2.5 py-1 text-[11px] font-black text-[#8a6500]">
                        {customer.product}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-3 py-1 text-[12px] font-black ${getBadgeClass(customer.tone as TableRow["tone"])}`}>
                        {customer.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[13px] font-black text-[#343b48]">{customer.temperature}</td>
                    <td className="px-4 py-4 text-[13px] font-bold text-[#596273]">{customer.lastContact}</td>
                    <td className="px-4 py-4">
                      <div className="text-[13px] font-black text-[#343b48]">{customer.nextAction}</div>
                    </td>
                    <td className="px-4 py-4 text-[13px] font-black text-[#171717]">{customer.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

export function SalesDemoRoleplay() {
  return (
    <main className="overflow-x-hidden bg-transparent px-4 pb-8 pt-4 md:px-8 md:pt-5">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <SalesDemoNav active="roleplay" />
        <section className="grid gap-4 rounded-[20px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#8a6500]">Roleplay Demo</p>
            <h1 className="mt-1 text-[24px] font-black tracking-[-0.03em] text-[#171717]">クラウド勤怠パック 初回提案ロープレ</h1>
            <p className="mt-2 text-[13px] leading-6 text-[#707783]">
              AI顧客との会話、録音ステータス、採点前の操作バーまで、実際のロープレ画面に近い状態で確認できます。
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <CompactDemoStatus label="AI顧客" value="人事部長 林さん" />
            <CompactDemoStatus label="難易度" value="中級" />
            <CompactDemoStatus label="状態" value="AI顧客が発話中" active />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <article className="flex min-h-[680px] flex-col rounded-[24px] border border-[#e2e6ee] bg-white shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <div className="border-b border-[#eef1f5] px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-bold text-[#8a6500]">クラウド勤怠パック</p>
                  <h2 className="mt-1 text-[20px] font-black text-[#171717]">AI顧客との会話</h2>
                </div>
                <div className="flex gap-2">
                  <span className="inline-flex h-10 items-center rounded-[12px] border border-[#e2e6ee] bg-white px-3 text-[12px] font-black text-[#343b48]">
                    AI顧客情報
                  </span>
                  <span className="inline-flex h-10 items-center rounded-[12px] border border-[#e2e6ee] bg-white px-3 text-[12px] font-black text-[#343b48]">
                    音声設定
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
              {roleplayMessages.map((message) => (
                <div key={message.body} className={`flex ${message.role === "sales" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[82%] rounded-[18px] px-4 py-3 text-[14px] leading-7 ${
                      message.role === "sales"
                        ? "bg-[#171717] text-white"
                        : "border border-[#e6eaf0] bg-[#fcfcfd] text-[#343b48]"
                    }`}
                  >
                    <div className={`mb-1 text-[11px] font-bold ${message.role === "sales" ? "text-white/70" : "text-[#8a909b]"}`}>
                      {message.label}
                    </div>
                    {message.body}
                  </div>
                </div>
              ))}
              <div className="max-w-[76%] rounded-[18px] border border-[#e6eaf0] bg-[#fcfcfd] px-4 py-3 text-[13px] font-semibold text-[#7a808c]">
                AI顧客が音声で返答しています...
              </div>
            </div>

            <div className="sticky bottom-0 z-10 border-t border-[#eef1f5] bg-white/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
              <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="grid min-w-0 grid-cols-3 gap-2 xl:flex-1">
                  <CompactDemoStatus label="録音" value="00:42" />
                  <CompactDemoStatus label="状態" value="発話中" active />
                  <CompactDemoStatus label="発話" value="2回" />
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-[380px] xl:shrink-0">
                  <button type="button" className="inline-flex h-12 items-center justify-center rounded-[16px] bg-[#171717] px-4 text-[13px] font-black text-white shadow-[0_10px_24px_rgba(17,24,39,0.16)] sm:h-14">
                    録音して話す
                  </button>
                  <button type="button" className="inline-flex h-12 items-center justify-center rounded-[16px] border border-[#f0c655] bg-[#ffd84d] px-4 text-[13px] font-black text-[#171717] shadow-[0_10px_22px_rgba(245,189,7,0.18)] sm:h-14">
                    終了して採点
                  </button>
                </div>
              </div>
            </div>
          </article>

          <aside className="h-fit rounded-[24px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <h2 className="text-[18px] font-black text-[#171717]">AI顧客情報</h2>
            <div className="mt-4 space-y-3">
              <InfoBlock label="顧客役" value="従業員350名の食品メーカー 人事部長" />
              <InfoBlock label="ゴール" value="現場定着への不安を解消し、次回決裁者同席の商談を設定する" />
              <InfoBlock label="想定反論" value="現場が入力しない / 既存運用で足りる / 価格が高い" />
              <InfoBlock label="採点基準" value="課題の深掘り / 導入後運用の説明 / 次回アクションの明確化" />
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

export function SalesDemoKnowledge() {
  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-8 pt-4 md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <SalesDemoNav active="knowledge" />
        <DemoHeader
          eyebrow="Knowledge Demo"
          title="商材別に探して、商談中にすぐ答える"
          body="料金、導入手順、競合比較、反論処理、事例をデモデータでまとめています。"
        />

        <section className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_12px_34px_rgba(17,24,39,0.04)] md:p-6">
          <div className="flex items-center gap-3 rounded-[18px] border border-[#f0e3c1] bg-white px-4 py-4 shadow-[0_14px_34px_rgba(17,24,39,0.06)]">
            <span className="text-[20px] text-[#8f96a3]">⌕</span>
            <div className="min-w-0 flex-1 text-[15px] font-bold text-[#9aa1ac]">料金、導入、競合比較、解約条件などで検索</div>
            <span className="inline-flex h-10 items-center justify-center rounded-[13px] bg-[#171717] px-4 text-[13px] font-bold text-white">
              検索
            </span>
          </div>

          <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
            {knowledgeProducts.map((product) => (
              <article key={product.name} className="min-w-[240px] shrink-0 basis-[calc(50%_-_8px)] rounded-[20px] border border-[#eceef4] bg-[#fcfcfd] px-5 py-5 xl:basis-[calc(25%_-_12px)]">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#fff0b8] text-[16px] font-black text-[#8a6500]">
                  {product.name.slice(0, 1)}
                </span>
                <h3 className="mt-4 truncate text-[21px] font-black text-[#171717]">{product.name}</h3>
                <p className="mt-2 text-[12px] font-bold leading-5 text-[#7a808c]">{product.summary}</p>
                <div className="mt-4 flex items-center justify-between gap-3 text-[12px] font-bold text-[#8a909b]">
                  <span>{product.count}のナレッジ</span>
                  <span>開く</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel title="自分のナレッジ" caption="商談メモや、自分用にアレンジした内容">
            <KnowledgeDemoList items={knowledgeItems.slice(0, 2)} />
          </Panel>
          <Panel title="共有されたナレッジ" caption="管理者やチームから配られた公式情報">
            <KnowledgeDemoList items={knowledgeItems} />
          </Panel>
        </section>
      </div>
    </main>
  );
}

function SalesDemoNav({ active }: { active: "dashboard" | "customers" | "roleplay" | "knowledge" }) {
  const items = [
    { id: "dashboard", label: "ダッシュボード", href: "/sales/demo/dashboard" },
    { id: "customers", label: "顧客カルテ", href: "/sales/demo/customers" },
    { id: "roleplay", label: "ロープレ", href: "/sales/demo/roleplay" },
    { id: "knowledge", label: "ナレッジ", href: "/sales/demo/knowledge" },
  ] as const;

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-[16px] border border-[#e7e9ef] bg-white p-2 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={`inline-flex h-10 shrink-0 items-center rounded-[12px] px-4 text-[13px] font-black transition ${
            active === item.id
              ? "bg-[#171717] text-white"
              : "border border-[#eef1f5] bg-[#fcfcfd] text-[#596273] hover:border-[#f0c655] hover:text-[#171717]"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function CompactDemoStatus({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={`rounded-[14px] border px-3 py-2 ${active ? "border-[#ffd0cc] bg-[#fff4f2]" : "border-[#e6eaf0] bg-[#fcfcfd]"}`}>
      <div className="text-[10px] font-black text-[#8a909b]">{label}</div>
      <div className={`mt-0.5 truncate text-[12px] font-black ${active ? "text-[#d92d20]" : "text-[#171717]"}`}>{value}</div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="text-[11px] font-black text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[13px] font-bold leading-6 text-[#343b48]">{value}</div>
    </div>
  );
}

function KnowledgeDemoList({ items }: { items: Array<{ title: string; tag: string; body: string }> }) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <article key={item.title} className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="min-w-0 flex-1 text-[15px] font-black text-[#171717]">{item.title}</h3>
            <span className="rounded-full bg-[#fff3cf] px-2 py-0.5 text-[11px] font-black text-[#8a6500]">{item.tag}</span>
          </div>
          <p className="mt-2 text-[13px] font-bold leading-6 text-[#7a808c]">{item.body}</p>
        </article>
      ))}
    </div>
  );
}

function DemoHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <section className="min-w-0 flex-1 rounded-[20px] border border-[#e7e9ef] bg-white px-5 py-5 shadow-[0_14px_34px_rgba(17,24,39,0.05)] md:px-7">
      <div>
        <div>
          <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#9c7600]">{eyebrow}</p>
          <h1 className="mt-2 text-[24px] font-black tracking-[-0.02em] text-[#171717] md:text-[30px]">{title}</h1>
          <p className="mt-2 max-w-[760px] text-[13px] leading-6 text-[#6f7480]">{body}</p>
        </div>
      </div>
    </section>
  );
}

function MetricGrid({ metrics, columns }: { metrics: Metric[]; columns: string }) {
  return (
    <section className={`grid gap-4 md:grid-cols-2 ${columns}`}>
      {metrics.map((metric) => (
        <article key={metric.label} className="rounded-[18px] border border-[#e7e9ef] bg-white p-5 shadow-[0_10px_24px_rgba(17,24,39,0.04)]">
          <div className="text-[13px] font-black text-[#6f7480]">{metric.label}</div>
          <div className={`mt-3 text-[34px] font-black leading-none ${getMetricToneClass(metric.tone)}`}>{metric.value}</div>
          <p className="mt-3 text-[12px] font-bold leading-5 text-[#7a808c]">{metric.note}</p>
        </article>
      ))}
    </section>
  );
}

function Panel({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border border-[#e4e8ef] bg-white shadow-[0_8px_22px_rgba(17,24,39,0.045)]">
      <div className="border-b border-[#eef1f5] px-5 py-4">
        <h2 className="text-[17px] font-black text-[#171717]">{title}</h2>
        <p className="mt-1 text-[12px] font-bold leading-5 text-[#8a909b]">{caption}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function DemoTable({ rows }: { rows: TableRow[] }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#edf0f4]">
      <div className="hidden grid-cols-[minmax(0,1fr)_112px_90px_minmax(180px,0.8fr)] gap-3 bg-[#fffaf0] px-4 py-3 text-[12px] font-black text-[#8a6500] lg:grid">
        <span>対象</span>
        <span>ステータス</span>
        <span>スコア</span>
        <span>ポイント</span>
      </div>
      <div className="divide-y divide-[#edf0f4]">
        {rows.map((row) => (
          <div key={`${row.name}-${row.sub}`} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_112px_90px_minmax(180px,0.8fr)] lg:items-center">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-black text-[#171717]">{row.name}</div>
              <div className="mt-1 truncate text-[12px] font-bold text-[#8d94a1]">{row.sub}</div>
            </div>
            <span className={`inline-flex h-8 w-fit items-center rounded-full px-3 text-[12px] font-black ${getBadgeClass(row.tone)}`}>
              {row.status}
            </span>
            <div className="text-[16px] font-black text-[#343b48]">{row.score}</div>
            <div className="text-[13px] font-bold leading-6 text-[#4d5563]">{row.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressList({ rows }: { rows: ProgressRow[] }) {
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.label} className="rounded-[16px] border border-[#edf0f4] bg-[#fcfcfd] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-black text-[#171717]">{row.label}</div>
              <div className="mt-1 text-[12px] font-bold text-[#8a909b]">{row.note}</div>
            </div>
            <div className="shrink-0 text-[18px] font-black text-[#8a6500]">{row.value}</div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#edf0f5]">
            <div className="h-full rounded-full bg-[#ffd84d]" style={{ width: `${row.percent}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Timeline({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="space-y-3">
      {items.map(([time, text]) => (
        <div key={`${time}-${text}`} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-[14px] border border-[#edf0f4] bg-[#fcfcfd] px-4 py-3">
          <div className="text-[12px] font-black text-[#8a6500]">{time}</div>
          <div className="text-[13px] font-bold leading-6 text-[#343b48]">{text}</div>
        </div>
      ))}
    </div>
  );
}

function getMetricToneClass(tone: Metric["tone"]) {
  if (tone === "good") return "text-[#16834f]";
  if (tone === "warn") return "text-[#9c6500]";
  if (tone === "risk") return "text-[#d63c2f]";
  return "text-[#171717]";
}

function getBadgeClass(tone: TableRow["tone"]) {
  if (tone === "good") return "bg-[#eaf8ef] text-[#16834f]";
  if (tone === "risk") return "bg-[#fff0ed] text-[#d63c2f]";
  return "bg-[#fff3cf] text-[#8a6500]";
}
