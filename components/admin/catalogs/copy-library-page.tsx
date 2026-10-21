"use client";

import { useMemo, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import { changedLabel, partsLabel, pendingCandidateParts, type CopyCandidate, type CopyLibraryView, type CopyPart, type CopyParts } from "@/lib/catalogs/copy-rules";

// «Textos aprobados» de la HOME (0219, PR1): la biblioteca de textos de las
// viviendas y la siembra desde lo ya publicado en los catálogos. Nada viene
// marcado (N1): cada texto se aprueba a mano, porque el sistema no puede
// saber si un texto publicado es personal para un cliente. Sin IA.

export interface CopyLibraryData {
  candidates: CopyCandidate[];
  library: Array<{ propertyId: string; propertyTitle: string; view: CopyLibraryView }>;
}

export interface CopyLibraryActions {
  reload: () => Promise<ActionResult<CopyLibraryData>>;
  approve: (i: { items: Array<{ catalogId: string; propertyId: string; parts: CopyParts }> }) => Promise<ActionResult<{ approved: number }>>;
  withdraw: (i: { propertyId: string; part: CopyPart }) => Promise<ActionResult<object>>;
}

const key = (c: CopyCandidate) => `${c.catalogId}:${c.propertyId}`;

export function CopyLibraryPage({ initial, actions }: { initial: CopyLibraryData; actions: CopyLibraryActions }) {
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const pendingCands = useMemo(() => data.candidates.map((c) => ({ c, parts: pendingCandidateParts(c) })), [data.candidates]);

  function after(res: ActionResult<object>, ok: string) {
    start(async () => {
      if (!res.ok) {
        setMsg({ kind: "error", text: res.error });
      } else {
        setMsg({ kind: "ok", text: ok });
        setSelected(new Set());
      }
      const r = await actions.reload();
      if (r.ok) setData({ candidates: r.candidates, library: r.library });
    });
  }

  function approve(items: Array<{ catalogId: string; propertyId: string; parts: CopyParts }>) {
    if (!items.length) return;
    setMsg(null);
    start(async () => {
      const r = await actions.approve({ items });
      after(r, r.ok ? (r.approved === 1 ? "Texto aprobado." : `${r.approved} textos aprobados.`) : "");
    });
  }

  function withdraw(propertyId: string, part: CopyPart, title: string) {
    const what = part === "all" ? "el texto aprobado" : part === "title" ? "el título aprobado" : "la descripción aprobada";
    if (!window.confirm(`¿Retirar ${what} de «${title}»? Los catálogos que ya lo usan no cambian.`)) return;
    setMsg(null);
    start(async () => after(await actions.withdraw({ propertyId, part }), "Retirado. Ningún catálogo ha cambiado."));
  }

  const toggle = (k: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });
  const chosen = pendingCands.filter(({ c, parts }) => parts && selected.has(key(c))).map(({ c, parts }) => ({ catalogId: c.catalogId, propertyId: c.propertyId, parts: parts! }));

  return (
    <div className="space-y-8" data-testid="copy-library-page">
      <p className="max-w-3xl text-sm text-ink/65">
        El texto aprobado de una vivienda se copia solo cuando la añades a un catálogo nuevo, sin IA. Publicar en un catálogo no lo aprueba: lo apruebas tú, aquí o desde el editor del catálogo. Cada catálogo guarda su propia copia, así que aprobar otra versión o retirarla no cambia ningún catálogo ya creado o compartido.
      </p>

      {msg ? (
        <p role={msg.kind === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`} data-testid="copy-library-message">
          {msg.text}
        </p>
      ) : null}

      <section aria-labelledby="cl-lib" className="space-y-3">
        <h2 id="cl-lib" className="crm-label-sm text-ink/60">
          Biblioteca ({data.library.length})
        </h2>
        {data.library.length === 0 ? (
          <p className="text-sm text-ink/55">Todavía no hay textos aprobados.</p>
        ) : (
          <ul className="divide-y divide-gold/10 rounded-xl border border-gold/20 bg-white/60" data-testid="copy-library-list">
            {data.library.map(({ propertyId, propertyTitle, view }) => (
              <li key={propertyId} className="space-y-1 px-4 py-3" data-testid="copy-library-row">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{propertyTitle}</span>
                  <span className="text-xs text-ink/50">Versión {view.seq}</span>
                </div>
                {view.title ? <p className="text-xs text-ink/80"><span className="text-ink/50">Título:</span> {view.title}</p> : null}
                {view.body || view.lead ? <p className="line-clamp-2 text-xs text-ink/70"><span className="text-ink/50">Descripción:</span> {[view.lead, view.body].filter(Boolean).join(" ")}</p> : null}
                {view.bodyCurrent === false ? (
                  <p className="text-xs text-amber-900">Revisar: cambió {changedLabel(view.changed) || "la ficha"} desde que se aprobó la descripción.</p>
                ) : null}
                <div className="flex flex-wrap gap-3 text-xs">
                  {view.title ? <button type="button" disabled={pending} onClick={() => withdraw(propertyId, "title", propertyTitle)} className="text-ink/60 underline disabled:opacity-50">Retirar título</button> : null}
                  {view.body || view.lead ? <button type="button" disabled={pending} onClick={() => withdraw(propertyId, "body", propertyTitle)} className="text-ink/60 underline disabled:opacity-50">Retirar descripción</button> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cl-cand" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cl-cand" className="crm-label-sm text-ink/60">
            Publicado en tus catálogos ({data.candidates.length})
          </h2>
          <button
            type="button"
            disabled={pending || chosen.length === 0}
            onClick={() => approve(chosen)}
            className="rounded-lg bg-gold/90 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            data-testid="copy-approve-selected"
          >
            Aprobar los marcados ({chosen.length})
          </button>
        </div>
        <p className="text-xs text-ink/55">Nada viene marcado. Revisa cada texto: si habla de un cliente concreto, no lo apruebes.</p>
        {data.candidates.length === 0 ? (
          <p className="text-sm text-ink/55">No hay textos publicados en tus catálogos.</p>
        ) : (
          <ul className="divide-y divide-gold/10 rounded-xl border border-gold/20 bg-white/60" data-testid="copy-candidates">
            {pendingCands.map(({ c, parts }) => (
              <li key={key(c)} className="flex gap-3 px-4 py-3" data-testid="copy-candidate">
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={!parts || pending}
                  checked={selected.has(key(c))}
                  onChange={() => toggle(key(c))}
                  aria-label={`Marcar el texto de «${c.propertyTitle}» en «${c.catalogTitle}»`}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold text-ink">{c.propertyTitle}</span>
                    <span className="text-xs text-ink/50">en «{c.catalogTitle}»</span>
                    {c.maybePersonal ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900" data-testid="copy-maybe-personal">Catálogo asignado a clientes: puede ser personal</span> : null}
                  </div>
                  {c.title ? <p className="text-xs text-ink/80"><span className="text-ink/50">Título:</span> {c.title}{c.titleInLibrary ? <span className="text-emerald-800"> · ya aprobado</span> : null}</p> : null}
                  {c.body || c.lead ? (
                    <p className="line-clamp-2 text-xs text-ink/70">
                      <span className="text-ink/50">Descripción:</span> {[c.lead, c.body].filter(Boolean).join(" ")}
                      {c.bodyInLibrary ? <span className="text-emerald-800"> · ya aprobada</span> : c.bodyCurrent === false ? <span className="text-amber-900"> · no vigente (la ficha cambió): no se puede aprobar</span> : null}
                    </p>
                  ) : null}
                </div>
                {parts ? (
                  <button type="button" disabled={pending} onClick={() => approve([{ catalogId: c.catalogId, propertyId: c.propertyId, parts }])} className="self-start rounded-lg border border-gold/40 px-2.5 py-1 text-xs text-ink/80 hover:bg-white disabled:opacity-50" data-testid="copy-candidate-approve">
                    Aprobar {partsLabel(parts)}
                  </button>
                ) : (
                  <span className="self-start text-xs text-ink/45">Nada pendiente</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
