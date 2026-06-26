import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";

// Catch-all: /admin/[...slug] → /{country}/admin/[...slug]
export default async function AdminCatchAll({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const [profile, { slug }] = await Promise.all([
    getCurrentProfile(),
    params,
  ]);

  const country = (profile as any)?.country ?? "es";
  const path = slug?.join("/") ?? "";
  redirect(`/${country}/admin/${path}`);
}
