import "server-only";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/guard";
import { applyUpdate, loadControl, ControlInputError } from "@/lib/scrapers/control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Control del crawler desde el diálogo «Configuración de scrapers».
//
// GET       → zonas, ajustes, estado de cada crawler y modo. NUNCA devuelve la
//             clave de Crawio: solo si está configurada, su pista («rk-5ee…fad4») y su nombre.
// PUT/POST  → guarda lo que venga: prioridad de zonas, interruptores, presupuesto
//             y claves de Crawio. Valida todo antes de escribir nada.
//
// Permisos: ver = particulares/view; guardar = particulares/edit. El service
// role (createAdminClient) solo se usa dentro de lib/scrapers/control.ts, ya
// pasado el permiso.

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const gate = await requirePermission("particulares", "view");
  if (!gate.ok) return gate.response;

  try {
    // canEdit: para que la interfaz deshabilite los controles a quien solo puede mirar.
    const edit = await requirePermission("particulares", "edit");
    return NextResponse.json(await loadControl(edit.ok), { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "No se pudo leer el estado de los scrapers" }, { status: 500, headers: NO_STORE });
  }
}

async function save(req: Request) {
  const gate = await requirePermission("particulares", "edit");
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo no válido" }, { status: 400, headers: NO_STORE });
  }

  try {
    await applyUpdate(body, gate.profile.id);
    return NextResponse.json(await loadControl(true), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ControlInputError) {
      return NextResponse.json({ error: e.message }, { status: 400, headers: NO_STORE });
    }
    // Aquí no se registra el cuerpo: puede llevar la clave de Crawio.
    console.error("[scraper-control] error guardando:", e instanceof Error ? e.message : "desconocido");
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500, headers: NO_STORE });
  }
}

export const PUT = save;
export const POST = save;
