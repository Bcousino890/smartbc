"use client";

import { useEffect, useRef } from "react";
import {
  editDraft,
  isEdited,
  keepMine,
  reconcileDraft,
  saveFailed,
  saveSucceeded,
  type Draft,
  type FormAdapter,
  type Saved,
} from "@/lib/catalogs/manager-state";
import { draftsStore, useDraftsVersion } from "./drafts-store";

// Un formulario del gestor conectado al almacén de borradores (BCP-01 E2).
// El valor que se ve es el borrador EN BRUTO si existe; si no, el guardado.
// Guardar sigue el protocolo del ajuste 2: begin(instantánea) → ok/fail(clave).

export interface FormDraft<R> {
  value: R;
  edited: boolean;
  conflict: Saved<R> | null;
  set: (next: R) => void;
  discard: () => void;
  keepMine: () => void;
  /** Captura la instantánea enviada; devuelve su clave semántica. */
  begin: (submitted: R) => string;
  ok: (submittedKey: string) => void;
  fail: (submittedKey: string) => void;
}

export function useFormDraft<R>(catalogId: string, key: string, adapter: FormAdapter<R>, saved: Saved<R>): FormDraft<R> {
  useDraftsVersion();
  const d = draftsStore.draft<Draft<R>>(catalogId, key);
  const latest = useRef(saved);
  latest.current = saved;
  const update = (fn: (prev: Draft<R>) => Draft<R>) => draftsStore.updateDraft<Draft<R>>(catalogId, key, (prev) => (prev ? fn(prev) : prev));

  // Llega un valor guardado nuevo (o se vuelve al gestor): se reconcilia sin
  // tocar lo escrito.
  useEffect(() => {
    draftsStore.updateDraft<Draft<R>>(catalogId, key, (prev) => (prev ? reconcileDraft(adapter, prev, latest.current) : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId, key, saved.key]);

  return {
    value: d ? d.value : saved.raw,
    edited: isEdited(adapter, d),
    conflict: d?.conflict ?? null,
    set: (next) => draftsStore.updateDraft<Draft<R>>(catalogId, key, (prev) => editDraft(prev, latest.current.key, next)),
    discard: () => draftsStore.discardDraft(catalogId, key),
    keepMine: () => update(keepMine),
    begin: (submitted) => {
      const k = adapter.key(submitted);
      update((prev) => ({ ...prev, pending: k }));
      return k;
    },
    ok: (k) => update((prev) => saveSucceeded(prev, k)),
    fail: (k) => update((prev) => saveFailed(prev, k)),
  };
}
