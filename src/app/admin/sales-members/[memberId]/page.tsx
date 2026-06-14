import { redirect } from "next/navigation";

export default async function AdminSalesMemberAliasPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  redirect(`/admin/members/${memberId}`);
}
