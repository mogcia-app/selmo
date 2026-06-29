"use client";

import { useParams } from "next/navigation";

import { KnowledgeEditorScreen } from "@/app/sales/knowledge/components/knowledge-editor-screen";

export default function SalesProductKnowledgeEditPage() {
  const params = useParams<{ knowledgeId: string }>();
  return <KnowledgeEditorScreen mode="edit" knowledgeId={params.knowledgeId} />;
}
