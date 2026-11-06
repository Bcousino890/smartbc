// Estado de la ficha del cliente para los encargos múltiples (solo España).
// Módulo PURO: lo usan la página (servidor) y la vista (navegador), y lo
// vigila `npm run test:encargos-ui-state`.

import type { BriefInput } from "@/lib/clients/brief";
import { describeBrief } from "@/lib/captaciones-map/brief-view";
import { formatThousandsEs } from "@/lib/captaciones-map/pin-label";
import { isCommandTab, type CommandTab } from "@/lib/client-command-center/types";
import type { Encargo, EncargoSource, EncargoStatus } from "./model";

export const ENCARGO_STATUS_LABEL: Record<EncargoStatus, string> = {
  active: "Activo",
  paused: "En pausa",
  closed: "Cerrado",
};

/**
 * El encargo que enseña el matching: el de `?encargo=` si es de ESTE cliente
 * (también si está en pausa o cerrado: el aviso puede ser anterior), y si no
 * el principal. Un id ajeno no da error: se cae al principal sin más.
 */
export function resolveSelectedEncargo(encargos: Encargo[], param: string | null): Encargo | null {
  if (encargos.length === 0) return null;
  const asked = param ? encargos.find((e) => e.id === param) : undefined;
  return asked ?? encargos.find((e) => e.isPrimary) ?? encargos[0];
}

const SOURCES: readonly EncargoSource[] = ["property", "particular"];
const HIGHLIGHT_ID = /^[A-Za-z0-9_-]{1,100}$/;

/** `?destacar=particular:p9` → `{ source: "particular", id: "p9" }`; cualquier otra cosa → null. */
export function parseHighlight(param: string | null): { source: EncargoSource; id: string } | null {
  if (!param) return null;
  const i = param.indexOf(":");
  if (i <= 0) return null;
  const source = param.slice(0, i) as EncargoSource;
  const id = param.slice(i + 1);
  if (!SOURCES.includes(source) || !HIGHLIGHT_ID.test(id)) return null;
  return { source, id };
}

/**
 * La pestaña con la que se abre la ficha. Un aviso de la campanita enlaza a
 * `?encargo=…[&destacar=…]#matching` sin `tab`: el matching vive en
 * Propiedades, así que se abre ahí. `?encargo=editar` (abre el diálogo del
 * encargo) sigue abriendo el Resumen, como siempre.
 */
export function initialTabFor(params: Pick<URLSearchParams, "get">): CommandTab {
  const tab = params.get("tab");
  if (isCommandTab(tab)) return tab;
  const encargo = params.get("encargo");
  if (params.get("destacar") || (encargo && encargo !== "editar")) return "properties";
  return "overview";
}

/**
 * La URL al elegir otro encargo en el selector del matching: conserva el resto
 * del estado (pestaña…) y quita `destacar`, que era de un elemento del encargo
 * anterior.
 */
export function hrefForEncargo(search: string, encargoId: string): string {
  const qs = new URLSearchParams(search);
  qs.delete("destacar");
  qs.set("encargo", encargoId);
  return `?${qs.toString()}`;
}

export type EncargoActions = {
  canPause: boolean;
  canClose: boolean;
  canReactivate: boolean;
  canMakePrimary: boolean;
  /** Por qué no se puede pausar ni cerrar (solo el principal). */
  lockedReason: string | null;
};

/** Lo que admite cada encargo. Mismas reglas que el servidor (`validateStatusChange`, `make_encargo_primary`). */
export function encargoActions(e: Pick<Encargo, "isPrimary" | "status">): EncargoActions {
  if (e.isPrimary) {
    return {
      canPause: false,
      canClose: false,
      canReactivate: false,
      canMakePrimary: false,
      lockedReason: "Es el encargo principal: para pausarlo o cerrarlo, haz principal otro antes.",
    };
  }
  return {
    canPause: e.status === "active",
    canClose: e.status !== "closed",
    canReactivate: e.status !== "active",
    // Solo un encargo activo puede ser el principal (lo exige la BD).
    canMakePrimary: e.status === "active",
    lockedReason: null,
  };
}

// ─── Tope de precio por dormitorios ──────────────────────────────────────────

export type PriceByBedroomsRow = { bedrooms: string; maxPrice: string };
export type PriceByBedroomsIssue = { row: number; message: string };

const MAX_BEDROOMS = 20;
const digits = (s: string) => s.replace(/[^\d]/g, "");

/** `{"4":6300,"3":5200}` → filas del editor, ordenadas por dormitorios. */
export function priceByBedroomsToRows(v: Record<string, number> | null): PriceByBedroomsRow[] {
  if (!v) return [];
  return Object.entries(v)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([bedrooms, max]) => ({ bedrooms, maxPrice: String(max) }));
}

/**
 * Filas del editor → `maxPriceByBedrooms`. Una fila vacía no cuenta; una fila a
 * medias o inválida NO se guarda y se dice por qué (así nunca se guarda en
 * silencio algo distinto de lo que se ve). Con dormitorios repetidos manda la
 * primera fila.
 */
export function priceByBedroomsFromRows(rows: PriceByBedroomsRow[]): {
  value: Record<string, number> | null;
  issues: PriceByBedroomsIssue[];
} {
  const out: Record<string, number> = {};
  const issues: PriceByBedroomsIssue[] = [];
  rows.forEach((r, row) => {
    const b = digits(r.bedrooms);
    const p = digits(r.maxPrice);
    if (!b && !p) return;
    const skip = (message: string) => issues.push({ row, message: `${message}: esta fila no se guardará.` });
    if (!b) return skip("Faltan los dormitorios");
    if (!p) return skip("Falta el importe");
    const n = Number(b);
    if (n < 1 || n > MAX_BEDROOMS) return skip(`Los dormitorios van de 1 a ${MAX_BEDROOMS}`);
    const price = Number(p);
    if (!(price > 0)) return skip("El importe tiene que ser mayor que 0");
    const key = String(n);
    if (key in out) return skip(`${key} dormitorios ya tiene tope`);
    out[key] = price;
  });
  return { value: Object.keys(out).length ? out : null, issues };
}

// ─── Resumen de una línea ────────────────────────────────────────────────────

const SUMMARY_LABELS = new Set(["Operación", "Presupuesto", "Dormitorios", "Zonas"]);

/** Lo esencial del encargo en una línea (operación, presupuesto, dormitorios, zonas y tope por dormitorios). */
export function encargoSummary(b: BriefInput): string {
  const parts = describeBrief(b)
    .filter((i) => SUMMARY_LABELS.has(i.label))
    .map((i) => i.value);
  const tope = priceByBedroomsToRows(b.maxPriceByBedrooms);
  if (tope.length) {
    const unit = b.operation === "rent" ? " €/mes" : " €";
    parts.push(
      `tope: ${tope.map((r) => `${r.bedrooms} dorm. ${formatThousandsEs(Number(r.maxPrice))}${unit}`).join(", ")}`,
    );
  }
  return parts.join(" · ");
}
