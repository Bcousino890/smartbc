import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";

// Este "segundo dashboard" (KPIs de particulares de Idealista) no tenía
// entrada en el menú y era una copia sin mantenimiento del dashboard real.
// El dashboard real vive en la raíz de cada país: /{country}/admin.
export default async function DashboardRedirect() {
  const profile = await getCurrentProfile();
  const country = (profile as any)?.country === "cl" ? "cl" : "es";
  redirect(`/${country}/admin`);
}
