import { redirect } from "next/navigation";

// Las agencias colaboradoras son un módulo de España; en Chile no aplica.
export default function AgenciasRedirect() {
  redirect("/cl/admin");
}
