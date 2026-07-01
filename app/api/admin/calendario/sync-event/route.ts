import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createCalendarEvent, refreshAccessToken } from "@/lib/google-calendar";

const STAFF_ROLES = ["owner", "admin", "advisor", "agent_admin", "agent_senior", "agent_junior"];

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const body = await request.json();
  const { visitId } = body;

  if (!visitId) {
    return NextResponse.json(
      { error: "visitId is required" },
      { status: 400 },
    );
  }

  try {
    // Get visit details
    const { data: visit, error: visitError } = await supabase
      .from("visit_requests")
      .select(`
        id,
        requested_at,
        status,
        notes,
        properties ( id, title, address, zone ),
        profiles!visit_requests_client_id_fkey ( id, full_name, email )
      `)
      .eq("id", visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json(
        { error: "Visit not found" },
        { status: 404 },
      );
    }

    // Get user's Google Calendar tokens
    const { data: googleTokens, error: tokenError } = await supabase
      .from("google_calendar_tokens")
      .select("access_token, refresh_token, token_expiry")
      .eq("user_id", profile.id)
      .single();

    if (tokenError || !googleTokens) {
      return NextResponse.json(
        { error: "Google Calendar not connected" },
        { status: 400 },
      );
    }

    let accessToken = googleTokens.access_token;

    // Check if token needs refresh
    if (googleTokens.token_expiry && new Date(googleTokens.token_expiry) < new Date()) {
      if (!googleTokens.refresh_token) {
        return NextResponse.json(
          { error: "Google Calendar token expired and cannot be refreshed" },
          { status: 400 },
        );
      }

      const newTokens = await refreshAccessToken(googleTokens.refresh_token);
      if (!newTokens.access_token) {
        return NextResponse.json(
          { error: "Failed to refresh Google Calendar token" },
          { status: 400 },
        );
      }

      accessToken = newTokens.access_token;

      // Update tokens in database
      await supabase
        .from("google_calendar_tokens")
        .update({
          access_token: newTokens.access_token,
          token_expiry: newTokens.expiry_date ? new Date(newTokens.expiry_date).toISOString() : null,
        })
        .eq("user_id", profile.id);
    }

    // Create Google Calendar event
    const startTime = new Date(visit.requested_at);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration

    const googleEvent = await createCalendarEvent(accessToken, {
      summary: `Visita: ${visit.properties?.title ?? "Propiedad"}`,
      description: [
        `Cliente: ${visit.profiles?.full_name ?? visit.profiles?.email ?? "—"}`,
        `Dirección: ${visit.properties?.address ?? "—"}`,
        visit.notes ? `Notas: ${visit.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      location: visit.properties?.address ?? undefined,
      startTime,
      endTime,
    });

    // Update visit with Google event ID
    const { error: updateError } = await supabase
      .from("visit_requests")
      .update({
        google_event_id: googleEvent.id,
        calendar_synced_at: new Date().toISOString(),
      })
      .eq("id", visitId);

    if (updateError) {
      console.error("Error updating visit with Google event ID:", updateError);
      return NextResponse.json(
        { error: "Event created in Google Calendar but failed to update database" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      googleEventId: googleEvent.id,
      message: "Event synced to Google Calendar",
    });
  } catch (error) {
    console.error("Error syncing event to Google Calendar:", error);
    return NextResponse.json(
      { error: "Failed to sync event to Google Calendar" },
      { status: 500 },
    );
  }
}
