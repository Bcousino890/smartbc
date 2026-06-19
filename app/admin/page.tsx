import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";

export default async function AdminRedirect() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const country = (profile as any).country ?? "es";
  redirect(`/${country}/admin`);
}
