import { redirect } from "next/navigation";

// El dashboard de Chile vive en /cl/admin. Esta ruta era una copia del
// dashboard de España (KPIs de particulares de Idealista) sin sentido en CL.
export default function DashboardRedirect() {
  redirect("/cl/admin");
}
