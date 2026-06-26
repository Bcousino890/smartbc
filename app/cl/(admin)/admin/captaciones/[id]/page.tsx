import { getCurrentProfile } from "@/lib/db/queries/session";
import { getCaptacion } from "../actions";
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

  const captacion = await getCaptacion(id);

  if (!captacion) {
    return <div className="p-10 text-center">Captación no encontrada</div>;
  }

  // Load photos and logs
  const db = createAdminClient() as any;
  const [{ data: photos }, { data: logs }] = await Promise.all([
    db.from("captacion_photos").select("*").eq("captacion_id", id).order("position"),
    db
      .from("captacion_logs")
      .select("*, profiles:created_by(full_name)")
      .eq("captacion_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <CaptacionDetailClient
      captacion={captacion}
      userRole={profile.role}
      photos={photos || []}
      logs={logs || []}
    />
  );
}
