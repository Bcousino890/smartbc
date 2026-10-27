import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { AINotConfiguredError, aiComplete } from "@/lib/services/ai/chat";
import { buildAiPrompt, parseAiRanking } from "@/lib/captaciones-map/ai-rank";
import { chunk, createRateLimiter, truncateText, validateAiRequest } from "@/lib/captaciones-map/ai-request";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 20_000;
/** Texto por anuncio que se manda a la IA: acota coste y superficie de inyección. */
const CANDIDATE_CHARS = 600;

// 10 búsquedas por minuto y usuario: cada una cuesta una llamada de IA.
const limiter = createRateLimiter({ max: 10, windowMs: 60_000 });

/** `attrs` puede ser lista de etiquetas o un objeto; lo aplanamos a texto. */
function attrsToText(attrs: unknown): string {
  if (Array.isArray(attrs)) return attrs.filter((a) => typeof a === "string").join(", ");
  if (attrs && typeof attrs === "object") {
    return Object.entries(attrs as Record<string, unknown>)
      .filter(([, v]) => v === true || typeof v === "string" || typeof v === "number")
      .map(([k, v]) => (v === true ? k : `${k}: ${v}`))
      .join(", ");
  }
  return "";
}

/**
 * Ordena por IA los anuncios en zona según lo que pide el asesor. Lee la
 * descripción en el servidor y NO la devuelve: el navegador solo recibe los
 * criterios y, por id, qué cumple y qué falta.
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requirePermission("particulares", "view");
    if (!gate.ok) return gate.response;

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      /* cuerpo vacío o no JSON: lo rechaza la validación */
    }
    const parsed = validateAiRequest(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    // Tras validar para que las peticiones inválidas no gasten cupo.
    if (!limiter.allow(gate.profile.id)) {
      return NextResponse.json(
        { error: "Demasiadas búsquedas seguidas. Espera un minuto e inténtalo de nuevo." },
        { status: 429 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    // Trozos de 100 ids: con 200 UUID en un solo `.in()` la URL se acerca al límite de nginx.
    const data: unknown[] = [];
    for (const part of chunk(parsed.ids, 100)) {
      const { data: d, error } = await db
        .from("particulares")
        .select("id, title, address, attrs, description")
        .in("id", part)
        .eq("is_active", true)
        .is("duplicate_of", null);
      if (error) throw new Error(`map-ai: ${error.message}`);
      data.push(...(d ?? []));
    }

    const rows = data as {
      id: string;
      title: string | null;
      address: string | null;
      attrs: unknown;
      description: string | null;
    }[];
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, criteria: [], matches: [] });
    }

    const candidates = rows.map((r) => ({
      id: String(r.id),
      text: truncateText(
        [r.title, r.address, attrsToText(r.attrs), r.description].filter(Boolean).join(" · "),
        CANDIDATE_CHARS,
      ),
    }));
    const { system, user } = buildAiPrompt(parsed.query, candidates);

    let raw: string;
    try {
      raw = await aiComplete({ system, userText: user, maxTokens: 2000, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (e instanceof AINotConfiguredError) {
        return NextResponse.json({ error: "La IA no está configurada. Actívala en Configuración" }, { status: 503 });
      }
      // Sin detalles del proveedor al navegador; el log del servidor sí los tiene.
      console.error("map-ai: fallo de IA:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "La IA no ha podido responder. Inténtalo de nuevo." }, { status: 502 });
    }

    const ranking = parseAiRanking(raw, new Set(candidates.map((c) => c.id)));
    return NextResponse.json({ ok: true, ...ranking });
  } catch (error) {
    console.error("Error in particulares map-ai endpoint:", error);
    return NextResponse.json({ error: "La IA no ha podido responder. Inténtalo de nuevo." }, { status: 502 });
  }
}
