import type { DocumentData } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export type ServerAnalysisConfigType = "meeting_upload" | "teleapo_upload" | "meeting_roleplay" | "teleapo_roleplay";

export type ServerAnalysisConfig = {
  title: string;
  productName: string;
  analysisType: ServerAnalysisConfigType;
  checklistItems: Array<{
    label: string;
    description: string;
    required: boolean;
  }>;
  scoringRules: string[];
  improvementInstruction: string;
  customPrompt: string;
};

export async function loadAnalysisConfig(input: {
  companyId?: string | null;
  productName?: string | null;
  analysisType: ServerAnalysisConfigType;
}): Promise<ServerAnalysisConfig | null> {
  const db = getFirebaseAdminDb();
  if (!db || !input.companyId) return null;

  const snapshot = await db
    .collection("analysisConfigs")
    .where("companyId", "==", input.companyId)
    .where("analysisType", "==", input.analysisType)
    .where("status", "==", "active")
    .get();

  const normalizedProductName = normalizeText(input.productName);
  const configs = snapshot.docs.map((doc) => doc.data());
  const matched =
    configs.find((config) => {
      const configProduct = normalizeText(readString(config.productName));
      return normalizedProductName && configProduct && isTextMatch(configProduct, normalizedProductName);
    }) ??
    configs.find((config) => !readString(config.productName).trim()) ??
    null;

  return matched ? mapAnalysisConfig(matched) : null;
}

export function buildAnalysisConfigPrompt(config: ServerAnalysisConfig | null) {
  if (!config) return "";

  return [
    "【admin管理の分析設定】",
    `タイトル: ${config.title}`,
    `対象: ${formatAnalysisType(config.analysisType)}`,
    `商材: ${config.productName || "全商材共通"}`,
    config.checklistItems.length > 0
      ? [
          "評価項目:",
          ...config.checklistItems.map((item, index) =>
            `${index + 1}. ${item.required ? "必須" : "任意"}: ${item.label}${item.description ? ` - ${item.description}` : ""}`,
          ),
        ].join("\n")
      : "",
    config.scoringRules.length > 0
      ? ["加点/減点ルール:", ...config.scoringRules.map((rule, index) => `${index + 1}. ${rule}`)].join("\n")
      : "",
    config.improvementInstruction ? `改善フレーズ指示: ${config.improvementInstruction}` : "",
    config.customPrompt ? `追加AI指示: ${config.customPrompt}` : "",
  ].filter(Boolean).join("\n");
}

function mapAnalysisConfig(data: DocumentData): ServerAnalysisConfig {
  return {
    title: readString(data.title, "分析設定"),
    productName: readString(data.productName),
    analysisType: readAnalysisType(data.analysisType),
    checklistItems: readChecklistItems(data.checklistItems),
    scoringRules: readStringArray(data.scoringRules),
    improvementInstruction: readString(data.improvementInstruction),
    customPrompt: readString(data.customPrompt),
  };
}

function readChecklistItems(value: unknown): ServerAnalysisConfig["checklistItems"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const label = readString(data.label).trim();
      if (!label) return null;
      return {
        label,
        description: readString(data.description),
        required: data.required === true,
      };
    })
    .filter((item): item is ServerAnalysisConfig["checklistItems"][number] => Boolean(item));
}

function readAnalysisType(value: unknown): ServerAnalysisConfigType {
  if (
    value === "meeting_upload" ||
    value === "teleapo_upload" ||
    value === "meeting_roleplay" ||
    value === "teleapo_roleplay"
  ) {
    return value;
  }
  return "meeting_roleplay";
}

function formatAnalysisType(value: ServerAnalysisConfigType) {
  if (value === "meeting_upload") return "商談アップロード分析";
  if (value === "teleapo_upload") return "テレアポアップロード分析";
  if (value === "meeting_roleplay") return "商談ロープレ分析";
  return "テレアポロープレ分析";
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function isTextMatch(left: string, right: string) {
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}
