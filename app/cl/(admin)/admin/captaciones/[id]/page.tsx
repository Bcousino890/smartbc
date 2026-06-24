import { getCurrentProfile } from "@/lib/db/queries/session";
import { getCaptacion } from "../actions";
import { CaptacionDetailClient } from "./detail-client";

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

  return (
    <CaptacionDetailClient
      captacion={captacion}
      userRole={profile.role}
    />
  );
}
