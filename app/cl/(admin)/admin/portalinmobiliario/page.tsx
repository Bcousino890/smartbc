import { redirect } from "next/navigation";

// Módulo unificado: la publicación en PortalInmobiliario.com vive dentro de
// /cl/admin/publicacion (pestaña "PortalInmobiliario.com"). Esta ruta era un
// duplicado sin entrada en el menú.
export default function PortalinmobiliarioRedirect() {
  redirect("/cl/admin/publicacion");
}
