import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";

export default async function AdminSindicacionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await getCurrentProfile();
  const country = (profile as any)?.country === "cl" ? "cl" : "es";
  const { tab } = await searchParams;
  redirect(`/${country}/admin/sindicacion${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`);
}
