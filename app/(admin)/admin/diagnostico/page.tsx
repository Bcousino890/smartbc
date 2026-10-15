import { redirect } from "next/navigation";

// Diagnóstico se eliminó: la salud de los scrapers está en Sindicación.
export default function AdminDiagnosticoPage() {
  redirect("/es/admin/sindicacion");
}
