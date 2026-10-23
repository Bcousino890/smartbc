"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileCheck2, FolderTree, MapPin, Plus } from "lucide-react";
import type { ActionResult } from "@/lib/catalogs/access";
import {
  ALL,
  groupById,
  groupLabel,
  memoryKey,
  readMemory,
  resolveSelection,
  sameSelection,
  selectionParam,
  withGroupParam,
  writeMemory,
  type GroupSelection,
  type GroupsState,
} from "@/lib/catalogs/groups";
import type { CatalogSummary } from "@/lib/catalogs/types";
import { CatalogShelf } from "./catalog-shelf";
import { CatalogGroupsDialog } from "./groups/catalog-groups-dialog";
import { OrganizePanel } from "./groups/organize-panel";
import type { GroupActions } from "./groups/types";
import { NewCatalogForm, type CreateCatalogInput } from "./new-catalog-form";
import st from "./studio/studio.module.css";

// Sección «Catálogos» de la HOME con grupos (expediente
// 2026-10-16-bcp-01-home-grupos). Guarda el estado de los grupos y el grupo
// elegido:
//   · la selección va SIEMPRE explícita en la URL (?grupo=todas|sin|<id>),
//     cambiada con history.replaceState (sin recargar el servidor) y sin tocar
//     otros parámetros;
//   · la URL manda; sin ?grupo, lo recordado en ESTE navegador para este dueño
//     y país (D8, C3); si no, «Todas»; un grupo que ya no existe cae a «Todas»
//     y se corrigen la URL y lo recordado (C2);
//   · elegir «Todas» la recuerda en el mismo momento (no vuelve otro grupo).
// Sin la migración (available: false) es la estantería de siempre.
// Rediseño 2026-10-23 («Lista editorial»): esta sección es la cabecera de la
// página (h1 «Catálogos»), con «Nuevo catálogo» como acción principal y la
// biblioteca (Textos aprobados, Plantillas de zona) en una fila de enlaces.

const storage = () => (typeof window === "undefined" ? null : window.localStorage);

export function HomeCatalogs({
  catalogs,
  basePath,
  mode,
  preparedBy,
  initialGroups,
  groupActions,
  createCatalog,
  initialGroupParam,
  ownerKey,
  country,
}: {
  catalogs: CatalogSummary[];
  basePath: string;
  mode: "live" | "demo";
  preparedBy: string;
  initialGroups: GroupsState;
  groupActions: GroupActions | null;
  createCatalog?: (i: CreateCatalogInput) => Promise<ActionResult<{ id: string }>>;
  initialGroupParam: string | null;
  ownerKey: string;
  country: string;
}) {
  const [groups, setGroups] = useState<GroupsState>(initialGroups);
  const enabled = groups.available && !!groupActions;
  const key = memoryKey(ownerKey, country);
  // Primera pintura (también en el servidor): solo la URL.
  const [selection, setSelection] = useState<GroupSelection>(() => resolveSelection(initialGroupParam, null, initialGroups).selection);
  const [organize, setOrganize] = useState(false);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<{ id: string; title: string; opener: HTMLElement | null } | null>(null);
  const resolved = useRef(false);

  const applyUrl = useCallback((sel: GroupSelection) => {
    try {
      const next = withGroupParam(window.location.href, sel);
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", next);
    } catch {
      // Sin History API: la selección sigue funcionando en la página.
    }
  }, []);

  // Al montar: URL → recordado → «Todas»; y corregir si el grupo ya no existe.
  useEffect(() => {
    if (!enabled || resolved.current) return;
    resolved.current = true;
    const url = new URLSearchParams(window.location.search).get("grupo");
    const r = resolveSelection(url, readMemory(storage, key), groups);
    setSelection(r.selection);
    if (r.fix || r.source !== "url") applyUrl(r.selection);
    if (r.fix || r.source === "url") writeMemory(storage, key, selectionParam(r.selection));
  }, [enabled, key, groups, applyUrl]);

  // Si el grupo elegido desaparece (borrado aquí o en otra pestaña): «Todas».
  useEffect(() => {
    if (!enabled || selection.kind !== "group" || groupById(groups.groups, selection.id)) return;
    setSelection(ALL);
    applyUrl(ALL);
    writeMemory(storage, key, selectionParam(ALL));
  }, [enabled, groups, selection, key, applyUrl]);

  const select = useCallback(
    (sel: GroupSelection) => {
      if (sameSelection(sel, selection)) return;
      writeMemory(storage, key, selectionParam(sel));
      setSelection(sel);
      applyUrl(sel);
    },
    [selection, key, applyUrl],
  );

  const createGroup = useMemo(
    () => (enabled && selection.kind === "group" && groupById(groups.groups, selection.id) ? { id: selection.id, label: groupLabel(groups.groups, selection.id) } : null),
    [enabled, selection, groups],
  );

  const active = catalogs.filter((c) => c.status === "active").length;
  return (
    <section aria-labelledby="hm-catalogos">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 id="hm-catalogos" className={`${st.heading} text-2xl leading-tight`}>
            Catálogos
          </h1>
          <p className="mt-2 text-sm text-ink/65">
            Tus selecciones de viviendas, listas para compartir.{" "}
            <span className="text-ink/55" data-testid="home-count">
              {catalogs.length === 0 ? "Todavía no hay catálogos." : `${active} activo${active === 1 ? "" : "s"} · ${catalogs.length} en total`}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {enabled ? (
            <button type="button" onClick={() => setOrganize(true)} className={`${st.btnQuiet} text-sm`} data-testid="organize-button">
              <FolderTree className="h-4 w-4" aria-hidden="true" /> Organizar
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            aria-expanded={creating}
            className={`${st.btnPrimary} text-sm`}
            data-testid="new-catalog-button"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo catálogo
          </button>
        </div>
      </div>

      <nav aria-label="Biblioteca" className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[color:var(--st-line)] pb-4 text-sm">
        <span className="w-full text-ink/60 sm:w-auto">Biblioteca</span>
        <Link href={`${basePath}/textos-aprobados`} className={`${st.link} inline-flex items-center gap-1.5`} data-testid="home-copy-library">
          <FileCheck2 className="h-4 w-4" aria-hidden="true" /> Textos aprobados
        </Link>
        <Link href={`${basePath}/plantillas-zona`} className={`${st.link} inline-flex items-center gap-1.5`} data-testid="home-area-texts">
          <MapPin className="h-4 w-4" aria-hidden="true" /> Plantillas de zona
        </Link>
      </nav>

      {/* Siempre montado: cerrar y volver a abrir conserva lo escrito. */}
      <div className={creating ? "mt-5" : ""}>
        <NewCatalogForm
          basePath={basePath}
          mode={mode}
          defaultContactName={preparedBy}
          group={createGroup}
          create={createCatalog}
          open={creating}
          onOpenChange={setCreating}
        />
      </div>

      <div className="mt-5">
        {catalogs.length === 0 ? (
          <div className={`${st.panel} px-4 py-10 text-center text-sm text-ink/60`} data-testid="home-empty">
            Crea tu primer catálogo y añade propiedades existentes por su referencia BC.
          </div>
        ) : (
          <CatalogShelf
            catalogs={catalogs}
            basePath={basePath}
            groups={enabled ? { state: groups, selection, onSelect: select, onAssign: (c, opener) => setAssigning({ id: c.id, title: c.title, opener }) } : null}
          />
        )}
      </div>

      {organize && groupActions ? <OrganizePanel state={groups} actions={groupActions} onState={setGroups} onClose={() => setOrganize(false)} /> : null}
      {assigning && groupActions ? (
        <CatalogGroupsDialog
          catalogId={assigning.id}
          catalogTitle={assigning.title}
          state={groups}
          actions={groupActions}
          onState={setGroups}
          onClose={() => setAssigning(null)}
          returnFocusTo={() => assigning.opener}
        />
      ) : null}
    </section>
  );
}
