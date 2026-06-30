import { getCurrentProfile } from "@/lib/db/queries/session";
import { CaptacionesClient } from "./captaciones-client";
import { getCaptacionesForAgent, getCaptacionesForCaptadora, getCaptacionesAll, type Captacion } from "./actions";
import { canAccess } from "@/lib/permissions";
import { getCaptacionEditPermissions } from "@/lib/db/queries/permissions";

export const dynamic = "force-dynamic";

export default async function CaptacionesPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return <div className="p-10 text-center">No autorizado</div>;
  }

  // Verificar permiso base de visualización
  if (!canAccess(profile.role, "captaciones", "view")) {
    return (
      <div className="p-10 text-center">
        <p className="text-ink/55">No tienes acceso a las captaciones.</p>
      </div>
    );
  }

  // Aplicar filtrado según rol y permisos granulares
  const editPerms = getCaptacionEditPermissions(profile.role);
  const viewRestriction = editPerms.viewRestriction;

  let captaciones: Captacion[];
  switch (viewRestriction) {
    case "all":
      // Admin, owner, agent_admin: ver todas
      captaciones = await getCaptacionesAll();
      break;
    case "assigned_only":
      // Captadora: solo asignadas
      captaciones = await getCaptacionesForCaptadora(profile.id);
      break;
    case "confirmed_and_own":
      // Agente: propias + confirmadas
      captaciones = await getCaptacionesForAgent(profile.id);
      break;
    default:
      captaciones = [];
  }

  return (
    <CaptacionesClient
      captaciones={captaciones}
      userRole={profile.role}
    />
  );
}
