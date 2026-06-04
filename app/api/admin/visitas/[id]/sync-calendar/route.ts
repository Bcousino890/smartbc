import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import {
  createCalendarEvent,
  updateCalendarEvent,
  type GoogleTokens,
} from "@/lib/integrations/google-calendar";

async function getTokens(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<GoogleTokens | null> {
  const { data } = await supabase
    .from("google_calendar_tokens")
    .select("access_token, refresh_token, token_expiry, calendar_id")
    .eq("user_id", userId)
    .single();

  if (!data) return null;
  return data as GoogleTokens;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verificar que el usuario es staff
  const { data: profileData } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const profile = profileData as { role: string } | null;
  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tokens = await getTokens(supabase, user.id);
  if (!tokens) {
    return NextResponse.json(
      { error: "Google Calendar not connected" },
      { status: 400 },
    );
  }

  type VisitWithRelations = {
    id: string;
    requested_at: string;
    notes: string | null;
    google_event_id: string | null;
    profiles: { id: string; full_name: string | null; email: string } | { id: string; full_name: string | null; email: string }[] | null;
    properties: { id: string; title: string; slug: string } | { id: string; title: string; slug: string }[] | null;
  };

  // Obtener la visita con datos del cliente y la propiedad
  const { data: visitRaw, error: visitError } = await supabase
    .from("visit_requests")
    .select(
      `
      id,
      requested_at,
      notes,
      google_event_id,
      profiles:client_id (id, full_name, email),
      properties:property_id (id, title, slug)
    `,
    )
    .eq("id", id)
    .single();

  const visit = visitRaw as VisitWithRelations | null;

  if (visitError || !visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const clientProfile = Array.isArray(visit.profiles)
    ? visit.profiles[0]
    : visit.profiles;
  const property = Array.isArray(visit.properties)
    ? visit.properties[0]
    : visit.properties;

  const startDate = new Date(visit.requested_at);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hora

  const title = `Visita · ${property?.title ?? "Propiedad"}`;
  const description = [
    `Cliente: ${clientProfile?.full_name ?? "Sin nombre"} (${clientProfile?.email ?? ""})`,
    visit.notes ? `Notas: ${visit.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const attendees = clientProfile?.email ? [clientProfile.email] : [];

  try {
    let googleEvent;

    if (visit.google_event_id) {
      // Actualizar evento existente
      googleEvent = await updateCalendarEvent(tokens, visit.google_event_id, {
        title,
        description,
        start: startDate,
        end: endDate,
        attendees,
      });
    } else {
      // Crear nuevo evento
      googleEvent = await createCalendarEvent(tokens, {
        title,
        description,
        start: startDate,
        end: endDate,
        attendees,
      });
    }

    // Guardar el event ID en la visita
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("visit_requests") as any)
      .update({
        google_event_id: googleEvent.id ?? null,
        calendar_synced_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      success: true,
      eventId: googleEvent.id,
      eventLink: googleEvent.htmlLink,
    });
  } catch (err) {
    console.error("Error syncing visit to Google Calendar:", err);
    return NextResponse.json(
      { error: "Failed to sync to Google Calendar" },
      { status: 500 },
    );
  }
}
