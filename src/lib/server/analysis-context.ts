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
};

export async function loadAnalysisContext(input: {
  companyId?: string | null;
  productName?: string | null;
}): Promise<AnalysisContext> {
  const db = getFirebaseAdminDb();
  if (!db || !input.companyId) {
    return { product: null, manual: null };
  }

  const [productsSnapshot, manualsSnapshot] = await Promise.all([
    db.collection("knowledgeProducts").where("companyId", "==", input.companyId).get(),
    db.collection("salesManuals").where("companyId", "==", input.companyId).where("status", "==", "active").get(),
  ]);
  const normalizedProductName = input.productName?.trim() ?? "";
  const productDoc =
    productsSnapshot.docs.find((doc) => readString(doc.data().name) === normalizedProductName) ??
    productsSnapshot.docs.find((doc) => normalizedProductName && readString(doc.data().name).includes(normalizedProductName));
  const matchedProductName = readString(productDoc?.data().name) || normalizedProductName;
  const manualDoc =
    manualsSnapshot.docs.find((doc) => matchedProductName && readString(doc.data().productName) === matchedProductName) ??
    manualsSnapshot.docs[0] ??
    null;

  return {
    product: productDoc ? mapProduct(productDoc.data()) : null,
    manual: manualDoc ? mapManual(manualDoc.data()) : null,
  };
}

export function buildAnalysisContextPrompt(context: AnalysisContext) {
  const sections: string[] = [];

  if (context.product) {
    sections.push(
      [
        "【商材情報】",
        `商品名: ${context.product.name}`,
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
