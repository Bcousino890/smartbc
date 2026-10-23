"use client";

import { useEffect, useRef, useState } from "react";
import { SECTIONS, SECTION_LABEL, type Section } from "@/lib/catalogs/manager-state";
import st from "../studio/studio.module.css";

// Pestañas del gestor (BCP-01 E2, AC-G1): tablist accesible. ← → mueven el
// foco, Inicio/Fin van a la primera y a la última, Intro/Espacio activan
// (activación manual: mover el foco con flechas no llena el historial). Un
// punto marca las secciones con cambios sin guardar.
// Rediseño 2026-10-23: pestañas subrayadas de la referencia; en móvil bajan
// de línea en vez de desplazarse, para que se vean las cinco.

export function SectionTabs({
  section,
  onSelect,
  marks = {},
  counts = {},
}: {
  section: Section;
  onSelect: (s: Section) => void;
  marks?: Partial<Record<Section, boolean>>;
  counts?: Partial<Record<Section, number>>;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusIdx, setFocusIdx] = useState(SECTIONS.indexOf(section));
  useEffect(() => setFocusIdx(SECTIONS.indexOf(section)), [section]);

  function onKeyDown(e: React.KeyboardEvent) {
    const last = SECTIONS.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = focusIdx === last ? 0 : focusIdx + 1;
    else if (e.key === "ArrowLeft") next = focusIdx === 0 ? last : focusIdx - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setFocusIdx(next);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Secciones del catálogo"
      onKeyDown={onKeyDown}
      className={st.tabs}
      data-testid="section-tabs"
    >
      {SECTIONS.map((s, i) => {
        const on = s === section;
        return (
          <button
            key={s}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`cm-tab-${s}`}
            aria-selected={on}
            aria-controls={`cm-panel-${s}`}
            tabIndex={i === focusIdx ? 0 : -1}
            onClick={() => {
              setFocusIdx(i);
              if (!on) onSelect(s);
            }}
            className={`${st.tab} ${on ? st.tabOn : ""} text-sm`}
          >
            <span className="inline-flex items-center gap-1.5">
              {SECTION_LABEL[s]}
              {counts[s] !== undefined ? <span className="font-normal text-ink/50">{counts[s]}</span> : null}
              {marks[s] ? (
                <span className="h-2 w-2 rounded-full bg-amber-500" data-testid={`tab-dirty-${s}`}>
                  <span className="sr-only"> (cambios sin guardar)</span>
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
