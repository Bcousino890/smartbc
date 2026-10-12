// Historial y métricas del GRUPO de fuentes de un inmueble (modelo Casafari).
// Puro (sin React ni BD): reconstruye los eventos de cada fuente desde
// `particulares_changes` + `created_at`/`taken_down_at` y, si hace falta,
// `scraper_extra.price_history`. Si un dato no existe NO se inventa.

import type { LinkedAd, LinkedChange } from "@/lib/particulares/links-types";

export type Op = "sale" | "rent";
export type EventKind = "start" | "drop" | "rise" | "down" | "active";

export type SourceEvent = {
  key: string;
  sourceId: string;
  portal: string;
  op: LinkedAd["operation"];
  date: string;
  kind: EventKind;
  /** Precio vigente tras el evento (null si no se conoce). */
  price: number | null;
  /** Precio anterior (solo bajadas/subidas). */
  from: number | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ts = (iso: string) => Date.parse(iso);

export function buildSourceEvents(m: LinkedAd, all: LinkedChange[]): SourceEvent[] {
  const mine = all.filter((c) => c.particular_id === m.id).sort((a, b) => ts(a.changed_at) - ts(b.changed_at));
  const out: SourceEvent[] = [];
  const base = { sourceId: m.id, portal: m.portal, op: m.operation };
  const priceChanges = mine.filter((c) => ["price_up", "price_down", "price_change"].includes(c.change_type));
  const listing = mine.find((c) => c.change_type === "new_listing");
  const hist = [...(m.price_history ?? [])].sort((a, b) => ts(a[0]) - ts(b[0]));

  // Precio inicial: el del alta, el «antes» del primer cambio, la 1.ª observación o el actual si nunca cambió.
  let running: number | null =
    num(listing?.new_value?.price) ??
    num(priceChanges[0]?.old_value?.price) ??
    (hist.length ? hist[0][1] : null) ??
    (priceChanges.length === 0 ? m.price : null);

  const startDate = listing?.changed_at ?? m.created_at ?? mine[0]?.changed_at ?? null;
  if (startDate) out.push({ ...base, key: `${m.id}:start`, date: startDate, kind: "start", price: running, from: null });

  // Fallback sin cambios registrados: diferencias entre observaciones del scraper.
  if (priceChanges.length === 0 && hist.length >= 2) {
    for (let i = 1; i < hist.length; i++) {
      const [d, p] = hist[i];
      const prev = hist[i - 1][1];
      if (p === prev) continue;
      out.push({ ...base, key: `${m.id}:h${i}`, date: d, kind: p < prev ? "drop" : "rise", price: p, from: prev });
      running = p;
    }
  }

  let hasDown = false;
  for (const c of mine) {
    if (c.change_type === "price_up" || c.change_type === "price_down" || c.change_type === "price_change") {
      const to = num(c.new_value?.price);
      const from = num(c.old_value?.price);
      if (to == null) continue;
      const kind: EventKind =
        c.change_type === "price_down" ? "drop" : c.change_type === "price_up" ? "rise" : from != null && to < from ? "drop" : "rise";
      out.push({ ...base, key: `${m.id}:${c.changed_at}:${c.change_type}`, date: c.changed_at, kind, price: to, from });
      running = to;
    } else if (c.change_type === "deleted") {
      hasDown = true;
      const when = typeof c.new_value?.taken_down_at === "string" ? (c.new_value.taken_down_at as string) : c.changed_at;
      out.push({ ...base, key: `${m.id}:${c.changed_at}:down`, date: when, kind: "down", price: running, from: null });
    } else if (c.change_type === "reactivated") {
      const when = typeof c.new_value?.reactivated_at === "string" ? (c.new_value.reactivated_at as string) : c.changed_at;
      out.push({ ...base, key: `${m.id}:${c.changed_at}:active`, date: when, kind: "active", price: running, from: null });
    }
  }
  if (!hasDown && !m.is_active && m.taken_down_at)
    out.push({ ...base, key: `${m.id}:down-synth`, date: m.taken_down_at, kind: "down", price: running ?? m.price, from: null });

  return out.filter((e) => Number.isFinite(ts(e.date))).sort((a, b) => ts(a.date) - ts(b.date));
}

export function buildGroupEvents(members: LinkedAd[], changes: LinkedChange[]): SourceEvent[] {
  return members.flatMap((m) => buildSourceEvents(m, changes)).sort((a, b) => ts(a.date) - ts(b.date));
}

// ─── Métricas de cabecera ──────────────────────────────────────────────────

export type OpMetrics = {
  op: Op;
  n: number;
  active: number;
  /** Precio de la fuente activa más barata (o la última conocida si ninguna está activa). */
  price: number | null;
  status: "active" | "down";
  days: number | null;
  pricePerM2: number | null;
  /** Variación % del último cambio de precio del inmueble en esta operación. */
  lastChangePct: number | null;
};

const DAY = 86_400_000;

export function opMetrics(op: Op, members: LinkedAd[], events: SourceEvent[], now: number = Date.now()): OpMetrics | null {
  const ms = members.filter((m) => m.operation === op);
  if (ms.length === 0) return null;
  const actives = ms.filter((m) => m.is_active);
  const pool = actives.length ? actives : ms;
  const priced = pool.filter((m) => m.price != null);
  const ref = priced.sort((a, b) => (a.price as number) - (b.price as number))[0] ?? null;

  // Días en el mercado: desde la fuente más antigua hasta hoy (si sigue activa) o hasta la última baja.
  const starts = ms.map((m) => (m.created_at ? ts(m.created_at) : NaN)).filter(Number.isFinite);
  let days: number | null = null;
  if (starts.length) {
    const from = Math.min(...starts);
    const downs = ms.map((m) => (m.taken_down_at ? ts(m.taken_down_at) : NaN)).filter(Number.isFinite);
    const to = actives.length || downs.length === 0 ? now : Math.max(...downs);
    days = Math.max(0, Math.floor((to - from) / DAY));
  }

  const ids = new Set(ms.map((m) => m.id));
  const last = [...events].reverse().find((e) => ids.has(e.sourceId) && (e.kind === "drop" || e.kind === "rise") && e.from);
  const lastChangePct = last && last.price != null && last.from ? ((last.price - last.from) / last.from) * 100 : null;

  const m2 = ref?.square_meters ?? ms.find((m) => m.square_meters)?.square_meters ?? null;
  return {
    op,
    n: ms.length,
    active: actives.length,
    price: ref?.price ?? null,
    status: actives.length ? "active" : "down",
    days,
    pricePerM2: ref?.price != null && m2 && m2 > 0 ? Math.round(ref.price / m2) : null,
    lastChangePct,
  };
}

/** «−23,08 %» con signo tipográfico y coma decimal. */
export function signedPct(pct: number): string {
  const s = Math.abs(pct).toFixed(2).replace(".", ",");
  return `${pct < 0 ? "−" : pct > 0 ? "+" : ""}${s} %`;
}

export const EVENT_LABEL: Record<EventKind, string> = {
  start: "Nuevo",
  drop: "Bajada de precio",
  rise: "Subida de precio",
  down: "No disponible",
  active: "Activo",
};
