import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getCaptacion, getChileAssignableUsers } from "../actions";
import { CaptacionDetailClient } from "./detail-client";
import { createAdminClient } from "@/lib/db/admin";
import { getCountryConfig, type Country } from "@/lib/country-config";

export const dynamic = "force-dynamic";

export default async function CaptacionDetailPage({
  params,
}: {
  params: Promise<{ id: string; country: Country }>;
}) {
  const { id, country } = await params;
  // Captaciones es un módulo exclusivo de Chile.
  if (country !== "cl") redirect(getCountryConfig(country).prefix);

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
    db
      .from("captacion_logs")
      .select("*, profiles:created_by(full_name)")
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
  const logs = logsResult.status === "fulfilled" ? (logsResult.value.data || []) : [];
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

  return (
    <CaptacionDetailClient
      captacion={captacion}
      userRole={profile.role}
      currentUserId={profile.id}
      photos={photos}
      logs={logs}
      captadoras={captadorasList}
      listingOperations={listingOperations}
    />
  );
}
