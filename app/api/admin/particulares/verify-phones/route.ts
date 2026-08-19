import "server-only";
import { createClient } from "@supabase/supabase-js";
import { fetchIdealistaPhoneViaAjax, normalizeSpanishPhone } from "@/lib/sync/particulares/idealista-advertiser-detector";
import { requirePermission } from "@/lib/auth/guard";
import { getProxyUrl } from "@/lib/sync/proxy-config";
import { lookupIdealistaPhone } from "@/lib/sync/particulares/phone-lookup";
import { withMigration0035Fallback } from "@/lib/sync/particulares/migration-fallback";
import { buildPhoneCandidateQuery } from "@/lib/sync/particulares/phone-candidates";
import { resolveChatOnly } from "@/lib/sync/particulares/chat-only";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — hasta 100 fichas por llamada

// Re-verificación de teléfonos de particulares. Tres modos:
// - mode=all      → re-scrapea anuncios ACTIVOS (tengan o no teléfono), los
//                   menos verificados primero (updated_at asc).
// - mode=missing  → solo activos sin teléfono (phone IS NULL).
// - mode=normalize → NO scrapea: recorre TODA la tabla y reescribe los
//                   teléfonos guardados al formato canónico +34XXXXXXXXX.
//
// Auth doble: sesión de staff (botón en el admin) O Bearer CRON_SECRET
// (cron/scripts del VPS).

// Tipo laxo para el cliente Supabase (mismo criterio que el cron de scrape:
// los genéricos del SDK no aportan aquí y casteamos puntualmente).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

// ─── Auth: Bearer CRON_SECRET (cron/scripts del VPS) ─────────────────────────

function isCronAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  return (
    !!process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`
  );
}

type VerifyResponse = {
  ok: boolean;
  mode: string;
  checked: number;
  updated: number;
  normalized?: number;
  withPhone: number;
  chatOnly: number;
  errors: number;
  // Teléfono encontrado (solo en verificación de un anuncio concreto, para
  // que el cliente actualice la UI sin recargar).
  foundPhone?: string | null;
};

type ParticularRow = {
  id: string;
  source_url: string;
  phone: string | null;
};

// ─── mode=all / mode=missing: re-scrapear y actualizar ───────────────────────

async function verifyByScraping(
  supabase: SupabaseLike,
  mode: "all" | "missing",
  limit: number,
  onlyId?: string | null,
): Promise<VerifyResponse> {
  const proxyUrl = await getProxyUrl();
  // Activos, los menos verificados primero (updated_at asc). En "missing"
  // solo los que no tienen teléfono. Con `onlyId`, ese anuncio concreto
  // (botón "Verificar teléfono" del modal).
  const { data, error } = await buildPhoneCandidateQuery(
    supabase,
    mode === "missing" ? "missing" : "all",
    { limit, onlyId },
  );
  if (error) {
    console.error("[verify-phones] Error listando particulares:", error);
    return {
      ok: false,
      mode,
      checked: 0,
      updated: 0,
      withPhone: 0,
      chatOnly: 0,
      errors: 1,
    };
  }

  const rows = (data ?? []) as ParticularRow[];
  const result: VerifyResponse = {
    ok: true,
    mode,
    checked: 0,
    updated: 0,
    withPhone: 0,
    chatOnly: 0,
    errors: 0,
  };

  for (const row of rows) {
    result.checked++;
    const now = new Date().toISOString();

    try {
      const lookup = await lookupIdealistaPhone(row.source_url, { proxyUrl });
      if (!lookup.httpOk && !lookup.phone) {
        console.warn(`[verify-phones] fetch ${row.source_url} -> sin resultado (HTML y AJAX)`);
        result.errors++;
        continue;
      }

      // Si no se encontró nada nuevo, conserva el teléfono existente (no lo
      // borra por un re-check fallido); si nunca tuvo, queda en null.
      const effectivePhone = lookup.phone ?? row.phone;
      const values: Record<string, unknown> = {
        phone: effectivePhone,
        chat_only: resolveChatOnly(effectivePhone),
        updated_at: now,
      };

      if (lookup.phone) {
        values.phone_confidence = lookup.phone_confidence;
        result.withPhone++;
        result.foundPhone = lookup.phone;
      } else if (!row.phone) {
        result.chatOnly++;
      }

      const { error: updateError } = await withMigration0035Fallback(values, (v) =>
        supabase.from("particulares").update(v).eq("id", row.id),
      );
      if (updateError) {
        console.error("[verify-phones] Error actualizando:", updateError);
        result.errors++;
        continue;
      }
      // Cuenta como actualizado si escribimos algo material (teléfono nuevo
      // o chat_only); el refresco de solo updated_at no cuenta.
      if (lookup.phone || !row.phone) {
        result.updated++;
      }
      // Historial: teléfono descubierto en un anuncio que no lo tenía.
      if (lookup.phone && !row.phone) {
        await supabase.from("particulares_changes").insert({
          particular_id: row.id,
          change_type: "phone_added",
          old_value: null,
          new_value: { phone: lookup.phone },
          changed_at: now,
        });
      }
    } catch (err) {
      console.error(
        `[verify-phones] Error procesando ${row.source_url}:`,
        err,
      );
      result.errors++;
    }
  }

  return result;
}

// ─── mode=normalize: reescribir los teléfonos guardados a +34 ────────────────
// No scrapea nada: recorre TODA la tabla por lotes de 1000 (límite de filas
// de PostgREST) y reescribe cada phone al formato canónico. Si un teléfono
// guardado no es normalizable (basura, referencia…), se deja como está.

async function normalizeStoredPhones(
  supabase: SupabaseLike,
): Promise<VerifyResponse> {
  const result: VerifyResponse = {
    ok: true,
    mode: "normalize",
    checked: 0,
    updated: 0,
    normalized: 0,
    withPhone: 0,
    chatOnly: 0,
    errors: 0,
  };

  const BATCH = 1000;
  for (let offset = 0; ; offset += BATCH) {
    const { data, error } = await supabase
      .from("particulares")
      .select("id, phone")
      .not("phone", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error("[verify-phones] Error paginando particulares:", error);
      result.ok = false;
      result.errors++;
      break;
    }

    const rows = (data ?? []) as Array<{ id: string; phone: string | null }>;
    if (rows.length === 0) break;

    for (const row of rows) {
      result.checked++;
      if (row.phone) result.withPhone++;

      const normalized = normalizeSpanishPhone(row.phone);
      // No normalizable (basura/referencia) o ya canónico → no tocar.
      if (!normalized || normalized === row.phone) continue;

      const { error: updateError } = await supabase
        .from("particulares")
        .update({ phone: normalized, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updateError) {
        console.error("[verify-phones] Error normalizando:", updateError);
        result.errors++;
        continue;
      }
      result.updated++;
      result.normalized = (result.normalized ?? 0) + 1;
    }

    if (rows.length < BATCH) break;
  }

  return result;
}

export async function POST(req: Request) {
  // Doble auth: Bearer CRON_SECRET (cron del VPS) O sesión con permiso
  // particulares/edit (botón "Verificar teléfonos" del admin).
  if (!isCronAuthorized(req)) {
    const gate = await requirePermission("particulares", "edit");
    if (!gate.ok) return gate.response;
  }

  const { searchParams } = new URL(req.url);
  const modeParam = searchParams.get("mode") ?? "all";
  if (!["all", "missing", "normalize"].includes(modeParam)) {
    return Response.json(
      { ok: false, error: "mode debe ser all | missing | normalize" },
      { status: 400 },
    );
  }
  // Nº de anuncios a scrapear por llamada (no aplica a normalize).
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? "30", 10) || 30),
  );
  // Verificación de UN anuncio concreto (botón del modal en el admin).
  const onlyId = searchParams.get("id");
  // Modo diagnóstico: ?debug=1&id=<uuid> devuelve lo que respondió cada
  // endpoint AJAX de Idealista (status + trozo del cuerpo) SIN guardar nada.
  const debug = searchParams.get("debug") === "1";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const proxyUrl = await getProxyUrl();

  // ── Diagnóstico de un anuncio: ver qué devuelven los endpoints AJAX ──
  if (debug && onlyId) {
    const { data } = await supabase
      .from("particulares")
      .select("id, source_url, phone")
      .eq("id", onlyId)
      .maybeSingle();
    const sourceUrl = (data as { source_url?: string } | null)?.source_url;
    const adId = sourceUrl?.match(/\/inmueble\/(\d+)/)?.[1];
    if (!adId) {
      return Response.json(
        { ok: false, error: "no_ad_id", sourceUrl },
        { status: 200 },
      );
    }
    const ajax = await fetchIdealistaPhoneViaAjax(adId, {
      proxyUrl,
      debug: true,
    });
    return Response.json(
      {
        ok: true,
        adId,
        sourceUrl,
        phoneFound: ajax.phone,
        attempts: ajax.debug ?? [],
      },
      { status: 200 },
    );
  }

  try {
    console.log(
      `[verify-phones] Iniciando mode=${modeParam}${modeParam === "normalize" ? "" : ` limit=${limit}`}`,
    );
    const result =
      modeParam === "normalize"
        ? await normalizeStoredPhones(supabase)
        : await verifyByScraping(
            supabase,
            modeParam as "all" | "missing",
            limit,
            onlyId,
          );

    return Response.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    console.error("[verify-phones] Error:", error);
    return Response.json(
      {
        ok: false,
        mode: modeParam,
        checked: 0,
        updated: 0,
        withPhone: 0,
        chatOnly: 0,
        errors: 1,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
