import { redirect } from "next/navigation";

// El diagnóstico del scraper de Idealista es un módulo de España.
export default function DiagnosticoRedirect() {
  redirect("/cl/admin");
}
