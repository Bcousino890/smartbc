import { redirect } from "next/navigation";

// Idealista es un módulo exclusivo de España. En Chile la publicación en
// portales se gestiona en /cl/admin/publicacion (Portal Inmobiliario).
export default function IdealistaRedirect() {
  redirect("/cl/admin/publicacion");
}
