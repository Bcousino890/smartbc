import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import {
  getCalendarEvents,
  createCalendarEvent,
  type GoogleTokens,
} from "@/lib/integrations/google-calendar";

async function getTokens(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<GoogleTokens | null> {
  const { data } = await supabase
    .from("google_calendar_tokens")
    .select("access_token, refresh_token, token_expiry, calendar_id")
    .eq("user_id", userId)
    .single();

  if (!data) return null;
  return data as GoogleTokens;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokens = await getTokens(supabase, user.id);
  if (!tokens) {
    return NextResponse.json({ error: "Not connected", events: [] }, { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));

  const timeMin = new Date(year, month - 1, 1);
  const timeMax = new Date(year, month, 0, 23, 59, 59);

  try {
    const events = await getCalendarEvents(tokens, timeMin, timeMax);
    return NextResponse.json({ events });
  } catch (err) {
    console.error("Error fetching calendar events:", err);
    return NextResponse.json({ error: "Failed to fetch events", events: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokens = await getTokens(supabase, user.id);
  if (!tokens) {
    return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
  }

  const body = await request.json();
  const { title, description, start, end, attendees, location } = body;

  if (!title || !start || !end) {
    return NextResponse.json(
      { error: "title, start, and end are required" },
      { status: 400 },
    );
  }

  try {
    const event = await createCalendarEvent(tokens, {
      title,
      description,
      start: new Date(start),
      end: new Date(end),
      attendees,
      location,
    });
    return NextResponse.json({ event });
  } catch (err) {
    console.error("Error creating calendar event:", err);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}
