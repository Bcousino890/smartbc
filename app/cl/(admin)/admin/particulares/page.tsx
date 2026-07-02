import { redirect } from "next/navigation";

// "Particulares" lista anuncios scrapeados de Idealista (España). El flujo
// equivalente en Chile es el módulo de Captaciones (Portal Inmobiliario).
export default function ParticularesRedirect() {
  redirect("/cl/admin/captaciones");
}
