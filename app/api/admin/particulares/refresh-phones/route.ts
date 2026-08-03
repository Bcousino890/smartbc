import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getProxyUrl } from "@/lib/sync/proxy-config";
import { lookupIdealistaPhone } from "@/lib/sync/particulares/phone-lookup";
import { withMigration0035Fallback } from "@/lib/sync/particulares/migration-fallback";
import { checkCapSolverBalanceGuard } from "@/lib/sync/particulares/capsolver-guard";
import { buildPhoneCandidateQuery } from "@/lib/sync/particulares/phone-candidates";
import { normalizeZone } from "@/lib/madrid-zones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ventana de filas candidatas a barajar en memoria cuando se filtra por
// distrito (`?zone=`): el filtro de distrito no vive en SQL (normalizeZone
// vive en JS), así que se trae una ventana amplia ordenada por
// updated_at asc y se filtra aquí. Las filas descartadas por no ser del
// distrito pedido NO se tocan, así que vuelven a aparecer en la próxima
// llamada (barrido normal, sin filtro) o en la siguiente tanda del mismo
// distrito una vez que las procesadas ya no estén "primeras" en la cola.
const ZONE_FETCH_WINDOW = 500;

async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  const profile = await getCurrentProfile().catch(() => null);
  return !!profile && canAccess(profile.role, "particulares", "edit");
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  // Distrito de Madrid a barrer (p.ej. "Salamanca", "Chamberí"). Vacío = sin filtro.
  const zone = (searchParams.get("zone") ?? "").trim();

  // Freno de saldo ANTES de gastar un solo request: si ya está bajo, ni arranca.
  const guard = await checkCapSolverBalanceGuard();
  if (guard.blocked) {
    return Response.json({
      ok: false,
      stopped: "low_capsolver_balance",
      capsolver_balance: guard.balance,
      min_required: guard.min,
      message: `Saldo de CapSolver ($${guard.balance}) por debajo del mínimo ($${guard.min}) — barrido detenido para no fundirlo.`,
    }, { status: 200 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const now = new Date().toISOString();

  const { data: candidateRows, error } = await buildPhoneCandidateQuery(db, "missing", {
    limit: zone ? ZONE_FETCH_WINDOW : limit,
    columns: "id, external_id, source_url, phone, zone",
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = zone
    ? (candidateRows ?? [])
        .filter((r: { zone: string | null }) => normalizeZone(r.zone).district.toLowerCase() === zone.toLowerCase())
        .slice(0, limit)
    : candidateRows;

  const proxyUrl = await getProxyUrl();
  let updated = 0;
  let still_missing = 0;

  for (const row of rows ?? []) {
    try {
      const lookup = await lookupIdealistaPhone(row.source_url, { proxyUrl });

      if (lookup.phone) {
        const { error: updErr } = await withMigration0035Fallback(
          {
            phone: lookup.phone,
            phone_confidence: lookup.phone_confidence,
            chat_only: false,
            updated_at: now,
          },
          (values) => db.from("particulares").update(values).eq("id", row.id).is("phone", null),
        );
        if (!updErr) {
          await db.from("particulares_changes").insert({
            particular_id: row.id,
            change_type: "phone_added",
            old_value: null,
            new_value: { phone: lookup.phone },
            changed_at: now,
          });
          updated++;
        } else {
          still_missing++;
        }
      } else {
        await db
          .from("particulares")
          .update({ chat_only: true, updated_at: now })
          .eq("id", row.id)
          .is("phone", null);
        still_missing++;
      }
    } catch {
      still_missing++;
    }
  }

  return Response.json({
    ok: true,
    zone: zone || null,
    checked: rows?.length ?? 0,
    // Con filtro de zona: cuántas filas quedaban en la ventana traída sin
    // procesar todavía (útil para que el caller sepa si ya vació el distrito
    // o si hay que pedir otra tanda).
    remaining_in_window: zone
      ? (candidateRows ?? []).filter(
          (r: { zone: string | null }) => normalizeZone(r.zone).district.toLowerCase() === zone.toLowerCase(),
        ).length - (rows?.length ?? 0)
      : null,
    updated,
    still_missing,
    timestamp: now,
  });
}
