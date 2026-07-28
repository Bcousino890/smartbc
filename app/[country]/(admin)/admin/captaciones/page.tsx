import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { CaptacionesClient } from "./captaciones-client";
import { getCaptacionesForAgent, getCaptacionesForCaptadora, getCaptacionesAll, getChileAssignableUsers, attachDataQualityFlags, type Captacion } from "./actions";
import { getCaptacionEditableFields, getCaptacionViewRestriction } from "@/lib/permissions";
import { getCaptacionActor } from "@/lib/db/queries/captacion-access";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { getPipelinesForCountry, getStagesForPipeline } from "@/lib/captaciones/pipeline";

export const dynamic = "force-dynamic";

export default async function CaptacionesPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  // Captaciones es un módulo exclusivo de Chile (flujo captación→propiedad
  // vía Portal Inmobiliario). En España no aplica.
  if (country !== "cl") redirect(getCountryConfig(country).prefix);

  const profile = await getCurrentProfile();

  if (!profile) {
    return <div className="p-10 text-center">No autorizado</div>;
  }

  // Permisos EFECTIVOS en Chile (rol por país + rol personalizado +
  // excepciones del usuario), no el rol global a pelo.
  const actor = await getCaptacionActor(profile);

  // Verificar permiso base de visualización
  if (!(actor.effective.captaciones?.view ?? false)) {
    return (
      <div className="p-10 text-center">
        <p className="text-ink/55">No tienes acceso a las captaciones.</p>
      </div>
    );
  }

  // Aplicar filtrado según rol efectivo
  const viewRestriction = getCaptacionViewRestriction(actor.role);

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

  // Indicadores de calidad de datos para los filtros del listado (sin
  // dirección, con rol SII, sin teléfono, con nombre)
  try {
    captaciones = await attachDataQualityFlags(captaciones);
  } catch {
    // Si falla (ej. tabla captacion_contacts no existe todavía), se muestra
    // el listado igual sin los indicadores.
  }

  // Para asignación rápida desde el pipeline (solo quien puede asignar).
  // Cualquier usuario staff de Chile puede recibir la captación, no solo
  // captadoras.
  const canAssign =
    actor.isAdmin || getCaptacionEditableFields(actor.role).canAssignCaptadora === true;
  const canDelete = actor.effective.captaciones?.delete ?? false;
  let assignableUsers: Array<{ id: string; full_name: string | null; role: string }> = [];
  if (canAssign) {
    try {
      assignableUsers = await getChileAssignableUsers();
    } catch (e) {
      console.error("getChileAssignableUsers error:", e);
      assignableUsers = [];
    }
  }

  // Pipelines configurables (migración 0078): puede haber más de uno, cada
  // uno con sus propias etapas. El admin los gestiona desde /pipelines.
  let pipelines: Array<{ id: string; name: string; is_default: boolean; stages: any[] }> = [];
  try {
    const rawPipelines = await getPipelinesForCountry("cl");
    pipelines = await Promise.all(
      rawPipelines.map(async (p) => ({ ...p, stages: await getStagesForPipeline(p.id) }))
    );
  } catch {
    pipelines = [];
  }
  const canConfigurePipelines = actor.isAdmin;

  return (
    <CaptacionesClient
      captaciones={captaciones}
      userRole={actor.role}
      assignableUsers={assignableUsers}
      canAssign={canAssign}
      canDelete={canDelete}
      pipelines={pipelines}
      canConfigurePipelines={canConfigurePipelines}
    />
  );
}
