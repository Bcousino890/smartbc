import { encargoLink } from "./links";
import type { EncargoSource } from "./model";
import type { ItemMatch } from "./sources";

export type Notice = {
  type: "encargo_match";
  title: string;
  body: string;
  link: string;
  data: {
    clientId: string;
    encargoId: string;
    kind: "initial" | "new";
    items: Array<{ source: EncargoSource; id: string; title: string }>;
    totalItems: number;
  };
};

const MAX_ITEMS = 5;
const MAX_REASONS = 4;

function money(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} €`;
}

/** Aviso agrupado de la campanita para un encargo (un solo elemento, varios o stock inicial). */
export function buildNotice(input: {
  kind: "initial" | "new";
  client: { id: string; name: string };
  encargo: { id: string; label: string };
  matches: ItemMatch[];
}): Notice {
  const { kind, client, encargo } = input;
  const sorted = [...input.matches].sort((a, b) => b.score - a.score);
  const total = sorted.length;
  const best = sorted[0];
  const who = `el encargo ${encargo.label} de ${client.name}`;

  let title: string;
  if (kind === "initial") {
    title = total === 1 ? `1 propiedad actual encaja con ${who}` : `${total} propiedades actuales encajan con ${who}`;
  } else if (total === 1) {
    title = `${best?.item.source === "particular" ? "Anuncio nuevo" : "Propiedad nueva"} para ${who}`;
  } else {
    title = `${total} propiedades nuevas para ${who}`;
  }

  const parts: string[] = [];
  if (best) {
    const reasons = [...new Set(best.reasons)].slice(0, MAX_REASONS);
    const where = [best.item.zone, best.item.price > 0 ? money(best.item.price) : null].filter(Boolean).join(" · ");
    parts.push(total > 1 ? `Mejor encaje: ${best.item.title}` : best.item.title);
    if (where) parts.push(where);
    if (reasons.length) parts.push(`Encaja: ${reasons.join(", ")}`);
  }

  const link = encargoLink("es", client.id, encargo.id, total === 1 && best ? { source: best.item.source, id: best.item.id } : undefined);

  return {
    type: "encargo_match",
    title,
    body: parts.join(". "),
    link,
    data: {
      clientId: client.id,
      encargoId: encargo.id,
      kind,
      items: sorted.slice(0, MAX_ITEMS).map((m) => ({ source: m.item.source, id: m.item.id, title: m.item.title })),
      totalItems: total,
    },
  };
}
