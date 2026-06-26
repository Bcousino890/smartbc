import { getCurrentProfile } from "@/lib/db/queries/session";
import { CaptacionesClient } from "./captaciones-client";
import { getCaptacionesForAgent, getCaptacionesForCaptadora, getCaptacionesAll } from "./actions";

export const dynamic = "force-dynamic";

export default async function CaptacionesPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return <div className="p-10 text-center">No autorizado</div>;
  }

  const isCaptadora = profile.role === "captadora";
  const isAdmin = profile.role === "admin";
  const captaciones = isCaptadora
    ? await getCaptacionesForCaptadora(profile.id)
    : isAdmin
    ? await getCaptacionesAll()
    : await getCaptacionesForAgent(profile.id);

  return (
    <CaptacionesClient
      captaciones={captaciones}
      userRole={profile.role}
    />
  );
}
