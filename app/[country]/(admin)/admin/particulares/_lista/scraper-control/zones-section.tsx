"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  PORTAL_LABEL,
  SCRAPER_PORTALS,
  baseZoneCredits,
  hasZoneEstimate,
  zoneCredits,
  type ScraperControlPayload,
  type ScraperControlUpdate,
  type ScraperPortal,
  type ScraperZone,
  type ZonePriority,
} from "@/lib/scrapers/control-types";
import { FOCUS_RING } from "../controls";
import { BTN_SECONDARY, Notice, Section, fmt } from "./shared";

type SaveFn = (u: ScraperControlUpdate) => Promise<string | null>;
type PatchFn = (fn: (d: ScraperControlPayload) => ScraperControlPayload) => void;

// Regla del dueño (opt-in): solo se escanea lo marcado. En base de datos «Marcada» = 'normal'
// y «Sin marcar» = 'off'; «Alta» = marcada y se revisa el doble de seguido.
const OPTIONS: Array<{ value: ZonePriority; label: string; on: string }> = [
  { value: "normal", label: "Marcada", on: "bg-ink font-semibold text-cream-50" },
  { value: "alta", label: "Alta", on: "bg-gold/25 font-semibold text-ink shadow-[inset_0_0_0_1.5px_rgba(168,138,82,0.9)]" },
  { value: "off", label: "Sin marcar", on: "bg-red-50 font-semibold text-red-800 shadow-[inset_0_0_0_1.5px_rgba(185,28,28,0.55)]" },
];

/** Selector de 3 estados (radiogroup): 44 px de alto, flechas ←/→ para cambiar. */
function PrioritySelect({ value, onChange, label, disabled }: { value: ZonePriority; onChange: (v: ZonePriority) => void; label: string; disabled: boolean }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKey(e: React.KeyboardEvent, i: number) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[n].value);
    refs.current[n]?.focus();
  }
  return (
    <div role="radiogroup" aria-label={label} className="flex h-11 w-full items-stretch rounded-xl border border-ink/10 bg-white p-0.5 sm:w-[17.5rem] sm:shrink-0">
      {OPTIONS.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "min-w-0 flex-1 rounded-[10px] px-2 text-sm transition disabled:cursor-not-allowed",
              active ? o.on : "font-medium text-ink/70 hover:bg-ink/[0.04] hover:text-ink",
              FOCUS_RING,
            )}
          >
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type TreeNode = { z: ScraperZone; children: TreeNode[] };

/** Árbol a partir de parent_key; si el padre no existe en la lista, la zona queda como raíz. */
function buildTree(zones: ScraperZone[]): TreeNode[] {
  const byKey = new Map<string, TreeNode>(zones.map((z) => [z.zone_key, { z, children: [] }]));
  const roots: TreeNode[] = [];
  for (const n of byKey.values()) {
    const parent = n.z.parent_key ? byKey.get(n.z.parent_key) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  }
  return roots;
}

function family(n: TreeNode): ScraperZone[] {
  return [n.z, ...n.children.flatMap(family)];
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** ¿La zona o algún descendiente coincide con la búsqueda? */
function matches(n: TreeNode, q: string): boolean {
  return normalize(n.z.label).includes(q) || normalize(n.z.zone_key).includes(q) || n.children.some((c) => matches(c, q));
}

function Info({ z }: { z: ScraperZone }) {
  const base = baseZoneCredits(z.portal, z.zone_key, z.scope);
  const est = hasZoneEstimate(z.portal, z.zone_key, z.scope);
  const total = (z.listings_sale ?? 0) + (z.listings_rent ?? 0);
  const counted = z.listings_sale != null || z.listings_rent != null;
  return (
    <>
      <p className="text-sm text-ink/70">
        {counted ? (
          <>
            {fmt(total)} anuncios
            {z.listings_private != null && <> · {fmt(z.listings_private)} de particulares</>}
          </>
        ) : (
          "Anuncios: aún sin contar"
        )}
      </p>
      {est && (
        <p className="text-sm text-ink/70">
          {z.priority === "off" ? (
            <>
              No gasta nada · <span className="font-semibold text-emerald-800">ahorras ≈ {fmt(base)} créditos/mes</span>
            </>
          ) : z.priority === "alta" ? (
            <>≈ {fmt(zoneCredits(base, "alta"))} créditos/mes (hasta el doble)</>
          ) : (
            <>≈ {fmt(base)} créditos/mes</>
          )}
        </p>
      )}
    </>
  );
}

/** Casilla del padre: marca/desmarca la zona y todos sus hijos; intermedia si hay mezcla. */
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
    <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center" title="Marcar o desmarcar toda la zona con sus barrios">
      <input
        ref={ref}
        type="checkbox"
        checked={all}
        disabled={disabled}
        aria-label={`Marcar o desmarcar ${node.z.label} y todas sus zonas hijas`}
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
  const expanded = open || (q !== "" && hasKids);
  const kids = q ? node.children.filter((c) => matches(c, q)) : node.children;
  const fam = family(node);
  return (
    <li className={cn(depth === 0 ? "border-t border-ink/10 first:border-t-0" : "border-t border-ink/5")}>
      <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4" style={{ paddingLeft: depth * 20 }}>
        <div className="flex min-w-0 items-center">
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
          <div className="min-w-0 pl-1">
            <p className={cn("text-base text-ink", depth === 0 ? "font-semibold" : "font-medium")}>
              {node.z.label}
              {hasKids && (
                <span className="ml-2 text-sm font-normal text-ink/65">
                  {fam.filter((z) => z.priority !== "off").length} de {fam.length} marcadas
                </span>
              )}
            </p>
            <Info z={node.z} />
          </div>
        </div>
        <div className="pl-9 sm:pl-0">
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
  const [q, setQ] = useState("");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const disabled = !data.canEdit || !data.tablesReady;
  const all = data.zones[portal];
  const nq = normalize(q.trim());

  const roots = useMemo(() => buildTree(all), [all]);
  const visible = nq ? roots.filter((n) => matches(n, nq)) : roots;
  const capital = visible.filter((n) => n.z.scope === "capital");
  const resto = visible.filter((n) => n.z.scope !== "capital");
  const marked = all.filter((z) => z.priority !== "off").length;

  // Coste estimado con lo marcado, y lo que se ahorra frente a tenerlo todo marcado.
  const totals = useMemo(() => {
    let now = 0;
    let everything = 0;
    for (const z of all) {
      const b = baseZoneCredits(z.portal, z.zone_key, z.scope);
      now += zoneCredits(b, z.priority);
      everything += b;
    }
    return { now, saved: Math.max(0, everything - now) };
  }, [all]);

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

  // Marcar respeta las «Alta» que ya hubiera: no las baja a Normal.
  const setMany = (zs: ScraperZone[], p: ZonePriority, msg: string) =>
    apply(
      zs.filter((z) => (p === "normal" ? z.priority === "off" : z.priority !== p)).map((z) => ({ zone_key: z.zone_key, priority: p })),
      msg,
    );

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + SCRAPER_PORTALS.length) % SCRAPER_PORTALS.length;
    setPortal(SCRAPER_PORTALS[n]);
    tabRefs.current[n]?.focus();
  };

  return (
    <Section id="zonas" title="Zonas que se escanean" description="Marca las zonas que quieres vigilar. Es la forma más directa de controlar el gasto de créditos.">
      <div role="note" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm font-semibold text-amber-900">
        Lo que no esté marcado NO se scrapea: no se guarda ni su tarjeta, ni su ficha, ni su teléfono, y no cuesta ni un crédito.
      </div>
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
            className={cn(
              "rounded-[10px] px-5 text-sm transition",
              portal === p ? "bg-ink font-semibold text-cream-50" : "font-medium text-ink/70 hover:bg-ink/[0.04]",
              FOCUS_RING,
            )}
          >
            {PORTAL_LABEL[p]}
          </button>
        ))}
      </div>

      <div id="zonas-panel" role="tabpanel" aria-labelledby={`zonas-tab-${portal}`} className="mt-4">
        {!data.tablesReady ? (
          <Notice tone="warn">La configuración de zonas aún no está instalada en el servidor. Aparecerá en cuanto se publique la próxima versión.</Notice>
        ) : all.length === 0 ? (
          <Notice tone="info">El crawler todavía no ha publicado sus zonas de {PORTAL_LABEL[portal]}; aparecerán tras su próxima ejecución.</Notice>
        ) : (
          <>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/50" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label={`Buscar zona de ${PORTAL_LABEL[portal]}`}
                  placeholder="Buscar zona o barrio…"
                  className={cn("h-11 w-full rounded-xl border border-ink/15 bg-white pl-9 pr-3 text-base text-ink placeholder:text-ink/50", FOCUS_RING)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={disabled} onClick={() => setMany(all.filter((z) => z.scope === "capital"), "normal", "Toda la capital marcada.")} className={cn(BTN_SECONDARY, "flex-1 lg:flex-none", FOCUS_RING)}>
                  Marcar toda la capital
                </button>
                <button type="button" disabled={disabled} onClick={() => setMany(all, "normal", "Todas las zonas marcadas.")} className={cn(BTN_SECONDARY, "flex-1 lg:flex-none", FOCUS_RING)}>
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
              en {PORTAL_LABEL[portal]} · coste estimado <strong>≈ {fmt(totals.now)} créditos/mes</strong>
              {totals.saved > 0 && <span className="text-emerald-800"> · ahorras ≈ {fmt(totals.saved)} frente a marcar todo</span>}
              <span className="block text-xs text-ink/65">Cálculo aproximado a partir del uso real de septiembre; no es una factura.</span>
            </p>
            {marked === 0 && (
              <div className="mt-3">
                <Notice tone="warn">No hay ninguna zona marcada en {PORTAL_LABEL[portal]}: ahora mismo no se escanea nada de este portal.</Notice>
              </div>
            )}

            {visible.length === 0 && <p className="mt-4 text-sm text-ink/70">Ninguna zona coincide con «{q}».</p>}
            {[
              { title: "Madrid capital", rows: capital },
              { title: "Resto de la Comunidad", rows: resto },
            ].map(
              (g) =>
                g.rows.length > 0 && (
                  <div key={g.title} className="mt-5">
                    <h4 className="text-sm font-bold uppercase tracking-wide text-ink/70">
                      {g.title} <span className="font-normal normal-case">({g.rows.reduce((n, r) => n + family(r).length, 0)})</span>
                    </h4>
                    <ul className="mt-1">
                      {g.rows.map((n) => (
                        <TreeRow
                          key={n.z.zone_key}
                          node={n}
                          depth={0}
                          q={nq}
                          disabled={disabled}
                          onSet={(z, p) => apply([{ zone_key: z.zone_key, priority: p }], `${z.label}: ${p === "off" ? "sin marcar, no se escanea" : p === "alta" ? "marcada con prioridad alta" : "marcada"}.`)}
                          onFamily={(zs, mark) => setMany(zs, mark ? "normal" : "off", mark ? "Zona y barrios marcados." : "Zona y barrios desmarcados.")}
                        />
                      ))}
                    </ul>
                  </div>
                ),
            )}
          </>
        )}
      </div>
    </Section>
  );
}
