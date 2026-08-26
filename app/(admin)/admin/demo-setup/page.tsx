import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";

export default async function DemoSetupRedirect() {
  const profile = await getCurrentProfile();
  const country = (profile as any)?.country === "cl" ? "cl" : "es";
  redirect(`/${country}/admin/demo-setup`);
}
