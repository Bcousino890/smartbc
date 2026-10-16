// Une, por inmueble, la web de la agencia (fuente `agencia_web_propia`) con nuestra ficha del CRM
// (`particulares_agency_matches`): ambas salen del MISMO anuncio, así que comparten el id del anuncio
// del portal. Una fila por inmueble de agencia en vez de dos. Sin imports de servidor (lo usa la UI).

import type { AgencyMatchInfo, AgencyWebSource } from "./links-types";

export type AgencyInmueble = {
  /** Web propia de la agencia detectada (puede no estar leída aún). */
  web: AgencyWebSource | null;
  /** Nuestra ficha en el CRM que es este mismo inmueble. */
  crm: AgencyMatchInfo | null;
};

/** Webs con su ficha del CRM (si la hay) + fichas del CRM sin web. Las webs primero. */
export function pairAgencyInmuebles(webs: AgencyWebSource[], matches: AgencyMatchInfo[]): AgencyInmueble[] {
  const used = new Set<string>();
  const out: AgencyInmueble[] = [];
  const best = (ms: AgencyMatchInfo[]) => [...ms].sort((a, b) => Number(b.level === "cierto") - Number(a.level === "cierto"))[0] ?? null;
  for (const w of webs) {
    const crm = best(matches.filter((m) => !used.has(m.id) && w.member_ids.includes(m.particular_id)));
    if (crm) used.add(crm.id);
    out.push({ web: w, crm });
  }
  for (const m of matches) if (!used.has(m.id)) out.push({ web: null, crm: m });
  return out;
}

/** Enlaces «Ver en la web»: la canónica es la principal; la original del portal se ofrece si es otra. */
export function webLinks(w: AgencyWebSource): { main: string; original: string | null } {
  const main = w.canonical_url ?? w.url;
  return { main, original: main !== w.url ? w.url : null };
}
