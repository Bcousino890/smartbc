"use client";

import { useEffect, useMemo, useState } from "react";
import type { ParticularLinksPayload } from "@/lib/particulares/links-types";
import { buildGroupEvents, type SourceEvent } from "./group-history";

// Las pestañas «Fuentes» e «Histórico» (y la cabecera) piden lo mismo: una sola
// petición por inmueble, reutilizada unos segundos.
const TTL = 15_000;
const cache = new Map<string, { at: number; p: Promise<ParticularLinksPayload | null> }>();

function load(id: string): Promise<ParticularLinksPayload | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = fetch(`/api/admin/particulares/links?id=${encodeURIComponent(id)}`)
    .then((r) => (r.ok ? (r.json() as Promise<ParticularLinksPayload>) : null))
    .catch(() => null);
  cache.set(id, { at: Date.now(), p });
  return p;
}

export function useGroupLinks(rowId: string) {
  const [data, setData] = useState<ParticularLinksPayload | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let off = false;
    setLoading(true);
    load(rowId).then((d) => {
      if (off) return;
      setData(d && Array.isArray(d.members) ? d : { root_id: rowId, members: [], suggestions: [], same_contact: [], contacts: [], changes: [] });
      setLoading(false);
    });
    return () => {
      off = true;
    };
  }, [rowId]);
  const members = data?.members ?? null;
  const events: SourceEvent[] = useMemo(() => (data ? buildGroupEvents(data.members, data.changes ?? []) : []), [data]);
  return { members, events, loading };
}
