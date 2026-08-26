import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";

export default async function ClientFichaRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  const country = (profile as any)?.country === "cl" ? "cl" : "es";
  redirect(`/${country}/admin/clientes/${id}`);
}
