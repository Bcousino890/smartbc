import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import {
  detectAdvertiserFromHtml,
  fetchIdealistaPhoneViaAjax,
} from "@/lib/sync/particulares/idealista-advertiser-detector";
import { fetchViaCurl } from "@/lib/sync/import-by-link/fetch-via-curl";
import { getProxyUrl } from "@/lib/sync/proxy-config";
import { getCapSolverApiKey } from "@/lib/sync/particulares/capsolver-config";
import { normalizeZone } from "@/lib/madrid-zones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const WHATSAPP_UA = "WhatsApp/2.23.20.0";

// Ventana de filas candidatas a barajar en memoria cuando se filtra por
// distrito (`?zone=`): el filtro de distrito no vive en SQL (normalizeZone
// vive en JS), así que se trae una ventana amplia ordenada por
// updated_at asc y se filtra aquí. Las filas descartadas por no ser del
// distrito pedido NO se tocan, así que vuelven a aparecer en la próxima
// llamada (barrido normal, sin filtro) o en la siguiente tanda del mismo
// distrito una vez que las procesadas ya no estén "primeras" en la cola.
const ZONE_FETCH_WINDOW = 500;

// Umbral de seguridad: si el saldo de CapSolver cae por debajo de esto,
// se corta el barrido ANTES de gastar más (CapSolver solo se usa cuando
// DataDome bloquea duro — un barrido masivo con presupuesto ajustado puede
// fundir el saldo sin avisar si no se frena solo). Configurable por env
// para poder subir/bajar el colchón sin tocar código.
const MIN_CAPSOLVER_BALANCE_USD = Number(process.env.PARTICULARES_MIN_CAPSOLVER_BALANCE ?? "2");

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

  // Freno de saldo ANTES de gastar un solo request: si ya está bajo, ni
  // arranca. No es fatal si CapSolver falla (se sigue igual, como en
  // proxy-health) — solo bloquea si el saldo se pudo leer y es bajo.
  try {
    const key = await getCapSolverApiKey();
    if (key) {
      const balRes = await fetch("https://api.capsolver.com/getBalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: key }),
      });
      const balData = (await balRes.json()) as { balance?: number; errorId?: number };
      if (balData.errorId === 0 && typeof balData.balance === "number" && balData.balance < MIN_CAPSOLVER_BALANCE_USD) {
        return Response.json({
          ok: false,
          stopped: "low_capsolver_balance",
          capsolver_balance: balData.balance,
          min_required: MIN_CAPSOLVER_BALANCE_USD,
          message: `Saldo de CapSolver ($${balData.balance}) por debajo del mínimo ($${MIN_CAPSOLVER_BALANCE_USD}) — barrido detenido para no fundirlo.`,
        }, { status: 200 });
      }
    }
  } catch {
    // No se pudo leer el saldo → no bloqueamos el barrido por eso, igual que proxy-health.
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const now = new Date().toISOString();

  const { data: candidateRows, error } = await db
    .from("particulares")
    .select("id, external_id, source_url, phone, zone")
    .eq("is_active", true)
    .is("phone", null)
    .order("updated_at", { ascending: true })
    .limit(zone ? ZONE_FETCH_WINDOW : limit);

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
      const res = await fetchViaCurl(row.source_url, WHATSAPP_UA, {
        proxyUrl,
      });
      if (!res.ok) { still_missing++; continue; }

      const info = detectAdvertiserFromHtml(res.html);

      // Fallback AJAX: many Idealista listings hide the phone behind "Ver teléfono"
      if (!info.phone) {
        const adIdMatch = row.source_url.match(/\/inmueble\/(\d+)/);
        if (adIdMatch?.[1]) {
          const ajax = await fetchIdealistaPhoneViaAjax(adIdMatch[1], { proxyUrl });
          if (ajax.phone) {
            info.phone = ajax.phone;
            info.phone_confidence = ajax.phone_confidence;
          }
        }
      }

      if (info.phone) {
        await db
          .from("particulares")
          .update({ phone: info.phone, chat_only: false, updated_at: now })
          .eq("id", row.id)
          .is("phone", null);
        await db.from("particulares_changes").insert({
          particular_id: row.id,
          change_type: "phone_added",
          old_value: null,
          new_value: { phone: info.phone },
          changed_at: now,
        });
        updated++;
      } else {
        // Re-verificado sin teléfono real → solo se puede contactar por chat.
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
