import { redirect } from "next/navigation";

export default async function AdminAnalysisRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<{ category?: string }>;
}) {
  const params = await searchParams;
  const category = params?.category === "teleapo" ? "teleapo" : "meeting";
  redirect(`/admin/meetings?category=${category}`);
}
