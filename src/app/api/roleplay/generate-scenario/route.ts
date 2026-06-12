import { NextResponse } from "next/server";

import { loadAnalysisContext } from "@/lib/server/analysis-context";

export const runtime = "nodejs";

type ScenarioCategory = "新規" | "既存";

type ProductPayload = {
  name?: string;
  description?: string;
  targetCustomer?: string;
  painPoints?: string[];
  valueProposition?: string;
  pricing?: string;
  competitors?: string[];
  commonObjections?: string[];
  faq?: string[];
  successTalk?: string[];
  ngTalk?: string[];
};

type GeneratedScenario = {
  title: string;
  description: string;
  customerRole: string;
  customerProfile: string;
  goal: string;
  objections: string[];
  evaluationCriteria: string[];
  difficulty: "easy" | "normal" | "hard";
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    companyId?: unknown;
    product?: ProductPayload;
    category?: unknown;
    targetSegment?: unknown;
    meetingInsights?: unknown;
  } | null;
  const companyId = typeof body?.companyId === "string" ? body.companyId : null;
  const product = body?.product ?? {};
  const category = body?.category === "新規" || body?.category === "既存" ? body.category : null;
  const targetSegment = typeof body?.targetSegment === "string" ? body.targetSegment.trim() : "";
  const meetingInsights = readStringArray(body?.meetingInsights).slice(0, 16);

  if (!product.name || !category || !targetSegment) {
    return NextResponse.json({ error: "商材、カテゴリー、ターゲット層を入力してください。" }, { status: 400 });
  }

  const analysisContext = await loadAnalysisContext({
    companyId,
    productName: product.name,
  });
  const scoringRuleInsights = buildScoringRuleInsights(analysisContext);

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ scenario: buildFallbackScenario(product, category, targetSegment, [...scoringRuleInsights, ...meetingInsights]) });
  }

  try {
    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
        temperature: 0.7,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "generated_roleplay_scenario",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                customerRole: { type: "string" },
                customerProfile: { type: "string" },
                goal: { type: "string" },
                objections: { type: "array", items: { type: "string" } },
                evaluationCriteria: { type: "array", items: { type: "string" } },
                difficulty: { type: "string", enum: ["easy", "normal", "hard"] },
              },
              required: [
                "title",
                "description",
                "customerRole",
                "customerProfile",
                "goal",
                "objections",
                "evaluationCriteria",
                "difficulty",
              ],
            },
          },
        },
        messages: [
          {
            role: "system",
            content: [
              "あなたは営業ロープレ教材を作る営業教育設計者です。",
              "商材情報、カテゴリー、ターゲット層、過去のアップロード分析に合わせて、実践的なAI顧客シナリオを日本語で作成してください。",
              "マニュアルのスコアルールがある場合は、ロープレの採点基準に自然に反映してください。加点条件はできた行動、減点条件は避ける行動として表現してください。",
              "過去分析に改善点や不足基準がある場合、その改善練習になる反論・顧客プロフィール・採点基準を必ず含めてください。",
              "過去分析に「話し癖改善」「口癖」「フィラー語」の指摘がある場合、えー、あの、まあ等を減らす練習ゴールと採点基準を必ず含めてください。",
              "営業担当が練習しやすいよう、顧客プロフィール、反論、採点基準を具体化してください。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `商材名: ${product.name}`,
              `カテゴリー: ${category}`,
              `ターゲット層: ${targetSegment}`,
              `概要: ${product.description ?? ""}`,
              `ターゲット顧客: ${product.targetCustomer ?? ""}`,
              `顧客課題: ${(product.painPoints ?? []).join(" / ")}`,
              `価値訴求: ${product.valueProposition ?? ""}`,
              `料金: ${product.pricing ?? ""}`,
              `競合: ${(product.competitors ?? []).join(" / ")}`,
              `よくある反論: ${(product.commonObjections ?? []).join(" / ")}`,
              `FAQ: ${(product.faq ?? []).join(" / ")}`,
              `成功トーク: ${(product.successTalk ?? []).join(" / ")}`,
              `NGトーク: ${(product.ngTalk ?? []).join(" / ")}`,
              `マニュアルのスコアルール: ${scoringRuleInsights.join(" / ")}`,
              `過去アップロード分析からの改善材料: ${meetingInsights.join(" / ")}`,
            ].join("\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ scenario: buildFallbackScenario(product, category, targetSegment, [...scoringRuleInsights, ...meetingInsights]) });
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ scenario: buildFallbackScenario(product, category, targetSegment, [...scoringRuleInsights, ...meetingInsights]) });
    }

    return NextResponse.json({ scenario: normalizeScenario(JSON.parse(content) as GeneratedScenario) });
  } catch {
    return NextResponse.json({ scenario: buildFallbackScenario(product, category, targetSegment, [...scoringRuleInsights, ...meetingInsights]) });
  }
}

function buildFallbackScenario(product: ProductPayload, category: ScenarioCategory, targetSegment: string, meetingInsights: string[] = []): GeneratedScenario {
  const improvementFocus = meetingInsights[0] ?? "顧客課題を深掘りし、導入効果を具体的に示す";
  const fillerFocus = meetingInsights.find((item) => item.includes("話し癖改善") || item.includes("口癖") || item.includes("フィラー"));
  return {
    title: `${product.name} ${category} ${targetSegment} 向け提案`,
    description: `${targetSegment}の${category}顧客に対して、${product.name}の価値を伝え、過去分析で見えた改善点を練習するシナリオです。`,
    customerRole: category === "新規" ? "部門責任者" : "既存顧客の責任者",
    customerProfile: `${targetSegment}領域で課題を感じているが、導入効果や運用負担に慎重な顧客。過去商談での改善テーマは「${improvementFocus}」。`,
    goal: `顧客課題を確認し、価値訴求と導入後の成果を具体的に伝えて次回アクションにつなげる。特に「${improvementFocus}」を改善する。${fillerFocus ? "話し癖を抑え、短く明確に話す練習も行う。" : ""}`,
    objections: ["費用対効果が見えません", "今のやり方でも困っていません", "導入や運用が大変そうです"],
    evaluationCriteria: [
      "顧客課題を具体的に確認できている",
      "商材価値をターゲット層に合わせて説明できている",
      "反論に対して根拠をもって切り返せている",
      improvementFocus,
      ...(fillerFocus ? ["えー、あの、まあ等のフィラー語を減らし、沈黙を恐れずに話せている"] : []),
    ],
    difficulty: "normal",
  };
}

function normalizeScenario(value: GeneratedScenario): GeneratedScenario {
  const fallback = buildFallbackScenario({ name: "商材" }, "新規", "ターゲット");
  return {
    title: readString(value.title) || fallback.title,
    description: readString(value.description),
    customerRole: readString(value.customerRole) || fallback.customerRole,
    customerProfile: readString(value.customerProfile),
    goal: readString(value.goal) || fallback.goal,
    objections: readStringArray(value.objections),
    evaluationCriteria: readStringArray(value.evaluationCriteria),
    difficulty: value.difficulty === "easy" || value.difficulty === "hard" ? value.difficulty : "normal",
  };
}

function buildScoringRuleInsights(context: Awaited<ReturnType<typeof loadAnalysisContext>>) {
  return context.manual?.scoringRules.slice(0, 12).map((rule) => `スコアルール: ${rule}`) ?? [];
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => readString(item)).filter(Boolean).slice(0, 12) : [];
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}
