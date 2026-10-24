"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { ArrowUpRight, Link2, SlidersHorizontal, X } from "lucide-react";
import { CatalogCover, countLabel } from "@/components/catalogs/catalog-cover";
import { criteriaSummary } from "@/lib/catalogs/criteria";
import { cardTags, selectionCounts, selectionMatcher, type GroupSelection, type GroupsState } from "@/lib/catalogs/groups";
import type { CatalogSummary } from "@/lib/catalogs/types";
import { GroupSelector } from "./groups/group-selector";
import st from "./studio/studio.module.css";

// Estantería de la HOME con filtros (BCP-01 ampliación X8): anuncio de
// origen, zona, operación, modo y estado, y búsqueda por título o código. Todo
// en el navegador sobre la lista del dueño (son pocos catálogos). Interno.
// HOME · grupos: el grupo elegido es un filtro MÁS, que se aplica antes que los
// de siempre (que no cambian); los recuentos del selector siguen el filtro de
// estado. «Zona de los criterios» (D11) sale, como siempre, de los criterios
// guardados del catálogo, sea manual o automático.
// Rediseño «Lista editorial» (expediente 2026-10-23-bcp-01-gestor-rediseno,
// D3): grupos y búsqueda a la vista; los demás filtros tras «Filtros», con los
// activos como etiquetas que se quitan con un clic; lista editorial con
// portada compacta. Los filtros y su lógica son los de siempre.

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const OPERATION_LABEL: Record<string, string> = { sale: "Venta", rent: "Alquiler", any: "Ambas" };
const MODE_LABEL: Record<string, string> = { manual: "Manual", auto: "Automático" };
const STATUS_LABEL: Record<string, string> = { active: "Activos", archived: "Archivados", "": "Todos los estados" };

export interface ShelfGroups {
  state: GroupsState;
  selection: GroupSelection;
  onSelect: (sel: GroupSelection) => void;
  onAssign: (catalog: CatalogSummary, opener: HTMLElement | null) => void;
}

export function CatalogShelf({ catalogs, basePath, groups = null }: { catalogs: CatalogSummary[]; basePath: string; groups?: ShelfGroups | null }) {
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("");
  const [op, setOp] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("active");
  const [ad, setAd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelId = useId();

  const zones = useMemo(
    () => [...new Set(catalogs.flatMap((c) => c.criteria.zones.map((z) => z.name)))].sort((a, b) => a.localeCompare(b, "es")),
    [catalogs],
  );
  const ads = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of catalogs) for (const a of c.ads) {
      const key = a.code ?? a.reference ?? a.id;
      if (!m.has(key)) m.set(key, [a.reference, a.title ?? (a.code ? `Anuncio ${a.code}` : null)].filter(Boolean).join(" · "));
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [catalogs]);

  const inGroup = useMemo(() => (groups ? selectionMatcher(groups.state, groups.selection) : () => true), [groups]);
  const counts = useMemo(() => (groups ? selectionCounts(groups.state, catalogs, status) : null), [groups, catalogs, status]);

  const shown = catalogs.filter((c) => {
    if (!inGroup(c.id)) return false;
    if (status && c.status !== status) return false;
    if (mode && c.mode !== mode) return false;
    if (op && c.criteria.operation !== op) return false;
    if (zone && !c.criteria.zones.some((z) => z.name === zone)) return false;
    if (ad && !c.ads.some((a) => (a.code ?? a.reference ?? a.id) === ad)) return false;
    const t = q.trim().toLowerCase();
    if (t) {
      const hay = [c.title, ...c.ads.flatMap((a) => [a.code, a.reference, a.title, a.note])].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  });

  // Filtros secundarios activos (los de «Filtros»), cada uno con su forma de
  // quitarlo. El estado se ve siempre en «Mostrando»; si no es el de por
  // defecto (activos), también se puede quitar.
  const active: Array<{ key: string; label: string; clear: () => void }> = [];
  if (ad) active.push({ key: "ad", label: `Anuncio: ${ads.find(([k]) => k === ad)?.[1] || ad}`, clear: () => setAd("") });
  if (zone) active.push({ key: "zone", label: `Zona: ${zone}`, clear: () => setZone("") });
  if (op) active.push({ key: "op", label: `Operación: ${OPERATION_LABEL[op] ?? op}`, clear: () => setOp("") });
  if (mode) active.push({ key: "mode", label: `Modo: ${MODE_LABEL[mode] ?? mode}`, clear: () => setMode("") });
  const nSecondary = active.length + (status !== "active" ? 1 : 0);
  const archivedHidden = status === "active" ? catalogs.filter((c) => c.status === "archived" && inGroup(c.id)).length : 0;

  const field = "flex min-w-0 flex-col gap-1 text-sm text-ink/70";
  const select = `${st.input} w-full text-sm`;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {groups && counts ? (
          <div className="min-w-0 w-full sm:w-auto sm:flex-1">
            <GroupSelector state={groups.state} selection={groups.selection} counts={counts} onSelect={groups.onSelect} />
          </div>
        ) : null}
        <div className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto" role="search" aria-label="Filtrar catálogos">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título o anuncio"
            aria-label="Buscar por título o anuncio"
            className={`${st.input} w-full min-w-0 flex-1 text-sm sm:w-64 sm:flex-none`}
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls={panelId}
            className={`${st.btn} text-sm`}
            data-testid="shelf-filters-toggle"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filtros
            {nSecondary ? <span className={`${st.tag} text-xs`}>{nSecondary}</span> : null}
          </button>
        </div>
      </div>

      <div
        id={panelId}
        hidden={!filtersOpen}
        className={`${st.panel} mt-3 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 ${filtersOpen ? "grid" : "hidden"}`}
        data-testid="shelf-filters"
      >
        <label className={field}>
          Estado
          <select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
            <option value="active">Activos</option>
            <option value="archived">Archivados</option>
            <option value="">Todos</option>
          </select>
        </label>
        <label className={field}>
          Operación
          <select aria-label="Operación" value={op} onChange={(e) => setOp(e.target.value)} className={select}>
            <option value="">Venta y alquiler</option>
            <option value="sale">Venta</option>
            <option value="rent">Alquiler</option>
            <option value="any">Ambas</option>
          </select>
        </label>
        <label className={field}>
          Zona de los criterios
          <select aria-label="Zona de los criterios" value={zone} onChange={(e) => setZone(e.target.value)} className={select}>
            <option value="">Todas las zonas de los criterios</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Anuncio de origen
          <select aria-label="Anuncio de origen" value={ad} onChange={(e) => setAd(e.target.value)} className={select}>
            <option value="">Todos los anuncios</option>
            {ads.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Modo (catálogos antiguos)
          <select aria-label="Modo" value={mode} onChange={(e) => setMode(e.target.value)} className={select}>
            <option value="">Manual y automático</option>
            <option value="manual">Manual</option>
            <option value="auto">Automático</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink/70" data-testid="shelf-active-filters">
        <span>Mostrando</span>
        {status === "active" ? (
          <span className={`${st.tag} text-xs`}>{STATUS_LABEL.active}</span>
        ) : (
          <button type="button" onClick={() => setStatus("active")} className={`${st.tag} text-xs`} aria-label={`Quitar el filtro «${STATUS_LABEL[status]}» (volver a activos)`} data-testid="shelf-chip">
            {STATUS_LABEL[status]} <X className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
        {active.map((f) => (
          <button key={f.key} type="button" onClick={f.clear} className={`${st.tag} max-w-full text-xs`} aria-label={`Quitar el filtro «${f.label}»`} data-testid="shelf-chip">
            <span className="truncate">{f.label}</span> <X className="h-3 w-3 shrink-0" aria-hidden="true" />
          </button>
        ))}
        <span className="text-ink/60" data-testid="shelf-count">
          {shown.length} de {catalogs.length} catálogos
        </span>
        {nSecondary > 1 ? (
          <button
            type="button"
            onClick={() => {
              setAd("");
              setZone("");
              setOp("");
              setMode("");
              setStatus("active");
            }}
            className={`${st.link} text-sm`}
          >
            Quitar filtros
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 border-t border-[color:var(--st-line)] px-4 py-8 text-center text-sm text-ink/60" data-testid="shelf-empty">
          {groups && groups.selection.kind === "group" && !catalogs.some((c) => inGroup(c.id))
            ? "Este grupo no tiene catálogos todavía. Asígnalos desde cada tarjeta con «Grupos»."
            : "Ningún catálogo coincide con estos filtros."}
        </p>
      ) : (
        <ul className="mt-3 grid gap-3" data-testid="shelf">
          {shown.map((c) => (
            <ShelfRow key={c.id} c={c} basePath={basePath} groups={groups} />
          ))}
        </ul>
      )}
      {archivedHidden ? (
        <p className="mt-4 text-sm text-ink/60" data-testid="shelf-archived-hint">
          También tienes {archivedHidden === 1 ? "1 catálogo archivado" : `${archivedHidden} catálogos archivados`}.{" "}
          <button type="button" onClick={() => setStatus("archived")} className={`${st.link} text-sm`}>
            Ver archivo
          </button>
        </p>
      ) : null}
    </>
  );
}

function ShelfRow({ c, basePath, groups }: { c: CatalogSummary; basePath: string; groups: ShelfGroups | null }) {
  const href = `${basePath}/catalogos/${c.id}`;
  const archived = c.status === "archived";
  const criteria = criteriaSummary(c.criteria);
  const tags = groups ? cardTags(groups.state, c.id) : [];
  return (
    <li
      className={`${st.panel} grid grid-cols-[64px_minmax(0,1fr)] gap-x-4 gap-y-3 p-3 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-center sm:gap-x-5 sm:p-4`}
      data-testid="shelf-row"
    >
      <Link href={href} tabIndex={-1} aria-hidden="true" className={`block self-start ${archived ? "opacity-60" : ""}`}>
        <div className="crm-theme-light aspect-[150/212] w-full overflow-hidden rounded-sm" data-check-overflow="cover">
          <CatalogCover
            data={{
              title: c.title,
              subtitle: c.intro,
              numberLabel: c.numberLabel,
              edition: c.edition,
              photoUrl: c.coverPhotoUrl,
              preparedBy: c.contactName,
              countLabel: countLabel(c.itemCount),
            }}
          />
        </div>
      </Link>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className={`${st.status} ${archived ? st.statusOff : ""}`}>{archived ? "Archivado" : "Activo"}</span>
          {c.mode === "auto" ? <span className="text-ink/60">· Automático (antiguo)</span> : null}
        </p>
        <h2 className={`${st.heading} mt-1.5 text-base leading-snug`}>
          <Link href={href} className="hover:underline hover:decoration-1 hover:underline-offset-4">
            {c.title}
          </Link>
        </h2>
        <p className="mt-1 text-sm text-ink/65">
          {c.itemCount} vivienda{c.itemCount === 1 ? "" : "s"}
          {criteria ? ` · ${criteria}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink/60">
          {tags.length ? (
            <span className="flex flex-wrap gap-1.5" data-testid="card-groups">
              {tags.map((t) => (
                <span key={t} className={st.tag}>
                  {t}
                </span>
              ))}
            </span>
          ) : null}
          {c.ads.length ? (
            <span>
              {c.ads.length} anuncio{c.ads.length === 1 ? "" : "s"} de origen
            </span>
          ) : null}
          <span>Actualizado el {formatDate(c.updatedAt)}</span>
        </div>
      </div>
      <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[color:var(--st-line)] pt-3 sm:col-span-1 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
        <Link href={href} className={`${st.btn} text-sm`} aria-label={`Abrir el catálogo «${c.title}»`}>
          Abrir catálogo <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="flex items-center gap-4">
          {groups ? (
            <button
              type="button"
              onClick={(e) => groups.onAssign(c, e.currentTarget)}
              className={`${st.link} text-sm`}
              aria-label={`Grupos de «${c.title}»`}
              data-testid="card-groups-button"
            >
              Grupos
            </button>
          ) : null}
          <Link href={`${href}?seccion=compartir`} className={`${st.link} inline-flex items-center gap-1 text-sm`} aria-label={`Compartir «${c.title}»`}>
            <Link2 className="h-4 w-4" aria-hidden="true" /> Compartir
          </Link>
        </div>
      </div>
    </li>
  );
}
