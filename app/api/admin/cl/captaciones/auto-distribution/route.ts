import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { getCaptacionActor } from "@/lib/db/queries/captacion-access";
import {
  getAutoDistributionConfig,
  setAutoDistributionConfig,
} from "@/lib/captaciones/auto-distribution";
import { getChileAssignableUsers } from "@/app/[country]/(admin)/admin/captaciones/actions";

// Config del reparto automático de captaciones. Solo admin (admin/owner/
// agent_admin, vía actor.isAdmin) puede leerla o cambiarla.

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false as const, response: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  }
  const actor = await getCaptacionActor(profile);
  if (!actor.isAdmin) {
    return { ok: false as const, response: NextResponse.json({ error: "Solo administradores" }, { status: 403 }) };
  }
  return { ok: true as const, profile, actor };
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const db = createAdminClient() as any;
  const config = await getAutoDistributionConfig(db);
  return NextResponse.json({ config });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const body = await request.json();
    const enabled = Boolean(body?.enabled);
    const rawIds: unknown = body?.user_ids;
    if (!Array.isArray(rawIds)) {
      return NextResponse.json({ error: "user_ids debe ser una lista" }, { status: 400 });
    }

    // Solo se guardan ids que hoy son usuarios asignables (staff de Chile): así
    // el pool nunca queda con perfiles borrados o roles que ya no pueden recibir
    // captaciones. Se preserva el orden en el que llegan (importa para el
    // desempate del reparto).
    const assignable = await getChileAssignableUsers();
    const validIds = new Set(assignable.map((u) => u.id));
    const seen = new Set<string>();
    const userIds = rawIds
      .filter((id): id is string => typeof id === "string" && validIds.has(id))
      .filter((id) => (seen.has(id) ? false : (seen.add(id), true)));

    const db = createAdminClient() as any;
    const config = { enabled, user_ids: userIds };
    await setAutoDistributionConfig(db, config);

    return NextResponse.json({ success: true, config });
  } catch (err) {
    console.error("[captaciones auto-distribution POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al guardar la configuración" },
      { status: 500 }
    );
  }
}
