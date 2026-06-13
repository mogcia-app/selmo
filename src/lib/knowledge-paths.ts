export function getKnowledgeBasePath(pathname: string) {
  return pathname.startsWith("/admin/knowledge") ? "/admin/knowledge" : "/sales/knowledge";
}
