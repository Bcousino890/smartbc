import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { guardPage } from "@/lib/auth/guard";
import { getCaptacion, getChileAssignableUsers } from "../actions";
import { CaptacionDetailClient } from "./detail-client";
import { createAdminClient } from "@/lib/db/admin";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { getStagesForPipeline } from "@/lib/captaciones/pipeline";
import { getCaptacionActor, actorCanWorkCaptacion } from "@/lib/db/queries/captacion-access";

export const dynamic = "force-dynamic";

export default async function CaptacionDetailPage({
  params,
}: {
  params: Promise<{ id: string; country: Country }>;
}) {
  const { id, country } = await params;
  // Captaciones es un módulo exclusivo de Chile.
  if (country !== "cl") redirect(getCountryConfig(country).prefix);
  await guardPage("captaciones", country);

  const profile = await getCurrentProfile();

  if (!profile) {
    return <div className="p-10 text-center">No autorizado</div>;
  }

  let captacion;
  try {
    captacion = await getCaptacion(id);
  } catch (e) {
    console.error("getCaptacion error:", e);
    return <div className="p-10 text-center">Error al cargar la captación</div>;
  }

  if (!captacion) {
    return <div className="p-10 text-center">Captación no encontrada</div>;
  }

  const db = createAdminClient() as any;

  const [photosResult, logsResult, captadoras, assignedProfileResult, listingsResult] = await Promise.allSettled([
    db.from("captacion_photos").select("*").eq("captacion_id", id).order("position"),
    // OJO: no se puede embeber `profiles:created_by(...)` aquí. La FK de
    // captacion_logs.created_by apunta a auth.users, no a profiles, así que
    // PostgREST no encuentra la relación y devuelve error → el historial salía
    // siempre vacío ("Sin intentos registrados") aunque el intento sí se
    // hubiera guardado. El nombre del autor se resuelve aparte, más abajo.
    db
      .from("captacion_logs")
      .select("*")
      .eq("captacion_id", id)
      .order("created_at", { ascending: false }),
    getChileAssignableUsers(),
    // Fetch assigned user's profile by ID regardless of role (for name display)
    captacion.assigned_to
      ? db.from("profiles").select("id, full_name, role").eq("id", captacion.assigned_to).single()
      : Promise.resolve({ data: null }),
    // Avisos de corredoras: para mostrar en la Ficha si la propiedad también
    // está en arriendo/venta (la misma prop suele tener ambos avisos)
    db
      .from("captacion_listings")
      .select("operation, price, currency")
      .eq("captacion_id", id),
  ]);

  const photos = photosResult.status === "fulfilled" ? (photosResult.value.data || []) : [];
  if (photosResult.status === "fulfilled" && photosResult.value.error) {
    console.error("captacion_photos error:", photosResult.value.error);
  }
  if (logsResult.status === "rejected") {
    console.error("captacion_logs error:", logsResult.reason);
  } else if (logsResult.value.error) {
    console.error("captacion_logs error:", logsResult.value.error);
  }
  const logs: any[] = logsResult.status === "fulfilled" ? (logsResult.value.data || []) : [];

  // Nombre de quien registró cada intento. Se consulta por separado porque la
  // FK de created_by apunta a auth.users y PostgREST no puede embeber profiles.
  const logAuthorIds = [...new Set(logs.map((l) => l.created_by).filter(Boolean))];
  if (logAuthorIds.length > 0) {
    const { data: authors, error: authorsError } = await db
      .from("profiles")
      .select("id, full_name")
      .in("id", logAuthorIds);
    if (authorsError) {
      console.error("captacion_logs authors error:", authorsError);
    }
    const authorById = new Map(
      (authors || []).map((a: { id: string; full_name: string | null }) => [a.id, a])
    );
    for (const log of logs) {
      const author = authorById.get(log.created_by) as { full_name: string | null } | undefined;
      log.profiles = { full_name: author?.full_name ?? null };
    }
  }
  if (captadoras.status === "rejected") {
    console.error("getChileAssignableUsers error:", captadoras.reason);
  }
  const captadorasList = captadoras.status === "fulfilled" ? (captadoras.value || []) : [];
  const listingOperations =
    listingsResult.status === "fulfilled" ? (listingsResult.value.data || []) : [];

  // Ensure the assigned user's name is always available even if their role
  // isn't in the assignable list (ej: rol cambiado después de asignar)
  if (assignedProfileResult.status === "fulfilled" && assignedProfileResult.value.data) {
    const assignedProfile = assignedProfileResult.value.data as {
      id: string;
      full_name: string | null;
      role: string;
    };
    if (!captadorasList.find((c: { id: string }) => c.id === assignedProfile.id)) {
      captadorasList.push(assignedProfile);
    }
  }

  // Etapas del pipeline de esta captación (para la ficha/estado/conversión)
  const stages = captacion.pipeline_id ? await getStagesForPipeline(captacion.pipeline_id).catch(() => []) : [];

  // Permisos reales del usuario sobre ESTA captación. Se resuelven aquí (rol
  // por país + rol personalizado + excepciones) y se bajan al cliente ya
  // decididos: la UI no vuelve a comparar `role === "captadora"`, que era lo
  // que escondía el botón "+ Registrar Intento" y los botones de edición a
  // quien sí tenía permiso en la API.
  const actor = await getCaptacionActor(profile);
  const canWork = actorCanWorkCaptacion(actor, captacion);
  const canDelete = actor.effective.captaciones?.delete ?? false;

  return (
    <CaptacionDetailClient
      captacion={captacion}
      userRole={actor.role}
      canWork={canWork}
      canDelete={canDelete}
      currentUserId={profile.id}
      photos={photos}
      logs={logs}
      captadoras={captadorasList}
      listingOperations={listingOperations}
      stages={stages}
    />
  );
}
