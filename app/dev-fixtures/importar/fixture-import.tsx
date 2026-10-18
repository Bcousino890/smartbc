"use client";

import { useMemo } from "react";
import { ImportClient } from "@/app/[country]/(admin)/admin/propiedades/importar/import-client";
import type { ImportDraftActions } from "@/components/admin/imports/import-actions";
import { applyPhotoSelection, type DraftPhoto, missingForConfirm, normalizeFields } from "@/lib/imports/draft-model";
import type { DuplicateMatch } from "@/lib/imports/duplicates-core";
import type { AgencyChoice, DraftRow } from "@/lib/imports/drafts";
import { importErrorMessage } from "@/lib/imports/errors";

// Acciones falsas del importador (BCP-01 P6) para probar la interfaz en el
// navegador. Imitan las reglas del servidor que la interfaz necesita ver:
// misma clave de petición → mismo borrador; confirmar dos veces → una ficha;
// fotos por tandas; fallos provocables (window.__fxFail = {photos, catalog}).
// Contadores en window.__fxImport para las aserciones.

type Fx = { confirms: number; created: number; catalogAdds: number; lastRequestKeys: string[]; pdfDrafts?: number; uploads?: number };
declare global {
  interface Window {
    __fxImport?: Fx;
    __fxFail?: { photos?: number; catalog?: number; link?: number; upload?: number };
  }
}

const AGENCIES: AgencyChoice[] = [
  { id: "ag-pe", slug: "portales-externos", name: "Portales externos", collaborator: false },
  { id: "ag-lv", slug: "level", name: "Level Properties", collaborator: true },
];
const CATALOGS = [
  { id: "cat-1", title: "Salamanca para Ana" },
  { id: "cat-2", title: "Chamberí familias" },
];
const svg = (n: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="hsl(${n * 70},40%,70%)"/><text x="20" y="110" font-size="40">Foto ${n + 1}</text></svg>`)}`;

const drafts = new Map<string, DraftRow>();
const uploads = new Map<string, string>();
let seq = 0;
const now = () => new Date().toISOString();
const fx = (): Fx => (window.__fxImport ??= { confirms: 0, created: 0, catalogAdds: 0, lastRequestKeys: [] });
const err = (code: string, missing?: string[]) => ({ ok: false as const, code, error: importErrorMessage(code), ...(missing ? { missing } : {}) });
const failOnce = (k: "photos" | "catalog" | "link" | "upload") => {
  const f = window.__fxFail;
  if (f && f[k]) {
    f[k]! -= 1;
    return true;
  }
  return false;
};
const bump = (d: DraftRow, patch: Partial<DraftRow>) => {
  const n = { ...d, ...patch, version: d.version + 1, updated_at: now() };
  drafts.set(d.id, n);
  return n;
};
const setStep = (id: string, step: string, value: { status: string; [k: string]: unknown }) => {
  const d = drafts.get(id)!;
  drafts.set(id, { ...d, steps: { ...d.steps, [step]: value } });
};

function makeDraft(url: string, requestKey: string, catalogId: string | null, portalLinkId: string | null): DraftRow {
  const id = `draft-${++seq}`;
  const photos: DraftPhoto[] = [0, 1, 2, 3].map((i) => ({ id: `r${i}`, kind: "remote", index: i, url: svg(i), selected: i < 3, cover: i === 0 }));
  const sinPrecio = url.includes("sin-precio");
  return {
    id,
    created_by: "fx-user",
    country: "es",
    source_kind: "link",
    source_url: url,
    source_name: null,
    source_hash: null,
    source_part: null,
    request_key: requestKey,
    extracted: { portal: "idealista", warnings: [] },
    fields: {
      title: "Piso luminoso en Lista",
      description: "Exterior, reformado, con ascensor.",
      operation: "rent",
      stay: "long",
      price: sinPrecio ? null : 2400,
      bedrooms: 2,
      bathrooms: 2,
      squareMeters: 95,
      zone: "Salamanca",
      subzone: "Lista",
      address: "Calle de Ayala 50",
      features: ["Ascensor", "Exterior"],
      floor: "3",
    },
    photos,
    agency_id: "ag-pe",
    notify_clients: false,
    catalog_id: catalogId && CATALOGS.some((c) => c.id === catalogId) ? catalogId : null,
    portal_link_id: portalLinkId,
    state: "review",
    duplicate_choice: null,
    property_id: null,
    steps: {},
    version: 1,
    created_at: now(),
    updated_at: now(),
    expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
  };
}

const DUP: DuplicateMatch = {
  propertyId: "prop-dup",
  slug: "piso-existente-lista",
  title: "Piso existente en Lista",
  bcReference: "BC-1500",
  status: "available",
  archived: false,
  updatedAt: "2026-10-01T10:00:00.000Z",
  level: "cierto",
  reasons: ["Misma URL de origen"],
  canUpdate: true,
  blocksNew: false,
};

export const FIXTURE_IMPORT_ACTIONS: ImportDraftActions = {
  list: async () => ({ ok: true, drafts: [...drafts.values()].filter((d) => d.state !== "discarded").reverse() }),
  get: async (_c, id) => {
    const d = drafts.get(id);
    if (!d || d.state === "discarded") return err("draft_not_found");
    return {
      ok: true,
      draft: d,
      agencies: AGENCIES,
      catalogTitle: CATALOGS.find((c) => c.id === d.catalog_id)?.title ?? null,
      catalogs: CATALOGS,
      propertySlug: d.property_id ? `fx-${d.id}` : null,
    };
  },
  createLink: async ({ url, html, requestKey, catalogId, portalLinkId }) => {
    fx().lastRequestKeys.push(requestKey);
    const same = [...drafts.values()].find((d) => d.request_key === requestKey);
    if (same) return { ok: true, draft: same };
    if (!/^https?:\/\//.test(url)) return err("unsupported_url");
    if (url.includes("bloqueado") && !html) return err("blocked");
    if (failOnce("link")) return err("fetch_failed");
    const d = makeDraft(url, requestKey, catalogId ?? null, portalLinkId ?? null);
    drafts.set(d.id, d);
    return { ok: true, draft: d };
  },
  createPdf: async ({ requestKey, sourceName, sourceHash, part, fields, evidence, catalogId }) => {
    fx().lastRequestKeys.push(requestKey);
    const same = [...drafts.values()].find((d) => d.request_key === requestKey);
    if (same) return { ok: true, draft: same };
    const f = normalizeFields(fields);
    if (!f.ok) return err(f.error);
    const id = `draft-${++seq}`;
    const d: DraftRow = {
      ...makeDraft("", requestKey, catalogId ?? null, null),
      id,
      source_kind: "pdf",
      source_url: null,
      source_name: sourceName,
      source_hash: sourceHash,
      source_part: part,
      extracted: { evidence: evidence as Record<string, unknown> },
      fields: f.fields,
      photos: [],
    };
    drafts.set(id, d);
    fx().pdfDrafts = (fx().pdfDrafts ?? 0) + 1;
    return { ok: true, draft: d };
  },
  uploadPhoto: async (_c, draftId, file, page) => {
    const d = drafts.get(draftId);
    if (!d || d.source_kind !== "pdf") return { ok: false, error: "No encuentro ese borrador." };
    if (failOnce("upload")) return { ok: false, error: "Se cortó la conexión al subir la foto." };
    const buf = new Uint8Array(await file.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const pid = `u-${sha.slice(0, 16)}`;
    const existing = d.photos.find((p) => p.id === pid);
    if (existing) return { ok: true, photo: existing };
    uploads.set(pid, URL.createObjectURL(file));
    const photo: DraftPhoto = { id: pid, kind: "upload", sha, path: `fx/${d.id}/${sha}.webp`, ...(page ? { page } : {}), selected: true };
    drafts.set(d.id, { ...d, photos: [...d.photos, photo] });
    fx().uploads = (fx().uploads ?? 0) + 1;
    return { ok: true, photo };
  },
  photoSrc: (_draftId, _c, p) => (p.kind === "remote" ? p.url : (uploads.get(p.id) ?? "")),
  update: async (input) => {
    const d = drafts.get(input.id);
    if (!d) return err("draft_not_found");
    if (d.version !== input.expectedVersion) return err("draft_changed");
    const patch: Partial<DraftRow> = {};
    if (input.fields !== undefined) {
      const f = normalizeFields(input.fields);
      if (!f.ok) return err(f.error);
      patch.fields = f.fields;
    }
    if (input.photoOrder) {
      const p = applyPhotoSelection(d.photos, input.photoOrder);
      if (!p.ok) return err(p.error);
      patch.photos = p.photos;
    }
    if (input.agencyId !== undefined) patch.agency_id = AGENCIES.some((a) => a.id === input.agencyId) ? input.agencyId : d.agency_id;
    if (input.notifyClients !== undefined) patch.notify_clients = input.notifyClients;
    if (input.catalogId !== undefined) patch.catalog_id = input.catalogId && CATALOGS.some((c) => c.id === input.catalogId) ? input.catalogId : null;
    return { ok: true, draft: bump(d, patch) };
  },
  discard: async (_c, id) => {
    const d = drafts.get(id);
    if (!d) return err("draft_not_found");
    if (d.property_id) return err("draft_already_confirmed");
    drafts.set(id, { ...d, state: "discarded" });
    return { ok: true };
  },
  duplicates: async (_c, id) => {
    const d = drafts.get(id);
    if (!d) return err("draft_not_found");
    return { ok: true, matches: d.source_url?.includes("duplicado") ? [DUP] : [], externalId: `link:idealista:${id}` };
  },
  confirm: async ({ id, expectedVersion, choice }) => {
    fx().confirms += 1;
    await new Promise((r) => setTimeout(r, 150));
    const d = drafts.get(id);
    if (!d) return err("draft_not_found");
    if (d.property_id) return { ok: true, propertyId: d.property_id, slug: `fx-${d.id}`, created: false, choice: d.duplicate_choice ?? "new", draft: d };
    if (d.version !== expectedVersion) return err("draft_changed");
    const f = normalizeFields(d.fields);
    if (!f.ok) return err(f.error);
    if (choice.kind === "new") {
      const missing = missingForConfirm(f.fields);
      if (missing.length) return err("missing_fields", missing);
    }
    const pid = choice.kind === "new" ? `prop-${d.id}` : choice.propertyId;
    if (choice.kind === "new") fx().created += 1;
    const sel = d.photos.filter((p) => p.selected).length;
    const steps: DraftRow["steps"] = {
      photos: choice.kind === "new" && sel ? { status: "pending", done: 0, total: sel } : { status: "skipped" },
      catalog: d.catalog_id ? { status: "pending" } : { status: "skipped" },
      client_link: d.portal_link_id ? { status: "pending" } : { status: "skipped" },
    };
    const allSkipped = Object.values(steps).every((s) => s.status === "skipped");
    const n = bump(d, { property_id: pid, duplicate_choice: choice.kind, state: allSkipped ? "done" : "created", steps });
    return { ok: true, propertyId: pid, slug: `fx-${d.id}`, created: choice.kind === "new", choice: choice.kind, draft: n };
  },
  photos: async (_c, id, retry) => {
    const d = drafts.get(id);
    if (!d?.property_id) return err("draft_not_found");
    const sel = d.photos.filter((p) => p.selected);
    const prev = (d.steps.photos ?? {}) as { doneIds?: string[]; failedIds?: string[] };
    const done = new Set(prev.doneIds ?? []);
    const failed = new Set(retry ? [] : (prev.failedIds ?? []));
    const todo = sel.filter((p) => !done.has(p.id) && !failed.has(p.id)).slice(0, 2);
    for (const p of todo) {
      if (failOnce("photos")) failed.add(p.id);
      else done.add(p.id);
    }
    const remaining = sel.filter((p) => !done.has(p.id) && !failed.has(p.id)).length;
    const status = remaining ? "running" : failed.size ? "failed" : "ok";
    setStep(id, "photos", { status, done: done.size, total: sel.length, doneIds: [...done], failedIds: [...failed], ...(failed.size ? { error: `${failed.size} foto(s) no se pudieron guardar` } : {}) });
    finish(id);
    return { ok: true, status, done: done.size, total: sel.length, failed: failed.size };
  },
  catalog: async (_c, id) => {
    const d = drafts.get(id);
    if (!d?.property_id) return err("draft_not_found");
    if (!d.catalog_id) return { ok: true, status: "skipped" };
    if (failOnce("catalog")) {
      setStep(id, "catalog", { status: "failed", error: "catalog_full" });
      return { ok: true, status: "failed", error: "catalog_full", message: importErrorMessage("catalog_full") };
    }
    fx().catalogAdds += 1;
    setStep(id, "catalog", { status: "ok", catalogId: d.catalog_id });
    finish(id);
    return { ok: true, status: "ok" };
  },
  clientLink: async (_c, id) => {
    const d = drafts.get(id);
    if (!d?.property_id) return err("draft_not_found");
    if (!d.portal_link_id) return { ok: true, status: "skipped" };
    setStep(id, "client_link", { status: "ok" });
    finish(id);
    return { ok: true, status: "ok" };
  },
};

function finish(id: string) {
  const d = drafts.get(id)!;
  if (Object.values(d.steps).every((s) => s.status === "ok" || s.status === "skipped")) drafts.set(id, { ...d, state: "done" });
}

export function FixtureImport() {
  const actions = useMemo(() => FIXTURE_IMPORT_ACTIONS, []);
  return <ImportClient country="es" canCreate actions={actions} />;
}
