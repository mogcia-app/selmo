import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SalesDemoPage() {
  redirect("/sales/demo/dashboard");
}
