"use client";

import { useSyncExternalStore } from "react";

// Almacén de valores sin guardar del gestor (BCP-01 E2, plan §3.4). Es el
// ÚNICO dueño de lo escrito en todos los formularios (criterios, título e
// introducción, portada, contacto y texto de cada vivienda) y del estado de
// sesión del editor de textos. Vive fuera de React, en memoria del documento
// de la pestaña: sobrevive a cerrar un editor, cambiar de sección o de
// vivienda, a router.refresh() y a las navegaciones internas del CRM, pero NO
// a una recarga (no usa localStorage ni nada persistente). Nunca llama a
// ninguna acción: nada se guarda ni se publica solo. Las reglas de cada
// borrador (en bruto, guardados en curso, conflictos) son puras y están en
// lib/catalogs/manager-state.ts.

type Kind = "draft" | "session" | "ui";

const buckets = new Map<string, Record<Kind, Map<string, unknown>>>();
const listeners = new Set<() => void>();
let version = 0;

function bucket(catalogId: string) {
  let b = buckets.get(catalogId);
  if (!b) {
    b = { draft: new Map(), session: new Map(), ui: new Map() };
    buckets.set(catalogId, b);
  }
  return b;
}

function emit() {
  version++;
  for (const l of listeners) l();
}

function read<T>(kind: Kind, catalogId: string, key: string): T | undefined {
  if (typeof window === "undefined") return undefined;
  return buckets.get(catalogId)?.[kind].get(key) as T | undefined;
}

function write<T>(kind: Kind, catalogId: string, key: string, fn: (prev: T | undefined) => T | undefined) {
  if (typeof window === "undefined") return;
  const m = bucket(catalogId)[kind];
  const prev = m.get(key) as T | undefined;
  const next = fn(prev);
  if (next === prev) return;
  if (next === undefined) m.delete(key);
  else m.set(key, next);
  emit();
}

export const draftsStore = {
  draft: <T>(catalogId: string, key: string) => read<T>("draft", catalogId, key),
  updateDraft: <T>(catalogId: string, key: string, fn: (prev: T | undefined) => T | undefined) => write<T>("draft", catalogId, key, fn),
  discardDraft: (catalogId: string, key: string) => write("draft", catalogId, key, () => undefined),
  draftKeys: (catalogId: string): string[] => (typeof window === "undefined" ? [] : [...(buckets.get(catalogId)?.draft.keys() ?? [])]),
  session: <T>(catalogId: string, key: string) => read<T>("session", catalogId, key),
  updateSession: <T>(catalogId: string, key: string, fn: (prev: T | undefined) => T | undefined) => write<T>("session", catalogId, key, fn),
  ui: <T>(catalogId: string, key: string) => read<T>("ui", catalogId, key),
  setUi: <T>(catalogId: string, key: string, value: T) => write<T>("ui", catalogId, key, () => value),
  /** Al aceptar salir sin guardar: fuera borradores y sesión de ese catálogo. */
  discardAll(catalogId: string) {
    const b = buckets.get(catalogId);
    if (!b || (b.draft.size === 0 && b.session.size === 0)) return;
    b.draft.clear();
    b.session.clear();
    emit();
  },
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Vuelve a pintar el componente cuando cambia el almacén. En el servidor (y
 *  en la primera pintura) no hay borradores. */
export function useDraftsVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}
