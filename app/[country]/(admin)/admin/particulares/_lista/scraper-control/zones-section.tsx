"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  PORTAL_LABEL,
  SCRAPER_PORTALS,
  type ScraperControlPayload,
  type ScraperControlUpdate,
  type ScraperPortal,
  type ScraperZone,
  type ZonePriority,
} from "@/lib/scrapers/control-types";
import { FOCUS_RING, Segmented } from "../controls";
import { PrioritySelect, ZoneInfo } from "./priority-select";
import { BTN_SECONDARY, Notice, Section, fmt } from "./shared";
import { buildTree, costTotals, family, groupRoots, matches, normalize, type TreeNode } from "./zones-tree";
import { zoneListings } from "@/lib/scrapers/control-types";

// El mapa trae contornos (cientos de KB): solo se descarga al abrir la vista «Mapa».
const ZoneMap = dynamic(() => import("./zone-map").then((m) => m.ZoneMap), {
  ssr: false,
  loading: () => (
    <p role="status" className="rounded-xl border border-ink/10 bg-white p-6 text-sm text-ink/70">
      Cargando el mapa…
    </p>
  ),
});

type SaveFn = (u: ScraperControlUpdate) => Promise<string | null>;
type PatchFn = (fn: (d: ScraperControlPayload) => ScraperControlPayload) => void;

/** Peticiones aproximadas del barrido de puesta al día: 30 anuncios por página de listado. */
function sweepRequests(zs: ScraperZone[]): number | null {
  const known = zs.filter((z) => zoneListings(z) != null);
  if (known.length === 0) return null;
  return known.reduce((n, z) => n + Math.ceil((zoneListings(z) ?? 0) / 30), 0);
}

/** Mensaje al marcar: la zona se pone al día en la siguiente ejecución del crawler. */
function markedMsg(zs: ScraperZone[], what: string): string {
  const n = sweepRequests(zs.filter((z) => z.priority === "off"));
  return `${what} Se barrerá en la próxima ejecución${n != null ? ` (≈ ${fmt(n)} peticiones)` : ""}.`;
}

/** Casilla del padre: marca/desmarca la zona y TODAS sus descendientes; intermedia si hay mezcla. */
function FamilyCheck({ node, onToggle, disabled }: { node: TreeNode; onToggle: (all: ScraperZone[], mark: boolean) => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const fam = family(node);
  const marked = fam.filter((z) => z.priority !== "off").length;
  const all = marked === fam.length;
  const some = marked > 0 && !all;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);
  return (
    <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center" title="Marca o desmarca esta zona incluidos todos sus barrios y subzonas">
      <input
        ref={ref}
        type="checkbox"
        checked={all}
        disabled={disabled}
        aria-label={`Marcar o desmarcar ${node.z.label} incluidos todos sus barrios y subzonas`}
        onChange={() => onToggle(fam, !all)}
        className={cn("h-5 w-5 accent-ink", FOCUS_RING)}
      />
    </label>
  );
}

function TreeRow({
  node,
  depth,
  q,
  disabled,
  onSet,
  onFamily,
}: {
  node: TreeNode;
  depth: number;
  q: string;
  disabled: boolean;
  onSet: (z: ScraperZone, p: ZonePriority) => void;
  onFamily: (all: ScraperZone[], mark: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasKids = node.children.length > 0;
  // Con búsqueda se despliegan solo las ramas que tienen coincidencias.
  const kids = q ? node.children.filter((c) => matches(c, q)) : node.children;
  const expanded = open || (q !== "" && kids.length > 0);
  const fam = useMemo(() => (hasKids ? family(node) : [node.z]), [node, hasKids]);
  return (
    <li className={cn(depth === 0 ? "border-t border-ink/10 first:border-t-0" : "border-t border-ink/5")}>
      <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4" style={{ paddingLeft: Math.min(depth, 4) * 14 }}>
        <div className="flex min-w-0 items-start">
          {hasKids ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={`${expanded ? "Plegar" : "Desplegar"} ${node.z.label}`}
              onClick={() => setOpen((v) => !v)}
              className={cn("flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-ink/70 hover:bg-ink/5", FOCUS_RING)}
            >
              <ChevronRight size={18} aria-hidden="true" className={cn("transition-transform", expanded && "rotate-90")} />
            </button>
          ) : (
            <span className="w-9 shrink-0" aria-hidden="true" />
          )}
          {hasKids && <FamilyCheck node={node} onToggle={onFamily} disabled={disabled} />}
          <div className="min-w-0 break-words pl-1 pt-2">
            <p className={cn("text-base leading-snug text-ink", depth === 0 ? "font-semibold" : "font-medium")}>
              {node.z.label}
              {hasKids && (
                <span className="ml-2 whitespace-nowrap text-sm font-normal text-ink/65">
                  {fam.filter((z) => z.priority !== "off").length} de {fam.length} marcadas
                </span>
              )}
            </p>
            <ZoneInfo z={node.z} hasKids={hasKids} />
          </div>
        </div>
        <div>
          <PrioritySelect value={node.z.priority} onChange={(p) => onSet(node.z, p)} label={`Estado de ${node.z.label}`} disabled={disabled} />
        </div>
      </div>
      {expanded && hasKids && (
        <ul>
          {kids.map((c) => (
            <TreeRow key={c.z.zone_key} node={c} depth={depth + 1} q={q} disabled={disabled} onSet={onSet} onFamily={onFamily} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ZonesSection({ data, save, patchLocal, reload }: { data: ScraperControlPayload; save: SaveFn; patchLocal: PatchFn; reload: () => void }) {
  const { toast } = useToast();
  const [portal, setPortal] = useState<ScraperPortal>("idealista");
  const [view, setView] = useState<"lista" | "mapa">("lista");
  const [q, setQ] = useState("");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const disabled = !data.canEdit || !data.tablesReady;
  const all = data.zones[portal];
  const nq = normalize(q.trim());

  const roots = useMemo(() => buildTree(all), [all]);
  const groups = useMemo(() => groupRoots(portal, nq ? roots.filter((n) => matches(n, nq)) : roots), [portal, roots, nq]);
  const marked = all.filter((z) => z.priority !== "off").length;
  const totals = useMemo(() => costTotals(all), [all]);

  /** Aplica al instante en pantalla y guarda; si falla, vuelve a leer lo real. */
  async function apply(changes: Array<{ zone_key: string; priority: ZonePriority }>, okMsg: string) {
    if (changes.length === 0) return;
    const map = new Map(changes.map((c) => [c.zone_key, c.priority]));
    patchLocal((d) => ({ ...d, zones: { ...d.zones, [portal]: d.zones[portal].map((z) => (map.has(z.zone_key) ? { ...z, priority: map.get(z.zone_key)! } : z)) } }));
    const err = await save({ zones: changes.map((c) => ({ portal, ...c })) });
    if (err) {
      toast(err, "error");
      reload();
    } else toast(okMsg, "success");
  }

  // Marcar respeta las «Alta» que ya hubiera: no las baja a Normal. Se envía en tandas (tope de la API).
  async function setMany(zs: ScraperZone[], p: ZonePriority, msg: string) {
    const changes = zs.filter((z) => (p === "normal" ? z.priority === "off" : z.priority !== p)).map((z) => ({ zone_key: z.zone_key, priority: p }));
    for (let i = 0; i < changes.length; i += 250) await apply(changes.slice(i, i + 250), i === 0 ? msg : "");
  }

  const onSet = (z: ScraperZone, p: ZonePriority) =>
    apply(
      [{ zone_key: z.zone_key, priority: p }],
      p === "off" ? `${z.label} sin marcar. Sus anuncios se quedan como están.` : z.priority === "off" ? markedMsg([z], `${z.label} marcada.`) : `${z.label}: ${p === "alta" ? "prioridad alta" : "marcada"}.`,
    );
  const onFamily = (zs: ScraperZone[], mark: boolean) =>
    setMany(zs, mark ? "normal" : "off", mark ? markedMsg(zs, "Zona y barrios marcados.") : "Zona y barrios desmarcados. Sus anuncios se quedan como están.");

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + SCRAPER_PORTALS.length) % SCRAPER_PORTALS.length;
    setPortal(SCRAPER_PORTALS[n]);
    tabRefs.current[n]?.focus();
  };

  const capitalZones = all.filter((z) => z.scope === "capital");

  return (
    <Section id="zonas" title="Zonas que se escanean" description="Marca las zonas que quieres vigilar. Es la forma más directa de controlar el gasto de créditos.">
      <div role="note" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm font-semibold text-amber-900">
        Lo que no esté marcado NO se scrapea: no se guarda ni su tarjeta, ni su ficha, ni su teléfono, y no cuesta ni un crédito.
      </div>
      <p className="mb-4 text-sm text-ink/75">
        Cada barrio y cada subzona decide por sí misma. La casilla de una zona marca o desmarca la zona <strong>incluidos todos sus barrios</strong>; su selector decide
        solo la zona: si marcas un distrito y dejas un barrio sin marcar, se escanea el distrito entero <strong>menos ese barrio</strong>. Si marcas un barrio y no su
        distrito, solo ese barrio. Al marcar una zona que estaba sin marcar, el crawler la pone al día en su siguiente ejecución; al desmarcarla, sus anuncios se quedan como están.
      </p>
      <ul className="mb-4 grid gap-2 text-sm text-ink/80 sm:grid-cols-3">
        <li className="rounded-xl bg-ink/[0.05] px-3 py-2">
          <strong>Marcada</strong>: se vigila al ritmo de siempre.
        </li>
        <li className="rounded-xl bg-gold/15 px-3 py-2">
          <strong>Alta</strong>: marcada y se revisa el doble de seguido. Para donde más captas.
        </li>
        <li className="rounded-xl bg-red-50 px-3 py-2">
          <strong>Sin marcar</strong>: no se gasta ni un crédito en esa zona.
        </li>
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Portal" className="inline-flex h-11 rounded-xl border border-ink/10 bg-white p-0.5">
          {SCRAPER_PORTALS.map((p, i) => (
            <button
              key={p}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`zonas-tab-${p}`}
              aria-selected={portal === p}
              aria-controls="zonas-panel"
              tabIndex={portal === p ? 0 : -1}
              onClick={() => setPortal(p)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cn("rounded-[10px] px-5 text-sm transition", portal === p ? "bg-ink font-semibold text-cream-50" : "font-medium text-ink/70 hover:bg-ink/[0.04]", FOCUS_RING)}
            >
              {PORTAL_LABEL[p]}
            </button>
          ))}
        </div>
        <Segmented
          value={view}
          onChange={setView}
          ariaLabel="Forma de ver las zonas"
          options={[
            { value: "lista", label: "Lista" },
            { value: "mapa", label: "Mapa" },
          ]}
        />
      </div>

      <div id="zonas-panel" role="tabpanel" aria-labelledby={`zonas-tab-${portal}`} className="mt-4">
        {!data.tablesReady ? (
          <Notice tone="warn">La configuración de zonas aún no está instalada en el servidor. Aparecerá en cuanto se publique la próxima versión.</Notice>
        ) : all.length === 0 ? (
          <Notice tone="info">El crawler todavía no ha publicado sus zonas de {PORTAL_LABEL[portal]}; aparecerán tras su próxima ejecución.</Notice>
        ) : (
          <>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              {view === "lista" && (
                <div className="relative flex-1">
                  <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/50" />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label={`Buscar zona de ${PORTAL_LABEL[portal]}`}
                    placeholder="Buscar zona, municipio o barrio…"
                    className={cn("h-11 w-full rounded-xl border border-ink/15 bg-white pl-9 pr-3 text-base text-ink placeholder:text-ink/50", FOCUS_RING)}
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={disabled} onClick={() => setMany(capitalZones, "normal", markedMsg(capitalZones, "Toda la capital marcada."))} className={cn(BTN_SECONDARY, "flex-1 lg:flex-none", FOCUS_RING)}>
                  Marcar toda la capital
                </button>
                <button type="button" disabled={disabled} onClick={() => setMany(all, "normal", markedMsg(all, "Todas las zonas marcadas."))} className={cn(BTN_SECONDARY, "flex-1 lg:flex-none", FOCUS_RING)}>
                  Marcar todo
                </button>
                <button type="button" disabled={disabled} onClick={() => setMany(all, "off", "Todas las zonas desmarcadas: no se escanea nada.")} className={cn(BTN_SECONDARY, "flex-1 lg:flex-none", FOCUS_RING)}>
                  Desmarcar todo
                </button>
              </div>
            </div>

            <p className="mt-3 text-sm text-ink/80" aria-live="polite">
              <strong>
                {marked} de {all.length} zonas marcadas
              </strong>{" "}
              en {PORTAL_LABEL[portal]} · coste estimado de lo marcado <strong>≈ {fmt(totals.now)} créditos/mes</strong>
              {totals.all > totals.now && <span className="text-emerald-800"> · ahorras ≈ {fmt(totals.all - totals.now)} frente a marcar todo</span>}
              <span className="block text-xs text-ink/65">
                Cálculo aproximado: ≈ 0,7 créditos al mes por cada anuncio de la zona. {totals.unknown > 0 && `${fmt(totals.unknown)} zonas aún sin datos no cuentan.`} No es una factura.
              </span>
            </p>
            {marked === 0 && (
              <div className="mt-3">
                <Notice tone="warn">No hay ninguna zona marcada en {PORTAL_LABEL[portal]}: ahora mismo no se escanea nada de este portal.</Notice>
              </div>
            )}

            {view === "mapa" ? (
              <div className="mt-4">
                <ZoneMap portal={portal} zones={all} disabled={disabled} onSet={onSet} onFamily={onFamily} />
              </div>
            ) : (
              <>
                {groups.length === 0 && <p className="mt-4 text-sm text-ink/70">Ninguna zona coincide con «{q}».</p>}
                {groups.map((g) => (
                  <div key={g.id} className="mt-5">
                    <h4 className="text-sm font-bold uppercase tracking-wide text-ink/70">
                      {g.title} <span className="font-normal normal-case">({g.nodes.reduce((n, r) => n + family(r).length, 0)})</span>
                    </h4>
                    {g.help && <p className="text-sm text-ink/65">{g.help}</p>}
                    <ul className="mt-1">
                      {g.nodes.map((n) => (
                        <TreeRow key={n.z.zone_key} node={n} depth={0} q={nq} disabled={disabled} onSet={onSet} onFamily={onFamily} />
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
