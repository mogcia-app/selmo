import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminDemoPage() {
  redirect("/admin/demo/dashboard");
}
