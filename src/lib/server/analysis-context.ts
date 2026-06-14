import type { DocumentData } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export type AnalysisContext = {
  product: {
    name: string;
    description: string;
    targetCustomer: string;
    painPoints: string[];
    valueProposition: string;
    pricing: string;
    competitors: string[];
    commonObjections: string[];
    faq: string[];
    successTalk: string[];
    ngTalk: string[];
    customFields: Array<{ label: string; value: string }>;
    sourceSummary: string;
  } | null;
  manual: {
    manualDomain: "meeting" | "teleapo";
    title: string;
    productName: string;
    manualCategory: string;
    targetSegment: string;
    content: string;
    criteria: string[];
    requiredQuestions: string[];
    scoringRules: string[];
    objectionHandling: string[];
    closingRules: string[];
    customFields: Array<{ label: string; value: string }>;
  } | null;
  pastTrends: string[];
};

export async function loadAnalysisContext(input: {
  companyId?: string | null;
  productName?: string | null;
  manualCategory?: string | null;
  targetSegment?: string | null;
  manualDomain?: string | null;
}): Promise<AnalysisContext> {
  const db = getFirebaseAdminDb();
  if (!db || !input.companyId) {
    return { product: null, manual: null, pastTrends: [] };
  }

  const [productsSnapshot, manualsSnapshot, meetingsSnapshot] = await Promise.all([
    db.collection("knowledgeProducts").where("companyId", "==", input.companyId).get(),
    db.collection("salesManuals").where("companyId", "==", input.companyId).where("status", "==", "active").get(),
    db.collection("meetings").where("companyId", "==", input.companyId).limit(40).get(),
  ]);
  const normalizedProductName = input.productName?.trim() ?? "";
  const normalizedManualCategory = normalizeText(input.manualCategory);
  const normalizedTargetSegment = normalizeText(input.targetSegment);
  const productDoc =
    productsSnapshot.docs.find((doc) => readString(doc.data().name) === normalizedProductName) ??
    productsSnapshot.docs.find((doc) => normalizedProductName && readString(doc.data().name).includes(normalizedProductName));
  const matchedProductName = readString(productDoc?.data().name) || normalizedProductName;
  const manualDoc = selectBestManual(
    manualsSnapshot.docs.map((doc) => doc.data()),
    {
      productName: matchedProductName,
      manualCategory: normalizedManualCategory,
      targetSegment: normalizedTargetSegment,
      manualDomain: readManualDomain(input.manualDomain),
    },
  );

  return {
    product: productDoc ? mapProduct(productDoc.data()) : null,
    manual: manualDoc ? mapManual(manualDoc) : null,
    pastTrends: buildPastTrends(meetingsSnapshot.docs.map((doc) => doc.data()), matchedProductName),
  };
}

function selectBestManual(
  manuals: DocumentData[],
  input: { productName: string; manualCategory: string; targetSegment: string; manualDomain: "meeting" | "teleapo" },
) {
  const scored = manuals
    .map((manual) => {
      const manualDomain = readManualDomain(manual.manualDomain);
      const productName = normalizeText(readString(manual.productName));
      const manualCategory = normalizeText(readString(manual.manualCategory));
      const targetSegment = normalizeText(readString(manual.targetSegment));
      const domainScore = manualDomain === input.manualDomain ? 10 : -20;
      const productScore = input.productName && isTextMatch(productName, normalizeText(input.productName)) ? 8 : 0;
      const categoryScore = input.manualCategory && manualCategory === input.manualCategory ? 5 : 0;
      const targetScore = input.targetSegment && isTextMatch(targetSegment, input.targetSegment) ? 4 : 0;
      return { manual, score: domainScore + productScore + categoryScore + targetScore };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.manual ?? manuals.find((manual) => readManualDomain(manual.manualDomain) === input.manualDomain) ?? manuals[0] ?? null;
}

function isTextMatch(left: string, right: string) {
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export function buildAnalysisContextPrompt(context: AnalysisContext) {
  const sections: string[] = [];

  if (context.product) {
    sections.push(
      [
        "【商材情報】",
        `商材名: ${context.product.name}`,
        `概要: ${context.product.description}`,
        `ターゲット: ${context.product.targetCustomer}`,
        `顧客課題: ${context.product.painPoints.join(" / ")}`,
        `価値訴求: ${context.product.valueProposition}`,
        `料金: ${context.product.pricing}`,
        `競合: ${context.product.competitors.join(" / ")}`,
        `よくある反論: ${context.product.commonObjections.join(" / ")}`,
        `FAQ: ${context.product.faq.join(" / ")}`,
        `成功トーク: ${context.product.successTalk.join(" / ")}`,
        `NGトーク: ${context.product.ngTalk.join(" / ")}`,
        ...context.product.customFields.map((field) => `${field.label}: ${field.value}`),
        `URL解析メモ: ${context.product.sourceSummary}`,
      ].filter((line) => !line.endsWith(": ")).join("\n"),
    );
  }

  if (context.manual) {
    sections.push(
      [
        "【営業成功基準】",
        `タイトル: ${context.manual.title}`,
        `種別: ${context.manual.manualDomain === "teleapo" ? "テレアポ" : "商談"}`,
        `商材: ${context.manual.productName}`,
        `カテゴリー: ${context.manual.manualCategory}`,
        `ターゲット層: ${context.manual.targetSegment}`,
        `概要: ${context.manual.content}`,
        `評価基準: ${context.manual.criteria.join(" / ")}`,
        `必須ヒアリング: ${context.manual.requiredQuestions.join(" / ")}`,
        `スコアルール: ${context.manual.scoringRules.join(" / ")}`,
        `反論対応: ${context.manual.objectionHandling.join(" / ")}`,
        `クロージング基準: ${context.manual.closingRules.join(" / ")}`,
        ...context.manual.customFields.map((field) => `${field.label}: ${field.value}`),
      ].filter((line) => !line.endsWith(": ")).join("\n"),
    );
  }

  if (context.pastTrends.length > 0) {
    sections.push(
      [
        "【過去分析の傾向】",
        ...context.pastTrends.map((trend, index) => `${index + 1}. ${trend}`),
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}

function mapProduct(data: DocumentData): NonNullable<AnalysisContext["product"]> {
  return {
    name: readString(data.name),
    description: readString(data.description),
    targetCustomer: readString(data.targetCustomer),
    painPoints: readStringArray(data.painPoints),
    valueProposition: readString(data.valueProposition),
    pricing: readString(data.pricing),
    competitors: readStringArray(data.competitors),
    commonObjections: readStringArray(data.commonObjections),
    faq: readStringArray(data.faq),
    successTalk: readStringArray(data.successTalk),
    ngTalk: readStringArray(data.ngTalk),
    customFields: readCustomFields(data.customFields),
    sourceSummary: readString(data.sourceSummary),
  };
}

function mapManual(data: DocumentData): NonNullable<AnalysisContext["manual"]> {
  return {
    manualDomain: readManualDomain(data.manualDomain),
    title: readString(data.title),
    productName: readString(data.productName),
    manualCategory: readString(data.manualCategory),
    targetSegment: readString(data.targetSegment),
    content: readString(data.content),
    criteria: readStringArray(data.criteria),
    requiredQuestions: readStringArray(data.requiredQuestions),
    scoringRules: readStringArray(data.scoringRules),
    objectionHandling: readStringArray(data.objectionHandling),
    closingRules: readStringArray(data.closingRules),
    customFields: readCustomFields(data.customFields),
  };
}

function readManualDomain(value: unknown): "meeting" | "teleapo" {
  return value === "teleapo" ? "teleapo" : "meeting";
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function readCustomFields(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const label = readString(data.label).trim();
      const fieldValue = readString(data.value).trim();
      return label && fieldValue ? { label, value: fieldValue } : null;
    })
    .filter((item): item is { label: string; value: string } => Boolean(item));
}

function buildPastTrends(meetings: DocumentData[], productName: string) {
  return meetings
    .filter((meeting) => {
      const meetingProduct = readString(meeting.productType);
      return productName ? meetingProduct === productName || meetingProduct.includes(productName) : true;
    })
    .map((meeting) => {
      const aiSummary = meeting.aiSummary;
      if (!aiSummary || typeof aiSummary !== "object") return "";
      const data = aiSummary as Record<string, unknown>;
      const overview = readString(data.overview).trim();
      const manualCompliance = data.manualCompliance && typeof data.manualCompliance === "object"
        ? (data.manualCompliance as Record<string, unknown>)
        : null;
      const missing = readStringArray(manualCompliance?.missingCriteria).slice(0, 2).join(" / ");
      const improvement = readStringArray(manualCompliance?.improvementPhrases).slice(0, 1).join(" / ");
      return [overview, missing ? `不足: ${missing}` : "", improvement ? `改善例: ${improvement}` : ""]
        .filter(Boolean)
        .join(" / ");
    })
    .filter(Boolean)
    .slice(0, 5);
}
