import { redirect } from "next/navigation";
import { getCountryConfig, type Country } from "@/lib/country-config";

// Antes era una página aparte; ahora vive plegada dentro de /particulares
// ("Configuración scraper Idealista"). Se deja este redirect por si queda
// algún enlace o marcador viejo apuntando acá.
export default async function IdealistaScraperPageRedirect({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  redirect(`${getCountryConfig(country).prefix}/particulares`);
}
