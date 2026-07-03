import { redirect } from "next/navigation";
import { getCountryConfig, type Country } from "@/lib/country-config";

// El dashboard real vive en la raíz de cada país (/{country}/admin). Esta
// ruta era una copia del dashboard de España (KPIs de particulares de
// Idealista) sin sentido fuera de ese contexto y sin entrada en el menú.
export default async function DashboardRedirect({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  redirect(getCountryConfig(country).prefix);
}
