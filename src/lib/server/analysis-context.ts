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
    sourceSummary: string;
  } | null;
  manual: {
    title: string;
    content: string;
    criteria: string[];
    requiredQuestions: string[];
    scoringRules: string[];
    objectionHandling: string[];
    closingRules: string[];
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
  const manualDoc = manualsSnapshot.docs[0] ?? null;

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
        `URL解析メモ: ${context.product.sourceSummary}`,
      ].filter((line) => !line.endsWith(": ")).join("\n"),
    );
  }

  if (context.manual) {
    sections.push(
      [
        "【営業成功基準】",
        `タイトル: ${context.manual.title}`,
        `概要: ${context.manual.content}`,
        `評価基準: ${context.manual.criteria.join(" / ")}`,
        `必須ヒアリング: ${context.manual.requiredQuestions.join(" / ")}`,
        `スコアルール: ${context.manual.scoringRules.join(" / ")}`,
        `反論対応: ${context.manual.objectionHandling.join(" / ")}`,
        `クロージング基準: ${context.manual.closingRules.join(" / ")}`,
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
    sourceSummary: readString(data.sourceSummary),
  };
}

function mapManual(data: DocumentData): NonNullable<AnalysisContext["manual"]> {
  return {
    title: readString(data.title),
    content: readString(data.content),
    criteria: readStringArray(data.criteria),
    requiredQuestions: readStringArray(data.requiredQuestions),
    scoringRules: readStringArray(data.scoringRules),
    objectionHandling: readStringArray(data.objectionHandling),
    closingRules: readStringArray(data.closingRules),
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}
