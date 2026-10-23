"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Link2, MoreHorizontal } from "lucide-react";
import { shareExpiryLabel, sharePath } from "@/lib/catalogs/share";
import type { ShareView } from "../share-panel";
import st from "../studio/studio.module.css";

// Cabecera del gestor (BCP-01 E2, plan §3.3). «Vista previa» abre el lector
// del enlace ACTIVO en otra pestaña; sin enlace activo lleva a Compartir y
// dice por qué. «Compartir» solo cambia de sección. Ninguno de los dos guarda,
// publica ni crea nada. Archivar/Reactivar vive en el menú ⋯ (la acción de
// siempre). En escritorio es fija; en móvil no (el botón de menú del CRM está
// fijo arriba a la izquierda).
// Rediseño 2026-10-23 (D4): es el ÚNICO título de la página (h1 en Unbounded)
// con las acciones a su derecha y la línea de estado debajo. Las migas («Mi
// espacio / Catálogos») van encima y no son fijas; al quedar fija, el título
// se reduce a una línea.

export type NoLinkReason = "none" | "expired" | "archived";

export interface UnsavedEntry {
  key: string;
  label: string;
  go: () => void;
}

export function ManagerHeader({
  basePath,
  title,
  archived,
  mode,
  count,
  share,
  pending,
  onToggleStatus,
  onPreviewWithoutLink,
  onShare,
  onDownloadPdf,
  pdfBusy = false,
  unsaved = [],
  onOpenGroups,
}: {
  basePath: string;
  title: string;
  archived: boolean;
  mode: "manual" | "auto";
  count: number;
  share: ShareView | null;
  pending: boolean;
  onToggleStatus: () => void;
  onPreviewWithoutLink: (reason: NoLinkReason) => void;
  onShare: () => void;
  /** PDF del catálogo: descarga lo guardado (también archivado o sin enlace). */
  onDownloadPdf?: () => void;
  pdfBusy?: boolean;
  unsaved?: UnsavedEntry[];
  /** HOME · grupos (C4): abre «Grupos» encima del gestor, sin navegar. Recibe
   *  el botón «⋯» para devolverle el foco al cerrar. */
  onOpenGroups?: (trigger: HTMLElement | null) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [list, setList] = useState(false);
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const active = !!share && !share.expired && !archived;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Cerrar los desplegables al pulsar fuera o con Esc.
  useEffect(() => {
    if (!menu && !list) return;
    const onDown = (e: MouseEvent) => {
      if (menu && !menuRef.current?.contains(e.target as Node)) setMenu(false);
      if (list && !listRef.current?.contains(e.target as Node)) setList(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        setList(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, list]);

  const linkLabel = !share ? "Sin enlace" : share.expired ? "Enlace caducado" : archived ? "Enlace en pausa (archivado)" : `Enlace hasta el ${shareExpiryLabel(share.expiresAt)}`;
  const item = "block w-full rounded-md px-3 py-2 text-left text-sm text-ink/80 hover:bg-[color:var(--st-soft)] disabled:opacity-60";

  return (
    <>
      <nav aria-label="Ruta" className="flex min-h-[3rem] items-center gap-2 border-b border-[color:var(--st-line)] pt-4 pb-3 text-sm text-ink/60 md:pt-6">
        <Link href={basePath} className="inline-flex items-center gap-1 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Mi espacio
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink">Catálogos</span>
      </nav>
      <div ref={sentinel} aria-hidden="true" className="!mt-0 h-px" />
      <div
        className={`relative z-20 -mx-4 !mt-0 bg-cream-50/95 px-4 pb-3 pt-5 backdrop-blur lg:sticky lg:top-0 lg:-mx-8 lg:px-8 ${stuck ? "lg:border-b lg:border-[color:var(--st-line)] lg:pt-3 lg:shadow-sm" : ""}`}
        data-testid="manager-header"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-72">
            <h1 className={`${st.heading} text-[22px] leading-tight sm:text-2xl ${stuck ? "lg:line-clamp-1 lg:text-lg" : "line-clamp-3"}`} data-testid="manager-title">
              {title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink/65" data-testid="manager-status">
              <span className={`${st.status} ${archived ? st.statusOff : ""}`}>{archived ? "Archivado" : "Activo"}</span>
              <span aria-hidden="true">·</span>
              {/* BCP-01 P3: sin modos; solo se avisa de los automáticos antiguos. */}
              {mode === "auto" ? (
                <>
                  <span>Automático (antiguo)</span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span data-testid="header-count">
                {count} vivienda{count === 1 ? "" : "s"}
              </span>
              <span aria-hidden="true">·</span>
              <span data-testid="header-link">{linkLabel}</span>
              {unsaved.length ? (
                <div ref={listRef} className="relative">
                  <button
                    type="button"
                    aria-expanded={list}
                    onClick={() => setList((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-sm font-medium text-amber-900"
                    data-testid="header-unsaved"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                    Cambios sin guardar ({unsaved.length})
                  </button>
                  {list ? (
                    <ul className={`${st.panel} absolute left-0 top-full z-30 mt-1 w-64 max-w-[80vw] p-1 shadow-lg`} data-testid="header-unsaved-list">
                      {unsaved.map((u) => (
                        <li key={u.key}>
                          <button
                            type="button"
                            onClick={() => {
                              setList(false);
                              u.go();
                            }}
                            className={`${item} truncate`}
                          >
                            {u.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {active ? (
              <a href={sharePath(share!.token)} target="_blank" rel="noopener noreferrer" className={`${st.btn} text-sm`} data-testid="preview-link">
                Vista previa <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => onPreviewWithoutLink(archived ? "archived" : share?.expired ? "expired" : "none")}
                className={`${st.btn} text-sm`}
                data-testid="preview-link"
              >
                Vista previa
              </button>
            )}
            <button type="button" onClick={onShare} className={`${st.btnPrimary} text-sm`} data-testid="share-button">
              <Link2 className="h-4 w-4" aria-hidden="true" /> Compartir
            </button>
            <div ref={menuRef} className="relative">
              <button
                ref={menuButton}
                type="button"
                aria-label="Más acciones"
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu((v) => !v)}
                className={`${st.btnQuiet} px-2`}
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              </button>
              {menu ? (
                <div role="menu" className={`${st.panel} absolute right-0 top-full z-30 mt-1 min-w-[12rem] p-1 shadow-lg`}>
                  <button
                    type="button"
                    role="menuitem"
                    autoFocus
                    disabled={pending}
                    onClick={() => {
                      setMenu(false);
                      onToggleStatus();
                    }}
                    className={item}
                  >
                    {archived ? "Reactivar" : "Archivar"}
                  </button>
                  {onDownloadPdf ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={pdfBusy}
                      onClick={() => {
                        setMenu(false);
                        onDownloadPdf();
                      }}
                      className={item}
                      data-testid="menu-pdf"
                    >
                      {pdfBusy ? "Preparando el PDF…" : "Descargar PDF"}
                    </button>
                  ) : null}
                  {onOpenGroups ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        onOpenGroups(menuButton.current);
                      }}
                      className={item}
                      data-testid="menu-groups"
                    >
                      Grupos…
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
