"use client";

import { useEffect, useRef, useState } from "react";
import { SECTIONS, SECTION_LABEL, type Section } from "@/lib/catalogs/manager-state";

// Pestañas del gestor (BCP-01 E2, AC-G1): tablist accesible. ← → mueven el
// foco, Inicio/Fin van a la primera y a la última, Intro/Espacio activan
// (activación manual: mover el foco con flechas no llena el historial). Un
// punto marca las secciones con cambios sin guardar.

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
      className="grid grid-cols-4 gap-1 rounded-xl border border-gold/20 bg-white/60 p-1"
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
            className={`relative min-w-0 rounded-lg px-1 py-2 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold sm:px-3 sm:text-sm ${
              on ? "bg-ink text-cream-50" : "text-ink/70 hover:bg-white"
            }`}
          >
            <span className="block truncate">
              {SECTION_LABEL[s]}
              {counts[s] !== undefined ? <span className={`ml-1 hidden font-normal sm:inline ${on ? "text-cream-50/70" : "text-ink/45"}`}>{counts[s]}</span> : null}
            </span>
            {marks[s] ? (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" data-testid={`tab-dirty-${s}`}>
                <span className="sr-only"> (cambios sin guardar)</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
