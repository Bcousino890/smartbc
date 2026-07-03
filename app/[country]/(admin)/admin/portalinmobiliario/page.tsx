import { redirect } from "next/navigation";
import { getCountryConfig, type Country } from "@/lib/country-config";

// Módulo unificado: la publicación en PortalInmobiliario.com vive dentro de
// /cl/admin/publicacion (pestaña "PortalInmobiliario.com"). Esta ruta era un
// duplicado sin entrada en el menú (solo existía en Chile).
export default async function PortalinmobiliarioRedirect({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  redirect(`${getCountryConfig(country).prefix}/publicacion`);
}
