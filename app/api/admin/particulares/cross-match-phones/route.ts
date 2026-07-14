import "server-only";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { crossMatchPhones } from "@/lib/sync/particulares/cross-match-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

// Cross-match manual (Owner/Admin): rellena teléfonos de anuncios sin teléfono
// emparejándolos con anuncios de otro portal (p.ej. pisos.com) que sí lo tienen
// y son la misma propiedad. Sin red ni DataDome.
export async function POST() {
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const summary = await crossMatchPhones(supabase, { limit: 5000 });
  return NextResponse.json(summary, {
    status: summary.ok ? 200 : 500,
    headers: { "Cache-Control": "no-store" },
  });
}
