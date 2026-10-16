"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, MoreHorizontal } from "lucide-react";
import { shareExpiryLabel, sharePath } from "@/lib/catalogs/share";
import type { ShareView } from "../share-panel";

// Cabecera del gestor (BCP-01 E2, plan §3.3). «Vista previa» abre el lector
// del enlace ACTIVO en otra pestaña; sin enlace activo lleva a Compartir y
// dice por qué. «Compartir» solo cambia de sección. Ninguno de los dos guarda,
// publica ni crea nada. Archivar/Reactivar vive en el menú ⋯ (la acción de
// siempre). En escritorio es fija; en móvil no (el botón de menú del CRM está
// fijo arriba a la izquierda).

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
  const btn = "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-60";

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      <div
        className={`z-20 -mx-4 space-y-2 bg-cream-50/95 px-4 py-2 backdrop-blur lg:sticky lg:top-0 lg:-mx-8 lg:px-8 ${stuck ? "lg:border-b lg:border-gold/20 lg:shadow-sm" : ""}`}
        data-testid="manager-header"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href={basePath} className="inline-flex items-center gap-1 text-sm text-ink/60 hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Mi espacio
          </Link>
          {stuck ? <p className="crm-body-strong hidden min-w-0 max-w-[40ch] truncate text-ink lg:block">{title}</p> : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {active ? (
              <a href={sharePath(share!.token)} target="_blank" rel="noopener noreferrer" className={`${btn} border border-gold/40 text-ink/80 hover:bg-white`} data-testid="preview-link">
                Vista previa <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => onPreviewWithoutLink(archived ? "archived" : share?.expired ? "expired" : "none")}
                className={`${btn} border border-gold/40 text-ink/80 hover:bg-white`}
                data-testid="preview-link"
              >
                Vista previa
              </button>
            )}
            <button type="button" onClick={onShare} className={`${btn} bg-gold/90 font-semibold text-white hover:bg-gold`} data-testid="share-button">
              Compartir
            </button>
            <div ref={menuRef} className="relative">
              <button
                ref={menuButton}
                type="button"
                aria-label="Más acciones"
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu((v) => !v)}
                className={`${btn} px-2 text-ink/70 hover:bg-white`}
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              </button>
              {menu ? (
                <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[12rem] rounded-lg border border-gold/25 bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    role="menuitem"
                    autoFocus
                    disabled={pending}
                    onClick={() => {
                      setMenu(false);
                      onToggleStatus();
                    }}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink/80 hover:bg-cream-50 disabled:opacity-60"
                  >
                    {archived ? "Reactivar" : "Archivar"}
                  </button>
                  {onOpenGroups ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        onOpenGroups(menuButton.current);
                      }}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink/80 hover:bg-cream-50"
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/60" data-testid="manager-status">
          <span className={`rounded-full px-2.5 py-0.5 ${archived ? "bg-ink/10 text-ink/60" : "bg-gold/15 text-ink/80"}`}>{archived ? "Archivado" : "Activo"}</span>
          <span>{mode === "auto" ? "Automático" : "Manual"}</span>
          <span aria-hidden="true">·</span>
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
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                data-testid="header-unsaved"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                Cambios sin guardar ({unsaved.length})
              </button>
              {list ? (
                <ul className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[80vw] rounded-lg border border-gold/25 bg-white p-1 shadow-lg" data-testid="header-unsaved-list">
                  {unsaved.map((u) => (
                    <li key={u.key}>
                      <button
                        type="button"
                        onClick={() => {
                          setList(false);
                          u.go();
                        }}
                        className="block w-full truncate rounded-md px-3 py-2 text-left text-sm text-ink/80 hover:bg-cream-50"
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
    </>
  );
}
