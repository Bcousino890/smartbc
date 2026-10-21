"use client";

import { useRef } from "react";
import { CopyLibraryPage, type CopyLibraryActions, type CopyLibraryData } from "@/components/admin/catalogs/copy-library-page";
import type { CopyCandidate, CopyLibraryView } from "@/lib/catalogs/copy-rules";

// SOLO DESARROLLO LOCAL: biblioteca y candidatos sintéticos con las mismas
// reglas que 0219 (aprobar lo publicado; descripción no vigente no se
// aprueba; retirar por partes). Sin red, sin IA.

const cand = (o: Partial<CopyCandidate> & Pick<CopyCandidate, "catalogId" | "catalogTitle" | "propertyId" | "propertyTitle">): CopyCandidate => ({
  title: null, body: null, lead: null, bodyCurrent: null, maybePersonal: false, publishedAt: null, titleInLibrary: false, bodyInLibrary: false, ...o,
});

function seed(): { cands: CopyCandidate[]; lib: Map<string, { title: string; v: CopyLibraryView }> } {
  const cands = [
    cand({ catalogId: "fc-1", catalogTitle: "Salamanca y Chamberí", propertyId: "fp-1", propertyTitle: "Ático con terraza en Jerónimos",
      title: "Ático con terraza sobre los tejados de Jerónimos", body: "Un ático luminoso con terraza.\n\nEl salón se abre al este.", bodyCurrent: true }),
    cand({ catalogId: "fc-2", catalogTitle: "Para la familia Ruiz", propertyId: "fp-1", propertyTitle: "Ático con terraza en Jerónimos",
      title: "El ático que buscabais cerca del colegio", body: "Pensado para vuestros tres hijos.", bodyCurrent: true, maybePersonal: true }),
    cand({ catalogId: "fc-1", catalogTitle: "Salamanca y Chamberí", propertyId: "fp-2", propertyTitle: "Piso señorial en Almagro",
      title: "Piso señorial con galería", body: "Finca de 1920 con portero.", bodyCurrent: false }),
    cand({ catalogId: "fc-1", catalogTitle: "Salamanca y Chamberí", propertyId: "fp-3", propertyTitle: "Dúplex en Chamberí",
      title: "Dúplex con patio", titleInLibrary: true, body: "Dúplex tranquilo.", bodyCurrent: true, bodyInLibrary: true }),
  ];
  const lib = new Map<string, { title: string; v: CopyLibraryView }>([
    ["fp-3", { title: "Dúplex en Chamberí", v: { versionId: "fv-3", seq: 2, title: "Dúplex con patio", body: "Dúplex tranquilo.", lead: null, bodyCurrent: true, changed: [], titleApprovedAt: null, bodyApprovedAt: null, titleCatalogTitle: "Salamanca y Chamberí", bodyCatalogTitle: "Salamanca y Chamberí" } }],
  ]);
  return { cands, lib };
}

export function FixtureCopyLibrary() {
  const st = useRef(seed());
  const data = (): CopyLibraryData => {
    const { cands, lib } = st.current;
    return {
      candidates: cands.map((c) => {
        const l = lib.get(c.propertyId)?.v;
        return { ...c, titleInLibrary: !!c.title && l?.title === c.title, bodyInLibrary: !!c.body && l?.body === c.body };
      }),
      library: [...lib.entries()].map(([propertyId, { title, v }]) => ({ propertyId, propertyTitle: title, view: v })),
    };
  };
  const actions: CopyLibraryActions = {
    reload: async () => ({ ok: true as const, ...data() }),
    approve: async ({ items }) => {
      let approved = 0;
      for (const it of items) {
        const c = st.current.cands.find((x) => x.catalogId === it.catalogId && x.propertyId === it.propertyId);
        if (!c) return { ok: false as const, error: "Esa vivienda no tiene texto publicado en este catálogo." };
        const wantB = it.parts !== "title";
        if (wantB && c.bodyCurrent !== true) return { ok: false as const, error: "La descripción publicada ya no corresponde a la ficha (cambió). Revísala y vuelve a publicarla antes de aprobarla." };
        const prev = st.current.lib.get(c.propertyId);
        const v: CopyLibraryView = {
          versionId: `fv-${c.propertyId}-${(prev?.v.seq ?? 0) + 1}`, seq: (prev?.v.seq ?? 0) + 1,
          title: it.parts !== "body" ? c.title : prev?.v.title ?? null,
          body: wantB ? c.body : prev?.v.body ?? null, lead: wantB ? c.lead : prev?.v.lead ?? null,
          bodyCurrent: wantB ? true : prev?.v.bodyCurrent ?? null, changed: [], titleApprovedAt: null, bodyApprovedAt: null,
          titleCatalogTitle: it.parts !== "body" ? c.catalogTitle : prev?.v.titleCatalogTitle ?? null,
          bodyCatalogTitle: wantB ? c.catalogTitle : prev?.v.bodyCatalogTitle ?? null,
        };
        st.current.lib.set(c.propertyId, { title: c.propertyTitle, v });
        approved++;
      }
      return { ok: true as const, approved };
    },
    withdraw: async ({ propertyId, part }) => {
      const prev = st.current.lib.get(propertyId);
      if (!prev) return { ok: false as const, error: "Esa vivienda no tiene texto aprobado." };
      const v = { ...prev.v, seq: prev.v.seq + 1 };
      if (part !== "body") v.title = null;
      if (part !== "title") { v.body = null; v.lead = null; v.bodyCurrent = null; }
      if (!v.title && !v.body && !v.lead) st.current.lib.delete(propertyId);
      else st.current.lib.set(propertyId, { ...prev, v });
      return { ok: true as const };
    },
  };
  return <CopyLibraryPage initial={data()} actions={actions} />;
}
