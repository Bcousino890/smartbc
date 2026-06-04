import { createClient } from "@/lib/db/server";
import { CalendarioClient } from "./calendario-client";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let connected = false;
  let connectedAt: string | undefined;

  if (user) {
    const { data: tokenRow } = await supabase
      .from("google_calendar_tokens")
      .select("created_at, token_expiry")
      .eq("user_id", user.id)
      .maybeSingle();

    connected = !!tokenRow;
    connectedAt = (tokenRow as { created_at: string } | null)?.created_at ?? undefined;
  }

  // Obtener visitas pendientes para el badge
  const { count: pendingCount } = await supabase
    .from("visit_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <CalendarioClient
      initialConnected={connected}
      initialConnectedAt={connectedAt}
      pendingVisits={pendingCount ?? 0}
    />
  );
}
