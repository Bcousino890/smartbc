import { redirect } from "next/navigation";

// La sindicación de feeds (Idealista/Fotocasa) es solo de España.
export default function SindicacionRedirect() {
  redirect("/cl/admin");
}
