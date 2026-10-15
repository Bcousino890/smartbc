import { redirect } from "next/navigation";

// Diagnóstico se eliminó: la salud de los scrapers está en Sindicación.
export default async function AdminDiagnosticoPage({ params }: { params: Promise<{ country: string }> }) {
  const { country } = await params;
  redirect(`/${country === "cl" ? "cl" : "es"}/admin/sindicacion`);
}
