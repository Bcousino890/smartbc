"use client";

import type { GroupsState } from "@/lib/catalogs/groups";
import { fixtureGroupActions } from "../../fixture-group-actions";

import { CatalogManager, type CatalogManagerActions } from "@/components/admin/catalogs/catalog-manager";
import type { ShareActions } from "@/components/admin/catalogs/share-panel";
import { parsePropertyRef, refErrorMessage } from "@/lib/catalogs/ref";
import { parseShareDays } from "@/lib/catalogs/share";
import { catalogErrorMessage } from "@/lib/catalogs/errors";
import { clientLinkFromRow, normalizeClientQuery, type ClientLinkActions, type ClientOption } from "@/lib/catalogs/feedback-rules";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogDetail, CatalogItemView } from "@/lib/catalogs/types";
import { normalizeCriteria, type CatalogCriteria, type CatalogOperation } from "@/lib/catalogs/criteria";
import { fixtureManualPricing } from "@/lib/catalogs/fixtures";
import { managerPriceFields } from "@/lib/catalogs/operation-price";
import { effectivePhotos, type PhotoPrefs } from "@/lib/catalogs/photo-selection";
import type { CatalogPhotosView } from "@/lib/catalogs/types";
import { autoSelect, candidates, isAvailable, sortCandidates, type AdjustmentKind } from "@/lib/catalogs/selection";
import { explainProperty, INCLUDED_UNAVAILABLE } from "@/lib/catalogs/explain";
import { fixtureMaterial, fixturePhotoUrl, fixtureProperties, fixtureSavedListings, fixtureView, type FixtureProperty } from "@/lib/catalogs/fixtures-selection";
import { parseIdealistaAdCode } from "@/lib/catalogs/ads";
import { createFixtureTexts } from "./fixture-texts";
import { FIXTURE_AGENCIES, FIXTURE_TAGS, fixtureCatalogSearch } from "@/lib/catalogs/fixture-search";
import { normalizeSearchFilters } from "@/lib/catalogs/search-filters";
import type { TranslationActions } from "@/components/admin/catalogs/manager/languages-section";
import { translationErrorText } from "@/lib/catalogs/translation-labels";

// SOLO DESARROLLO LOCAL (BCP-01, E7): acciones falsas, para revisar el gestor
// sin base de datos ni sistemas reales. Reproducen los mismos mensajes de
// validación que las acciones reales. Con `liveToken` (fase 2), cada guardado
// cambia además el almacén sintético del lector (/dev-fixtures/api/catalogo)
// y devuelve su huella nueva: así se prueba la medición de D13 de punta a
// punta en local (medición SINTÉTICA, no demuestra nada del entorno real).

async function mutate(body: Record<string, unknown>): Promise<{ fingerprint: string | null; before: string | null }> {
  const res = await fetch("/dev-fixtures/api/catalogo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => null);
  return { fingerprint: d?.fingerprint ?? null, before: d?.before ?? null };
}

// E2 · instrumentación de prueba: cuenta lo que LLEGA a cada acción (no lo que
// la interfaz cree haber hecho), guarda el último contenido enviado y permite
// retrasar o hacer fallar el siguiente guardado. Solo /dev-fixtures.
type FxWindow = Window & {
  __fxCalls?: Record<string, number>;
  __fxLast?: Record<string, unknown>;
  __fxSaveDelay?: number;
  __fxFailNext?: boolean;
};
const AI_ACTIONS = new Set(["texts.prepare", "texts.draft"]);
const READ_ACTIONS = new Set(["search", "selection.previewAuto", "selection.previewMode", "texts.preview", "cover.photos", "photos.list", "ads.searchListings"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Envuelve un árbol de acciones con funciones estables que llaman a la versión
 *  actual (ref) y apuntan cada llamada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function instrument<T>(get: () => T, prefix = ""): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sample = get() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = {};
  for (const k of Object.keys(sample)) {
    const name = prefix + k;
    if (typeof sample[k] === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out[k] = async (...args: any[]) => {
        const w = window as FxWindow;
        w.__fxCalls = { ...(w.__fxCalls ?? {}), [name]: (w.__fxCalls?.[name] ?? 0) + 1 };
        w.__fxLast = { ...(w.__fxLast ?? {}), [name]: args[0] };
        if (!AI_ACTIONS.has(name) && !READ_ACTIONS.has(name)) {
          const delay = Number(w.__fxSaveDelay ?? 0);
          if (delay > 0) await sleep(delay);
          if (w.__fxFailNext) {
            w.__fxFailNext = false;
            return { ok: false as const, error: "Error de prueba: el guardado ha fallado (fixture)." };
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (get() as any)[k](...args);
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out[k] = instrument(() => (get() as any)[k], `${name}.`);
    }
  }
  return out as T;
}

/** 0218 · «Asignar a cliente» contra el almacén sintético del servidor (el
 *  lector de fixtures abre esos enlaces personales). Mismos mensajes que las
 *  acciones reales. */
async function opiniones<T>(body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const res = await fetch("/dev-fixtures/api/opiniones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => null);
  if (d?.ok) return { ok: true, data: d.data as T };
  return { ok: false, error: catalogErrorMessage(String(d?.error ?? "")) };
}

function fixtureClientLinkActions(): ClientLinkActions {
  return {
    list: async ({ catalogId }) => {
      const r = await opiniones<Record<string, unknown>[]>({ op: "list", catalogId });
      return r.ok ? { ok: true as const, links: r.data.map((x) => clientLinkFromRow(x)) } : r;
    },
    search: async ({ q }) => {
      const t = normalizeClientQuery(q);
      if (!t) return { ok: true as const, clients: [] };
      const r = await opiniones<ClientOption[]>({ op: "search", q: t });
      return r.ok ? { ok: true as const, clients: r.data } : r;
    },
    create: async ({ catalogId, clientId, days }) => {
      if (!parseShareDays(days).ok) return { ok: false as const, error: catalogErrorMessage("invalid_days") };
      const r = await opiniones<Record<string, unknown>>({ op: "create", catalogId, clientId, days });
      return r.ok ? { ok: true as const, link: clientLinkFromRow(r.data) } : r;
    },
    renew: async ({ linkId, days }) => {
      const r = await opiniones<string>({ op: "renew", linkId, days });
      return r.ok ? { ok: true as const, expiresAt: r.data } : r;
    },
    revoke: async ({ linkId }) => {
      const r = await opiniones<null>({ op: "revoke", linkId });
      return r.ok ? { ok: true as const } : r;
    },
  };
}

/** Traducciones contra el almacén sintético del servidor, con la IA FALSA de
 *  los fixtures (cuenta llamadas). Misma orquestación que las acciones
 *  reales (traducción automática en segundo plano, 0228). */
async function traducciones<T>(body: Record<string, unknown>): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  const res = await fetch("/dev-fixtures/api/traducciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => null);
  if (d?.ok) return d as { ok: true } & T;
  return { ok: false, error: translationErrorText(String(d?.error ?? "")) };
}

function fixtureTranslationActions(): TranslationActions {
  return {
    load: (i) => traducciones({ op: "load", ...i }),
    prepareNow: (i) => traducciones({ op: "prepare-now", ...i }),
    save: (i) => traducciones({ op: "save", ...i }),
    markReviewed: (i) => traducciones({ op: "reviewed", ...i }),
    setCatalogLang: (i) => traducciones({ op: "cat-lang", ...i }),
    setLinkLang: (i) => traducciones({ op: "link-lang", ...i }),
  };
}

const invalid = { ok: false as const, error: "Revisa los criterios: zonas reconocidas, precio con operación (venta o alquiler), mínimo ≤ máximo y entre 1 y 24 viviendas." };

export function FixtureCatalogManager({
  catalog,
  liveToken = null,
  measureMode = false,
  pool = fixtureProperties,
  groups = null,
  translationGaps = [],
}: {
  catalog: CatalogDetail;
  /** PR6 · N5: idiomas activos con viviendas sin traducción vigente. */
  translationGaps?: Array<{ lang: string; pending: string[] }>;
  /** HOME · grupos: estado inicial del almacén sintético de grupos. */
  groups?: GroupsState | null;
  liveToken?: string | null;
  measureMode?: boolean;
  /** E2 · universo de viviendas (el grande con ?grande=1). */
  pool?: FixtureProperty[];
}) {
  const groupActions = useMemo(() => fixtureGroupActions(), []);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const createdAt = new Map(pool.map((p) => [p.id, p.created_at]));
  const [cat, setCat] = useState<CatalogDetail>(catalog);
  const manualRef = useRef<CatalogItemView[]>(catalog.items);
  // C1: ajustes y portada en memoria, con las mismas reglas que SQL (0196).
  const adjRef = useRef(new Map<string, AdjustmentKind>());
  const coverRef = useRef<{ propertyId: string | null; photoId: string | null }>({ propertyId: null, photoId: null });
  const catRef = useRef(cat);
  catRef.current = cat;
  const [, bump] = useState(0);
  const live = async (body: Record<string, unknown> & { skipNotify?: boolean }) => {
    if (!liveToken) return { ok: true as const, version: 1, fingerprint: null, publicChange: true };
    const { skipNotify, ...rest } = body;
    const r = await mutate({ token: liveToken, notify: !skipNotify, ...rest });
    return { ok: true as const, version: 1, fingerprint: r.fingerprint, publicChange: r.before !== r.fingerprint };
  };
  // Cambios que no tocan lo que ve el lector de prueba (criterios en manual,
  // modo en estos datos): misma huella → «sin cambio público».
  const unchanged = async () => {
    if (!liveToken) return { ok: true as const, version: 1, fingerprint: null, publicChange: false };
    const r = await mutate({ token: liveToken, op: "noop" });
    return { ok: true as const, version: 1, fingerprint: r.fingerprint, publicChange: false };
  };
  const textsRef = useRef<ReturnType<typeof createFixtureTexts> | null>(null);
  if (!textsRef.current) {
    textsRef.current = createFixtureTexts({
      items: () => catRef.current.items,
      live: (b) => live(b),
      unchanged: () => unchanged(),
      onChange: () => bump((n) => n + 1),
    });
  }
  const fxTexts = textsRef.current;
  // 0219 · solo pruebas: una vivienda del universo que NO está en el catálogo
  // trae un texto aprobado «desde otro catálogo» (para ver la reutilización).
  const seededRef = useRef(false);
  if (!seededRef.current) {
    seededRef.current = true;
    const inCat = new Set(catalog.items.map((x) => x.propertyId));
    const target = pool.find((p) => !inCat.has(p.id) && (p.status === "available" || p.status === "reserved"));
    if (target) fxTexts.seedLibrary(target.id, `${target.title.split(",")[0]} · texto aprobado`, "Texto aprobado en otro catálogo.\n\nEl salón es muy luminoso.", "Selección de prueba anterior");
    (globalThis as { __fxSeededCopy?: string }).__fxSeededCopy = target?.id;
  }
  // Solo pruebas locales: simula que cambió la ficha de la vivienda i (el texto
  // publicado deja de valer y el lector de prueba vuelve al siguiente nivel).
  useEffect(() => {
    const w = window as unknown as { __fxChangeSource?: (i: number) => Promise<void> };
    // E2 · solo pruebas: un guardado hecho «en otra pestaña» (conflictos).
    const x = window as unknown as {
      __fxExternalMeta?: (title: string) => void;
      __fxExternalContact?: (name: string) => void;
      __fxExternalText?: (i: number, body: string) => void;
    };
    x.__fxExternalMeta = (title) => setCat((c) => ({ ...c, title }));
    // BCP-01 P4: cambia la lista automática entre la vista previa y la confirmación.
    (x as unknown as { __fxChangeAuto?: () => void }).__fxChangeAuto = () => {
      const first = autoItems(catRef.current.criteria).items[0];
      if (first) adjRef.current.set(first.propertyId, "exclude");
      refresh();
    };
    x.__fxExternalContact = (name) => setCat((c) => ({ ...c, contact: { ...c.contact, name } }));
    x.__fxExternalText = (i, body) => {
      const it = catRef.current.items[i];
      if (it) fxTexts.externalSave(it.propertyId, body);
      bump((k) => k + 1);
    };
    w.__fxChangeSource = async (i: number) => {
      const it = catRef.current.items[i];
      if (!it) return;
      fxTexts.changeSource(it.propertyId);
      bump((n) => n + 1);
      await live({ op: "text", index: i, body: null, lead: null });
    };
    // 0220 · solo pruebas: cambia la dirección de la ficha i (la zona
    // confirmada deja de valer y el lector vuelve a la zona de la ficha).
    (w as unknown as { __fxChangeLocation?: (i: number) => Promise<void> }).__fxChangeLocation = async (i: number) => {
      const it = catRef.current.items[i];
      if (!it) return;
      fxTexts.changeLocation(it.propertyId);
      bump((n) => n + 1);
      await live({ op: "area", index: i, area: null, at: fxTexts.atShown(it.propertyId) });
    };
    // 0222 · solo pruebas: se aprueba una versión nueva de una plantilla.
    (w as unknown as { __fxNewTemplate?: (areaId: string, body: string) => void }).__fxNewTemplate = (areaId, body) => {
      fxTexts.newTemplateVersion(areaId, body);
      bump((n) => n + 1);
    };
    // E3: ajustes de fotos de prueba (p. ej. claves que ya no existen, como
    // tras reimportar en el CRM) para comprobar el aviso de E3-5.
    (w as unknown as { __fxPhotoPrefs?: (pid: string, prefs: PhotoPrefs) => void }).__fxPhotoPrefs = (pid, prefs) => {
      photoPrefsRef.current.set(pid, prefs);
      refresh();
      bump((k) => k + 1);
    };
    return () => {
      delete w.__fxChangeSource;
    };
  });
  const explained = (id: string, c: CatalogCriteria, pos: number) => {
    const p = byId.get(id)!;
    const adjustment = adjRef.current.get(id) ?? null;
    return { ...fixtureView(p, pos, c.operation), photoUrl: thumbOf(id), adjustment, explain: explainProperty(p, c, adjustment) };
  };
  const autoItems = (c: CatalogCriteria) => {
    const r = autoSelect(pool, c, [...adjRef.current].map(([propertyId, kind]) => ({ propertyId, kind })));
    return {
      items: r.ids.map((id, i) => ({ ...explained(id, c, (i + 1) * 100), via: r.via[i] })),
      total: r.total,
      matched: r.matched,
    };
  };
  const adjustmentsOf = (c: CatalogCriteria): CatalogDetail["adjustments"] => {
    const ids = [...adjRef.current];
    const incl = ids.filter(([, k]) => k === "include").map(([id]) => explained(id, c, 0));
    const unavailable = incl.filter((v) => v.explain.headline === INCLUDED_UNAVAILABLE);
    const included = incl.length - unavailable.length;
    return { included, unavailable, excluded: ids.filter(([, k]) => k === "exclude").map(([id]) => explained(id, c, 0)), overMax: included > c.max };
  };
  // E3 · ajustes de fotos por vivienda (por clave; aquí la clave es «id#i»).
  const photoPrefsRef = useRef(new Map<string, PhotoPrefs>());
  const demoCount = useRef(new Map(catalog.items.map((it) => [it.propertyId, it.photoUrl ? 2 : 0])));
  const rawPhotos = (propertyId: string) => {
    const p = byId.get(propertyId);
    const n = p ? p.photo_count : demoCount.current.get(propertyId) ?? 0;
    return Array.from({ length: n }, (_, i) => ({ u: `${propertyId}#${i}`, f: `${propertyId}#${i}`, w: 1600, h: 1067, c: i === 0 }));
  };
  /** La regla única (photo-selection.ts) con los ajustes de prueba. */
  const effOf = (propertyId: string) => effectivePhotos(rawPhotos(propertyId), photoPrefsRef.current.get(propertyId) ?? null);
  /** Miniatura de la gestión: la apertura efectiva (D-QA19). */
  const thumbOf = (propertyId: string) => {
    const e = effOf(propertyId);
    return e.photos.length ? fixturePhotoUrl(propertyId, e.photos[e.openingIndex].proxyIdx) : null;
  };
  /** Fotos EN USO de una vivienda de prueba (selector de portada). */
  const photosOf = (propertyId: string) =>
    effOf(propertyId).photos.map((p) => ({ id: p.key as string, url: fixturePhotoUrl(propertyId, p.proxyIdx), isCover: p.crmCover }));
  /** Misma regla de portada que el lector (to-public.ts → coverPhotoOf). */
  const coverOf = (items: CatalogItemView[]): CatalogDetail["cover"] => {
    const { propertyId, photoId } = coverRef.current;
    const warnings: string[] = [];
    if (items.length === 0) warnings.push("El catálogo está vacío: la portada sale sin foto.");
    // E3-3: la elegida en uso → la apertura efectiva de esa vivienda → la de
    // la primera con fotos (las miniaturas ya son la apertura efectiva).
    const first = items.find((x) => x.photoUrl)?.photoUrl ?? null;
    let effective = first;
    if (propertyId) {
      const it = items.find((x) => x.propertyId === propertyId);
      const e = effOf(propertyId);
      if (!it) warnings.push("La vivienda elegida para la portada ya no está en el catálogo: se usa la apertura de la primera vivienda con foto.");
      else if (e.photos.length === 0) warnings.push("La vivienda elegida no tiene fotos: se usa la apertura de la primera vivienda con foto.");
      else {
        const inUse = photoId ? e.photos.find((p) => p.keys.includes(photoId)) : undefined;
        const exists = photoId ? e.all.some((p) => p.keys.includes(photoId)) : false;
        if (photoId && !exists) warnings.push("La foto elegida ya no existe: se usa la foto de apertura de esa vivienda en este catálogo.");
        else if (photoId && !inUse) warnings.push("La foto elegida no se usa en este catálogo: se usa la foto de apertura de esa vivienda.");
        const p = inUse ?? e.photos[e.openingIndex];
        effective = fixturePhotoUrl(propertyId, p.proxyIdx);
      }
    }
    return { chosenPropertyId: propertyId, chosenPhotoId: photoId, effectivePhotoUrl: effective, warnings };
  };
  /** K1: etiquetas de la lista manual con la operación guardada (también las
   *  cuatro del ejemplo, con sus importes de fixtures.ts). */
  const relabel = (xs: CatalogItemView[], op: CatalogOperation) =>
    xs.map((it) => {
      const p = byId.get(it.propertyId) ?? fixtureManualPricing[it.propertyId];
      if (!p) return it;
      return { ...it, ...managerPriceFields({ operation: p.operation, operations: p.operations, price: p.price, rent_price: p.rent_price, currency: "eur" }, op) };
    });
  /** Recalcula la lista efectiva, los ajustes y la portada. */
  const refresh = (patch: Partial<CatalogDetail> = {}) =>
    setCat((c0) => {
      const c = { ...c0, ...patch };
      const a = c.mode === "auto" ? autoItems(c.criteria) : null;
      const items = (a ? a.items : relabel(manualRef.current, c.criteria.operation)).map((it) => ({ ...it, photoUrl: thumbOf(it.propertyId) }));
      // E2 · material: el sintético del universo; las de la lista manual de
      // siempre conservan el suyo (escrito a mano en fixtures.ts).
      const material = Object.fromEntries(
        items.flatMap((it) => {
          const p = byId.get(it.propertyId);
          const m = p ? fixtureMaterial(p) : c0.material[it.propertyId];
          return m ? [[it.propertyId, m]] : [];
        }),
      );
      return { ...c, items, autoTotal: a ? a.total : null, autoMatched: a ? a.matched : null, adjustments: adjustmentsOf(c.criteria), cover: coverOf(items), material };
    });
  // ?auto=1 (P3/P4): un automático antiguo calcula su lista al abrir.
  useEffect(() => {
    if (catalog.mode === "auto") refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  let n = 0;
  const actions: CatalogManagerActions = {
    // E2: como el servidor, lo guardado pasa a ser el valor del catálogo.
    updateMeta: ({ title, intro, skipNotify }) => {
      setCat((c) => ({ ...c, title: title.trim(), intro: (intro ?? "").trim() || null }));
      return live({ op: "title", title: `${title} · ${++n}`, skipNotify });
    },
    removeProperty: ({ skipNotify }) => live({ op: "remove", key: "__first__", skipNotify }),
    reorder: ({ skipNotify }) => live({ op: "reorder", skipNotify }),
    setStatus: async () => ({ ok: true as const, version: 1 }),
    // Validación mínima de prueba (la real es del servidor y de SQL).
    setContact: async ({ name, phone, role, skipNotify }) => {
      const digits = phone.replace(/[^\d+]/g, "");
      if (name.trim().length < 2) return { ok: false as const, error: "El nombre del asesor tiene que tener entre 2 y 80 caracteres, sin correos, webs ni teléfonos." };
      if (!/^(\+[1-9]\d{7,14}|[6789]\d{8})$/.test(digits)) return { ok: false as const, error: "El teléfono no es válido. Escríbelo con prefijo (+34 600 000 000) o como móvil español." };
      const e164 = digits.startsWith("+") ? digits : `+34${digits}`;
      setCat((c) => ({ ...c, contact: { name: name.trim(), phone: e164, role: role === "asesora" ? "asesora" : "asesor" } }));
      return live({ op: "contact", name: name.trim(), phone: e164, role, skipNotify });
    },
    addPropertyById: async ({ propertyId, skipNotify }) => {
      // Como catalog_add_property (0212): máximo de 24 visibles.
      if (manualRef.current.filter((x) => x.status === "available" || x.status === "reserved").length >= 24) {
        return { ok: false as const, error: "El catálogo ya tiene 24 viviendas, el máximo. Quita una antes de añadir otra." };
      }
      if (manualRef.current.some((x) => x.propertyId === propertyId)) return { ok: false as const, error: "Esa propiedad ya está en este catálogo." };
      const p = byId.get(propertyId);
      const view = p ? fixtureView(p, 100, catRef.current.criteria.operation) : undefined;
      if (view) manualRef.current = [...manualRef.current, view];
      const r = await live({ op: "add", title: p?.title ?? "Propiedad de prueba", skipNotify });
      // 0219 · como catalog_add_property: una entrada nueva sin texto recibe el texto aprobado.
      await fxTexts.reuseOnAdd(propertyId, view);
      return r;
    },
    // BCP-01 P3 · buscador nuevo (sobre el universo sintético) y operación.
    catalogSearch: {
      search: async ({ filters, page }) => {
        const n = normalizeSearchFilters(filters);
        if (!n.ok) return { ok: false as const, error: "Revisa los filtros: zonas reconocidas, precio con venta o alquiler, mínimos ≤ máximos." };
        const inCat = new Set((cat.mode === "auto" ? autoItems(cat.criteria).items : manualRef.current).map((x) => x.propertyId));
        const visible = manualRef.current.filter((x) => x.status === "available" || x.status === "reserved").length;
        const result = await fixtureCatalogSearch({
          pool,
          inCatalog: inCat,
          catalog: { mode: cat.mode, status: cat.status, visible: cat.mode === "auto" ? autoItems(cat.criteria).items.length : visible },
          filters: n.filters,
          page,
          catalogOperation: cat.criteria.operation,
          photoUrl: (id) => thumbOf(id),
        });
        return { ok: true as const, result };
      },
      options: async () => ({ ok: true as const, agencies: FIXTURE_AGENCIES, tags: FIXTURE_TAGS }),
    },
    // BCP-01 P4 · conversión (como 0213): vista previa y revalidación al
    // confirmar. window.__fxChangeAuto() cambia la lista entre medias.
    conversion: {
      preview: async () => {
        if (cat.mode !== "auto") return { ok: false as const, error: "Este catálogo ya es una selección fija." };
        const a = autoItems(cat.criteria);
        const ids = a.items.map((x) => x.propertyId);
        const incl = [...adjRef.current].filter(([, k]) => k === "include").map(([id]) => id).filter((id) => !ids.includes(id));
        return {
          ok: true as const,
          preview: {
            version: ids.length,
            ids,
            items: a.items,
            droppedInclusions: incl.map((id) => explained(id, cat.criteria, 0)),
            archivedManual: manualRef.current.filter((x) => !ids.includes(x.propertyId)),
            adjustments: adjRef.current.size,
          },
        };
      },
      convert: async ({ expectedIds }) => {
        if (cat.mode !== "auto") return { ok: false as const, error: "Este catálogo ya es una selección fija." };
        const now = autoItems(cat.criteria).items;
        if (JSON.stringify(now.map((x) => x.propertyId)) !== JSON.stringify(expectedIds)) {
          return { ok: false as const, error: "La lista ha cambiado desde la vista previa (se ha vendido, cambiado o editado algo). No se ha convertido: revisa la vista previa nueva y confirma otra vez." };
        }
        manualRef.current = now.map((x, i) => ({ ...x, position: (i + 1) * 100, via: undefined, explain: undefined }));
        refresh({ mode: "manual" });
        return unchanged();
      },
    },
    // PR7b · como catalog_set_photo_finish (0227): el lector de prueba lo
    // recibe por el almacén sintético (op «finish»).
    setPhotoFinish: async ({ on, skipNotify }) => {
      if (catRef.current.photoFinish === on) return unchanged();
      refresh({ photoFinish: on });
      return live({ op: "finish", on, skipNotify });
    },
    setOperation: async ({ operation, skipNotify }) => {
      if (cat.mode === "auto") return { ok: false as const, error: "Este catálogo es automático (antiguo): su operación es un criterio." };
      if (operation === cat.criteria.operation) return unchanged();
      refresh({ criteria: { ...cat.criteria, operation, ...(operation === "any" ? { price_min: null, price_max: null } : {}) } });
      return live({ op: "operation", operation, skipNotify });
    },
    search: async ({ criteria, text, offset = 0 }) => {
      const n = normalizeCriteria(criteria);
      if (!n.ok) return invalid;
      const all = sortCandidates(candidates(pool, n.criteria, { requirePhoto: false, text }), n.criteria, createdAt);
      const inCat = new Set((cat.mode === "auto" ? autoItems(cat.criteria).items : manualRef.current).map((x) => x.propertyId));
      return {
        ok: true as const,
        total: all.length,
        items: all.slice(offset, offset + 20).map((x) => ({ ...explained(x.id, cat.criteria, 100), inCatalog: inCat.has(x.id) })),
      };
    },
    selection: {
      setCriteria: async ({ criteria, skipNotify }) => {
        const n = normalizeCriteria(criteria);
        if (!n.ok) return invalid;
        if (adjustmentsOf(n.criteria).included > n.criteria.max) {
          return { ok: false as const, error: "Hay más inclusiones que ese máximo. Sube el máximo o quita una inclusión." };
        }
        const changes = cat.mode === "auto" && JSON.stringify(autoItems(n.criteria).items.map((x) => x.propertyId)) !== JSON.stringify(cat.items.map((x) => x.propertyId));
        // K1: la operación guardada cambia lo que ve el lector también en
        // manual (la instantánea no): se lleva al enlace de prueba en vivo.
        const opChanged = n.criteria.operation !== cat.criteria.operation;
        refresh({ criteria: n.criteria });
        if (opChanged) {
          const before = changes ? (await live({ op: "reorder", skipNotify })).fingerprint : null;
          const r = await live({ op: "operation", operation: n.criteria.operation, skipNotify });
          return before === null ? r : { ...r, publicChange: true };
        }
        return changes ? live({ op: "reorder", skipNotify }) : unchanged();
      },
      previewAuto: async ({ criteria }) => {
        // Pruebas de la vista previa: retardos por petición (window.__fxPreviewDelays = [ms, …]),
        // para provocar respuestas tardías y desordenadas.
        const delays = (window as unknown as { __fxPreviewDelays?: number[] }).__fxPreviewDelays;
        const ms = delays?.shift();
        if (ms) await new Promise((r) => setTimeout(r, ms));
        const n = normalizeCriteria(criteria);
        return n.ok ? { ok: true as const, ...autoItems(n.criteria) } : invalid;
      },
      previewMode: async ({ mode }) => {
        const a = autoItems(cat.criteria);
        const now = cat.mode === "auto" ? a.items : manualRef.current;
        const next = mode === "auto" ? a.items : manualRef.current;
        const ids = (xs: CatalogItemView[]) => new Set(xs.map((x) => x.propertyId));
        return {
          ok: true as const,
          entering: next.filter((x) => !ids(now).has(x.propertyId)),
          leaving: now.filter((x) => !ids(next).has(x.propertyId)),
          autoTotal: a.total,
          manualCount: manualRef.current.length,
        };
      },
      setMode: async ({ mode, strategy }) => {
        if (mode === cat.mode) return { ok: false as const, error: "El catálogo ya está en ese modo." };
        if (mode === "manual" && strategy === "convert") manualRef.current = autoItems(cat.criteria).items;
        refresh({ mode, manualCount: mode === "manual" && strategy === "convert" ? manualRef.current.length : manualRef.current.length });
        return unchanged();
      },
    },
    adjust: async ({ propertyId, kind, skipNotify }) => {
      if (cat.mode !== "auto") return { ok: false as const, error: "Incluir y excluir solo se usa en modo automático. En manual, añade o quita viviendas de la lista." };
      const p = byId.get(propertyId);
      if (!p) return { ok: false as const, error: "No encuentro esa propiedad." };
      if (adjRef.current.get(propertyId) === kind) return unchanged();
      if (kind === "include") {
        if (!isAvailable(p)) return { ok: false as const, error: p.country !== "es" ? "En esta versión solo se pueden añadir propiedades de España." : "Esa propiedad está vendida o archivada; no se puede añadir." };
        if (adjustmentsOf(cat.criteria).included + 1 > cat.criteria.max) {
          return { ok: false as const, error: "No caben más inclusiones con el máximo actual. Sube el máximo o quita una inclusión." };
        }
      }
      const before = autoItems(cat.criteria).items.map((x) => x.propertyId).join();
      adjRef.current.set(propertyId, kind);
      const after = autoItems(cat.criteria).items.map((x) => x.propertyId).join();
      refresh();
      if (before === after) return unchanged();
      return kind === "exclude" ? live({ op: "remove", key: "__first__", skipNotify }) : live({ op: "add", title: p.title, skipNotify });
    },
    clearAdjustment: async ({ propertyId, skipNotify }) => {
      if (!adjRef.current.has(propertyId)) return { ok: false as const, error: "Esa vivienda ya no tenía ningún ajuste." };
      const before = autoItems(cat.criteria).items.map((x) => x.propertyId).join();
      adjRef.current.delete(propertyId);
      const after = autoItems(cat.criteria).items.map((x) => x.propertyId).join();
      refresh();
      return before === after ? unchanged() : live({ op: "reorder", skipNotify });
    },
    texts: fxTexts.actions,
    cover: {
      set: async ({ propertyId, photoId, skipNotify }) => {
        if (propertyId && !cat.items.some((x) => x.propertyId === propertyId)) {
          return { ok: false as const, error: "La portada tiene que ser una vivienda que esté ahora en el catálogo." };
        }
        if (photoId && (!propertyId || !photosOf(propertyId).some((x) => x.id === photoId))) {
          return { ok: false as const, error: "Esa foto no es de la vivienda elegida." };
        }
        coverRef.current = { propertyId: propertyId ?? null, photoId: photoId ?? null };
        refresh();
        return live({ op: "cover", choose: propertyId ? cat.items.findIndex((x) => x.propertyId === propertyId) : null, skipNotify });
      },
      photos: async ({ propertyId }) => ({ ok: true as const, photos: photosOf(propertyId) }),
    },
    // E3 · las mismas reglas que catalog_photo_exclude / catalog_photo_opening.
    photos: {
      list: async ({ propertyId }) => {
        const e = effOf(propertyId);
        const pr = photoPrefsRef.current.get(propertyId) ?? { x: [], o: null };
        const known = new Set(e.all.flatMap((p) => p.keys));
        const openingKey = e.photos.length ? e.photos[e.openingIndex].key : null;
        const view: CatalogPhotosView = {
          propertyId,
          photos: e.all.map((p) => ({
            photoId: p.key as string,
            url: fixturePhotoUrl(propertyId, p.proxyIdx),
            excluded: p.excluded,
            opening: !p.excluded && p.key === openingKey,
            chosen: p.opening,
            crmCover: p.crmCover,
            catalogCover: coverRef.current.propertyId === propertyId && !!coverRef.current.photoId && p.keys.includes(coverRef.current.photoId),
            noFinish: p.noFinish,
          })),
          used: e.photos.length,
          total: e.all.length,
          openingSource: e.openingSource,
          stale: { excluded: pr.x.filter((k) => !known.has(k)), opening: pr.o && !known.has(pr.o) ? pr.o : null },
          catalogCoverHere: coverRef.current.propertyId === propertyId,
          finish: catRef.current.photoFinish,
        };
        return { ok: true as const, view };
      },
      // PR7b · las mismas reglas que catalog_photo_no_finish (0227).
      setNoFinish: async ({ propertyId, photoId, noFinish }) => {
        if (!cat.items.some((x) => x.propertyId === propertyId)) return { ok: false as const, error: "Esa vivienda no está ahora en el catálogo." };
        const pr = photoPrefsRef.current.get(propertyId) ?? { x: [], o: null };
        const group = effOf(propertyId).all.find((p) => p.keys.includes(photoId));
        const marked = pr.n ?? [];
        if (noFinish) {
          if (!group) return { ok: false as const, error: "Esa foto no es de esta vivienda o ya no existe." };
          if (group.noFinish) return { ok: true as const, version: 1, fingerprint: null, publicChange: false };
          photoPrefsRef.current.set(propertyId, { ...pr, n: [...marked, photoId] });
        } else {
          const drop = new Set(group ? group.keys : [photoId]);
          if (!marked.some((k) => drop.has(k))) return { ok: true as const, version: 1, fingerprint: null, publicChange: false };
          photoPrefsRef.current.set(propertyId, { ...pr, n: marked.filter((k) => !drop.has(k)) });
        }
        refresh();
        return { ok: true as const, version: 1, fingerprint: null, publicChange: catRef.current.photoFinish };
      },
      setExcluded: async ({ propertyId, photoId, excluded }) => {
        if (!cat.items.some((x) => x.propertyId === propertyId)) return { ok: false as const, error: "Esa vivienda no está ahora en el catálogo." };
        const e = effOf(propertyId);
        const pr = photoPrefsRef.current.get(propertyId) ?? { x: [], o: null };
        const group = e.all.find((p) => p.keys.includes(photoId));
        if (!excluded) {
          const drop = new Set(group ? group.keys : [photoId]);
          if (!pr.x.some((k) => drop.has(k))) return { ok: true as const, version: 1, fingerprint: null, publicChange: false };
          photoPrefsRef.current.set(propertyId, { ...pr, x: pr.x.filter((k) => !drop.has(k)) });
        } else {
          if (!group) return { ok: false as const, error: "Esa foto no es de esta vivienda o ya no existe." };
          if (group.excluded) return { ok: true as const, version: 1, fingerprint: null, publicChange: false };
          if (e.photos.filter((p) => p !== e.photos.find((q) => q.keys.includes(photoId))).length < 1) {
            return { ok: false as const, error: "Es la última foto que se usa de esta vivienda en el catálogo. Para que no aparezca, quita la vivienda o exclúyela en Viviendas." };
          }
          photoPrefsRef.current.set(propertyId, { x: [...pr.x, photoId], o: pr.o && group.keys.includes(pr.o) ? null : pr.o });
        }
        refresh();
        return { ok: true as const, version: 1, fingerprint: null, publicChange: true };
      },
      setOpening: async ({ propertyId, photoId }) => {
        if (!cat.items.some((x) => x.propertyId === propertyId)) return { ok: false as const, error: "Esa vivienda no está ahora en el catálogo." };
        const pr = photoPrefsRef.current.get(propertyId) ?? { x: [], o: null };
        if (photoId === null) {
          if (pr.o === null) return { ok: true as const, version: 1, fingerprint: null, publicChange: false };
          photoPrefsRef.current.set(propertyId, { ...pr, o: null });
        } else {
          const group = effOf(propertyId).all.find((p) => p.keys.includes(photoId));
          if (!group) return { ok: false as const, error: "Esa foto no es de esta vivienda o ya no existe." };
          if (group.excluded) return { ok: false as const, error: "Esa foto no se usa en este catálogo. Vuelve a usarla antes de elegirla como foto de apertura." };
          photoPrefsRef.current.set(propertyId, { ...pr, o: photoId });
        }
        refresh();
        return { ok: true as const, version: 1, fingerprint: null, publicChange: true };
      },
    },
    ads: {
      add: async ({ listingId, codeOrUrl }) => {
        if (codeOrUrl && !parseIdealistaAdCode(codeOrUrl)) return { ok: false as const, error: "No reconozco ese anuncio. Pega el enlace de Idealista (…/inmueble/123456789/) o su número." };
        if (!listingId && !codeOrUrl) return { ok: false as const, error: "Elige una ficha guardada o pega el enlace o el código del anuncio." };
        return { ok: true as const, id: `e3000000-0000-0000-0000-${String(Date.now()).slice(-12)}` };
      },
      remove: async () => ({ ok: true as const }),
      searchListings: async ({ text }) => {
        const t = text.trim().toLowerCase();
        return { ok: true as const, items: fixtureSavedListings.filter((l) => `${l.reference} ${l.title} ${l.code ?? ""}`.toLowerCase().includes(t)) };
      },
    },
    addProperty: async ({ reference, skipNotify }) => {
      const ref = parsePropertyRef(reference);
      if (ref.kind === "invalid") return { ok: false as const, error: refErrorMessage(ref.reason) };
      return live({ op: "add", title: `Propiedad de prueba ${ref.kind === "bc" ? ref.reference : ref.slug}`, skipNotify });
    },
  };
  const shareActions: ShareActions = {
    create: async ({ days }) =>
      parseShareDays(days).ok
        ? { ok: true as const, token: liveToken ?? "fixtureMainToken000000000001", expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() }
        : { ok: false as const, error: "La duración del enlace tiene que ser de 1 a 365 días." },
    renew: async ({ days }) => ({ ok: true as const, token: liveToken ?? "fixtureMainToken000000000001", expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() }),
    revoke: async () => ({ ok: true as const }),
  };
  const clientLinkActions = useMemo(() => fixtureClientLinkActions(), []);
  const translationActions = useMemo(() => fixtureTranslationActions(), []);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const shareRef = useRef(shareActions);
  shareRef.current = shareActions;
  const fx = useRef<{ actions: CatalogManagerActions; share: ShareActions } | null>(null);
  if (!fx.current) fx.current = { actions: instrument(() => actionsRef.current), share: instrument(() => shareRef.current, "share.") };
  const onLocalAdd = (reference: string): CatalogItemView | null => {
    const ref = parsePropertyRef(reference);
    if (ref.kind === "invalid") return null;
    const label = ref.kind === "bc" ? ref.reference : ref.slug;
    return {
      propertyId: `e0000000-0000-0000-0000-${String(Date.now()).slice(-12).padStart(12, "0")}`,
      position: 999,
      slug: ref.kind === "slug" ? ref.slug : "demo",
      bcReference: ref.kind === "bc" ? ref.reference : null,
      title: `Propiedad de prueba ${label}`,
      zone: null,
      status: "available",
      operation: "Venta",
      price: "Precio · sin dato",
      bedrooms: null,
      bathrooms: null,
      squareMeters: null,
      photoUrl: null,
    };
  };
  return (
    <CatalogManager
      catalog={cat}
      actions={fx.current.actions}
      basePath="/dev-fixtures/mi-espacio"
      numberLabel="nº 01"
      onLocalAdd={onLocalAdd}
      share={liveToken ? { token: liveToken, expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString(), expired: false } : null}
      shareActions={fx.current.share}
      clientLinkActions={clientLinkActions}
      translationActions={translationActions}
      translationGaps={translationGaps}
      measureMode={measureMode}
      texts={fxTexts.views()}
      storyHref={() => "#historia-de-prueba"}
      groups={groups ? { initial: groups, actions: groupActions } : null}
    />
  );
}
