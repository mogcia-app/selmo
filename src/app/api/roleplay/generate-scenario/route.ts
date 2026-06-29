import { NextResponse } from "next/server";

import { loadAnalysisContext } from "@/lib/server/analysis-context";
import {
  assertSalesDomainAccess,
  handleApiAuthError,
  requireApiUser,
} from "@/lib/server/auth/require-api-user";

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
  targetSegment: string;
  customerRole: string;
  customerProfile: string;
  goal: string;
  objections: string[];
  evaluationCriteria: string[];
  difficulty: "easy" | "normal" | "hard";
};

export async function POST(request: Request) {
  const apiUser = await requireApiUser(request).catch((error) => {
    const authError = handleApiAuthError(error);
    if (authError) return authError;
    throw error;
  });
  if ("body" in apiUser) {
    return NextResponse.json(apiUser.body, { status: apiUser.status });
  }
  const body = (await request.json().catch(() => null)) as {
    companyId?: unknown;
    product?: ProductPayload;
    category?: unknown;
    targetSegment?: unknown;
    roleplayType?: unknown;
    meetingInsights?: unknown;
  } | null;
  const product = body?.product ?? {};
  const category = body?.category === "新規" || body?.category === "既存" ? body.category : null;
  const targetSegment = typeof body?.targetSegment === "string" ? body.targetSegment.trim() : "";
  const roleplayType = body?.roleplayType === "teleapo" ? "teleapo" : "meeting";
  const meetingInsights = readStringArray(body?.meetingInsights).slice(0, 16);

  if (!product.name || !category) {
    return NextResponse.json({ error: "商材、カテゴリーを入力してください。" }, { status: 400 });
  }

  try {
    assertSalesDomainAccess(apiUser, roleplayType);
  } catch (error) {
    const authError = handleApiAuthError(error);
    if (authError) return NextResponse.json(authError.body, { status: authError.status });
    throw error;
  }

  const analysisContext = await loadAnalysisContext({
    companyId: apiUser.companyId,
    productName: product.name,
    manualCategory: category,
    targetSegment,
    manualDomain: roleplayType,
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
                targetSegment: { type: "string" },
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
                "targetSegment",
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
              "このロープレは長時間の模擬商談ではなく、10分以内で苦手テーマを集中的に反復する練習です。",
              "商材情報、カテゴリー、ターゲット層、過去のアップロード分析に合わせて、営業担当者の弱点を1つから2つに絞ったAI顧客シナリオを日本語で作成してください。",
              "ターゲット層が空の場合は、商材のターゲット顧客・顧客課題・過去分析から最も練習価値が高いターゲット層を1つ選び、targetSegmentに入れてください。",
              "マニュアルのスコアルールがある場合は、ロープレの採点基準に自然に反映してください。加点条件はできた行動、減点条件は避ける行動として表現してください。",
              "過去分析に改善点や不足基準がある場合、その改善練習になる反論・顧客プロフィール・採点基準を必ず含めてください。",
              "過去分析に「話し癖改善」「口癖」「フィラー語」の指摘がある場合、えー、あの、まあ等を減らす練習ゴールと採点基準を必ず含めてください。",
              "過去分析がある場合は、営業担当者の弱点を補うためのロープレにしてください。顧客は苦手テーマが出るように反論し、未確認項目があると前向きにならない設定にしてください。",
              "title にはできるだけ苦手テーマが分かる言葉を入れてください。例: 価格反論を効果訴求に切り返す10分練習、決裁者確認の抜け漏れ克服。",
              "description には、どの弱点を何分程度で練習する課題かを明記してください。",
              "goal には、10分以内に達成する行動を1文で具体的に書いてください。例: 価格反論に対して確認質問を返し、効果・事例・次回アクションまでつなげる。",
              "difficulty は原則 hard にしてください。明らかに初回練習向けの場合のみ normal を許可します。easy は使わないでください。",
              "evaluationCriteria には、できたかどうか判定できる行動基準を6〜10個入れてください。最初の3項目は必ず弱点テーマに直結する合格条件にしてください。",
              "特に課題深掘り、価値接続、予算確認、決裁/社内確認、導入時期確認、次回アクション確定を優先してください。",
              "営業担当が練習しやすいよう、顧客プロフィール、反論、採点基準を具体化してください。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `商材名: ${product.name}`,
              `カテゴリー: ${category}`,
              `ターゲット層: ${targetSegment || "AIで選定"}`,
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
  const resolvedTargetSegment = resolveTargetSegment(product, targetSegment);
  const improvementFocus = meetingInsights[0] ?? "顧客課題を深掘りし、導入効果を具体的に示す";
  const fillerFocus = meetingInsights.find((item) => item.includes("話し癖改善") || item.includes("口癖") || item.includes("フィラー"));
  return {
    title: `${product.name} ${category} ${resolvedTargetSegment} 弱点克服10分練習`,
    description: `${resolvedTargetSegment}の${category}顧客に対して、過去分析で見えた改善点を10分以内で集中的に練習するシナリオです。`,
    targetSegment: resolvedTargetSegment,
    customerRole: category === "新規" ? "部門責任者" : "既存顧客の責任者",
    customerProfile: `${resolvedTargetSegment}領域で課題を感じているが、導入効果や運用負担に慎重な顧客。過去商談での改善テーマは「${improvementFocus}」。`,
    goal: `10分以内に「${improvementFocus}」を重点練習し、顧客課題の確認、価値訴求、次回アクション合意までつなげる。${fillerFocus ? "話し癖を抑え、短く明確に話す練習も行う。" : ""}`,
    objections: ["費用対効果が見えません", "今のやり方でも困っていません", "導入や運用が大変そうです"],
    evaluationCriteria: [
      `重点弱点「${improvementFocus}」に対して、確認質問または切り返しができている`,
      "10分以内に練習テーマから話をそらさず、改善したい行動を実行できている",
      "課題の背景・原因・影響まで深掘りできている",
      "商材価値を顧客の課題や成果に接続できている",
      "予算感・費用対効果・判断基準を確認できている",
      "決裁者・社内確認・意思決定フローを確認できている",
      "導入時期・開始時期・検討スケジュールを確認できている",
      "次回日程・資料送付・見積提出など次の動きを合意できている",
      "顧客課題を具体的に確認できている",
      "商材価値をターゲット層に合わせて説明できている",
      "反論に対して根拠をもって切り返せている",
      improvementFocus,
      ...(fillerFocus ? ["えー、あの、まあ等のフィラー語を減らし、沈黙を恐れずに話せている"] : []),
    ],
    difficulty: meetingInsights.length > 0 ? "hard" : "normal",
  };
}

function normalizeScenario(value: GeneratedScenario): GeneratedScenario {
  const fallback = buildFallbackScenario({ name: "商材" }, "新規", "ターゲット");
  return {
    title: readString(value.title) || fallback.title,
    description: readString(value.description),
    targetSegment: readString(value.targetSegment) || fallback.targetSegment,
    customerRole: readString(value.customerRole) || fallback.customerRole,
    customerProfile: readString(value.customerProfile),
    goal: readString(value.goal) || fallback.goal,
    objections: readStringArray(value.objections),
    evaluationCriteria: readStringArray(value.evaluationCriteria),
    difficulty: value.difficulty === "easy" || value.difficulty === "hard" ? value.difficulty : "normal",
  };
}

function resolveTargetSegment(product: ProductPayload, targetSegment: string) {
  const explicit = targetSegment.trim();
  if (explicit) return explicit;
  const targetCustomer = readString(product.targetCustomer).split(/[、,\n/]/)[0]?.trim();
  if (targetCustomer) return targetCustomer;
  const painPoint = product.painPoints?.find(Boolean);
  if (painPoint) return `${painPoint}がある顧客`;
  return "重点ターゲット";
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
