import { getCurrentProfile } from "@/lib/db/queries/session";
import { getCaptacion, getCaptadoras } from "../actions";
import { CaptacionDetailClient } from "./detail-client";
import { createAdminClient } from "@/lib/db/admin";

export const dynamic = "force-dynamic";

export default async function CaptacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const [photosResult, logsResult, captadoras] = await Promise.allSettled([
    db.from("captacion_photos").select("*").eq("captacion_id", id).order("position"),
    db
      .from("captacion_logs")
      .select("*, profiles:created_by(full_name)")
      .eq("captacion_id", id)
      .order("created_at", { ascending: false }),
    getCaptadoras(),
  ]);

  const photos = photosResult.status === "fulfilled" ? (photosResult.value.data || []) : [];
  const logs = logsResult.status === "fulfilled" ? (logsResult.value.data || []) : [];
  const captadorasList = captadoras.status === "fulfilled" ? (captadoras.value || []) : [];

  return (
    <CaptacionDetailClient
      captacion={captacion}
      userRole={profile.role}
      currentUserId={profile.id}
      photos={photos}
      logs={logs}
      captadoras={captadorasList}
    />
  );
}
