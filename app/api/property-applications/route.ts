import "server-only";
import { createClient } from "@/lib/db/server";
import { requireSession } from "@/lib/db/auth-helpers";
import {
  createApplication,
  getApplicationsForAdmin,
} from "@/lib/db/queries/property-applications";
import type { ApplicationCountry, ApplicationOperation } from "@/lib/property-applications/types";

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const isStaff = ["admin", "advisor", "agent_admin", "agent_senior", "agent_junior"].includes(auth.role);
    if (!isStaff) return Response.json({ error: "Sin permiso" }, { status: 403 });

    const url = new URL(req.url);
    const country = url.searchParams.get("country") as ApplicationCountry | null;
    const operation = url.searchParams.get("operation") as ApplicationOperation | null;
    const status = url.searchParams.get("status") as string | null;
    const limit = parseInt(url.searchParams.get("limit") ?? "50");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    const { data, count } = await getApplicationsForAdmin({
      country: country ?? undefined,
      operation: operation ?? undefined,
      status: status as Parameters<typeof getApplicationsForAdmin>[0]["status"],
      limit,
      offset,
    });

    return Response.json({ data, count });
  } catch (err) {
    console.error("[apps-GET] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json() as {
      country: ApplicationCountry;
      operation: ApplicationOperation;
      property_id?: string;
    };

    if (!body.country || !body.operation) {
      return Response.json({ error: "Se requieren country y operation" }, { status: 400 });
    }

    const application = await createApplication({
      client_id: auth.userId,
      country: body.country,
      operation: body.operation,
      property_id: body.property_id,
    });

    return Response.json({ ok: true, id: application.id });
  } catch (err) {
    console.error("[apps-POST] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
