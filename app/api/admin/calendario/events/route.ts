import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { requirePermission } from "@/lib/auth/guard";

const STAFF_ROLES = ["owner", "admin", "advisor", "agent_admin", "agent_senior", "agent_junior"];

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  // Aislamiento por país: opcional para no cambiar el comportamiento de los
  // calendarios raíz/España (sin parámetro = todas). Chile pasa country=cl.
  const countryParam = searchParams.get("country");
  const country = countryParam === "es" || countryParam === "cl" ? countryParam : null;

  // Build date range for the month
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  let query = supabase
    .from("visit_requests")
    .select(`
      id,
      client_id,
      property_id,
      requested_at,
      status,
      notes,
      confirmed_at,
      completed_at,
      created_at,
      updated_at,
      properties ( id, title, address, zone ),
      profiles!visit_requests_client_id_fkey ( id, full_name, email )
    `)
    .gte("requested_at", monthStart)
    .lt("requested_at", monthEnd);
  if (country) query = query.eq("country", country);
  const { data, error } = await query.order("requested_at", { ascending: true });

  if (error) {
    console.error("Error fetching visits:", error);
    return NextResponse.json({ error: "Failed to fetch visits", events: [] }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}

export async function POST(request: NextRequest) {
  // Gate de autorización: crear eventos de calendario requiere calendario/create.
  const gate = await requirePermission("calendario", "create");
  if (!gate.ok) return gate.response;

  const supabase = await createClient();

  const body = await request.json();
  const { client_id, property_id, assigned_to, requested_at, status, notes } = body;

  if (!client_id || !property_id || !requested_at) {
    return NextResponse.json(
      { error: "client_id, property_id y requested_at son obligatorios" },
      { status: 400 },
    );
  }

  // País de la visita := país de la propiedad (determinista). Para propiedades
  // de España el resultado coincide con el default histórico ('es'), así que
  // el comportamiento de los árboles raíz/España no cambia.
  let visitCountry: string | null = null;
  const { data: propRow } = await supabase
    .from("properties")
    .select("country")
    .eq("id", property_id)
    .maybeSingle();
  visitCountry = (propRow as { country?: string } | null)?.country ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("visit_requests")
    .insert({
      client_id,
      property_id,
      assigned_to: assigned_to ?? null,
      requested_at,
      status: status ?? "pending",
      notes: notes ?? null,
      ...(visitCountry ? { country: visitCountry } : {}),
    })
    .select(`
      id,
      client_id,
      property_id,
      requested_at,
      status,
      notes,
      confirmed_at,
      completed_at,
      created_at,
      updated_at,
      properties ( id, title, address, zone ),
      profiles!visit_requests_client_id_fkey ( id, full_name, email )
    `)
    .single();

  if (error) {
    console.error("Error creating visit:", error);
    return NextResponse.json({ error: "Error al crear la visita" }, { status: 500 });
  }

  return NextResponse.json({ event: data }, { status: 201 });
}
