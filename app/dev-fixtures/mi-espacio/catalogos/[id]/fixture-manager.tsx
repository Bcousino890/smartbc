"use client";

import { CatalogManager, type CatalogManagerActions } from "@/components/admin/catalogs/catalog-manager";
import type { ShareActions } from "@/components/admin/catalogs/share-panel";
import { parsePropertyRef, refErrorMessage } from "@/lib/catalogs/ref";
import { parseShareDays } from "@/lib/catalogs/share";
import { useEffect, useRef, useState } from "react";
import type { CatalogDetail, CatalogItemView } from "@/lib/catalogs/types";
import { normalizeCriteria, type CatalogCriteria } from "@/lib/catalogs/criteria";
import { autoSelect, candidates, isAvailable, sortCandidates, type AdjustmentKind } from "@/lib/catalogs/selection";
import { explainProperty, INCLUDED_UNAVAILABLE } from "@/lib/catalogs/explain";
import { fixturePhotoUrl, fixtureProperties, fixtureSavedListings, fixtureView } from "@/lib/catalogs/fixtures-selection";
import { parseIdealistaAdCode } from "@/lib/catalogs/ads";
import { createFixtureTexts } from "./fixture-texts";

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

const byId = new Map(fixtureProperties.map((p) => [p.id, p]));
const createdAt = new Map(fixtureProperties.map((p) => [p.id, p.created_at]));
const invalid = { ok: false as const, error: "Revisa los criterios: zonas reconocidas, precio con operación (venta o alquiler), mínimo ≤ máximo y entre 1 y 24 viviendas." };

export function FixtureCatalogManager({
  catalog,
  liveToken = null,
  measureMode = false,
}: {
  catalog: CatalogDetail;
  liveToken?: string | null;
  measureMode?: boolean;
}) {
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
  // Solo pruebas locales: simula que cambió la ficha de la vivienda i (el texto
  // publicado deja de valer y el lector de prueba vuelve al siguiente nivel).
  useEffect(() => {
    const w = window as unknown as { __fxChangeSource?: (i: number) => Promise<void> };
    w.__fxChangeSource = async (i: number) => {
      const it = catRef.current.items[i];
      if (!it) return;
      fxTexts.changeSource(it.propertyId);
      bump((n) => n + 1);
      await live({ op: "text", index: i, body: null, lead: null });
    };
    return () => {
      delete w.__fxChangeSource;
    };
  });
  const explained = (id: string, c: CatalogCriteria, pos: number) => {
    const p = byId.get(id)!;
    const adjustment = adjRef.current.get(id) ?? null;
    return { ...fixtureView(p, pos), adjustment, explain: explainProperty(p, c, adjustment) };
  };
  const autoItems = (c: CatalogCriteria) => {
    const r = autoSelect(fixtureProperties, c, [...adjRef.current].map(([propertyId, kind]) => ({ propertyId, kind })));
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
  /** Fotos de una vivienda de prueba (las del ejemplo manual: 2 si tiene foto). */
  const photosOf = (propertyId: string) => {
    const p = byId.get(propertyId);
    const n = p ? p.photo_count : manualRef.current.find((x) => x.propertyId === propertyId)?.photoUrl ? 2 : 0;
    return Array.from({ length: n }, (_, i) => ({ id: `${propertyId}#${i}`, url: fixturePhotoUrl(propertyId, i), isCover: i === 0 }));
  };
  /** Misma regla de portada que el lector (to-public.ts → coverPhotoOf). */
  const coverOf = (items: CatalogItemView[]): CatalogDetail["cover"] => {
    const { propertyId, photoId } = coverRef.current;
    const warnings: string[] = [];
    if (items.length === 0) warnings.push("El catálogo está vacío: la portada sale sin foto.");
    const first = items.find((x) => x.photoUrl)?.photoUrl ?? null;
    let effective = first;
    if (propertyId) {
      const it = items.find((x) => x.propertyId === propertyId);
      const photos = photosOf(propertyId);
      if (!it) warnings.push("La vivienda elegida para la portada ya no está en el catálogo: se usa la primera vivienda con foto.");
      else if (photos.length === 0) warnings.push("La vivienda elegida no tiene fotos: se usa la primera vivienda con foto.");
      else {
        const ph = photos.find((x) => x.id === photoId);
        if (photoId && !ph) warnings.push("La foto elegida ya no existe: se usa la foto de portada de esa vivienda.");
        effective = (ph ?? photos[0]).url;
      }
    }
    return { chosenPropertyId: propertyId, chosenPhotoId: photoId, effectivePhotoUrl: effective, warnings };
  };
  /** Recalcula la lista efectiva, los ajustes y la portada. */
  const refresh = (patch: Partial<CatalogDetail> = {}) =>
    setCat((c0) => {
      const c = { ...c0, ...patch };
      const a = c.mode === "auto" ? autoItems(c.criteria) : null;
      const items = a ? a.items : manualRef.current;
      return { ...c, items, autoTotal: a ? a.total : null, autoMatched: a ? a.matched : null, adjustments: adjustmentsOf(c.criteria), cover: coverOf(items) };
    });
  let n = 0;
  const actions: CatalogManagerActions = {
    updateMeta: ({ title, skipNotify }) => live({ op: "title", title: `${title} · ${++n}`, skipNotify }),
    removeProperty: ({ skipNotify }) => live({ op: "remove", key: "__first__", skipNotify }),
    reorder: ({ skipNotify }) => live({ op: "reorder", skipNotify }),
    setStatus: async () => ({ ok: true as const, version: 1 }),
    // Validación mínima de prueba (la real es del servidor y de SQL).
    setContact: async ({ name, phone, role, skipNotify }) => {
      const digits = phone.replace(/[^\d+]/g, "");
      if (name.trim().length < 2) return { ok: false as const, error: "El nombre del asesor tiene que tener entre 2 y 80 caracteres, sin correos, webs ni teléfonos." };
      if (!/^(\+[1-9]\d{7,14}|[6789]\d{8})$/.test(digits)) return { ok: false as const, error: "El teléfono no es válido. Escríbelo con prefijo (+34 600 000 000) o como móvil español." };
      const e164 = digits.startsWith("+") ? digits : `+34${digits}`;
      return live({ op: "contact", name: name.trim(), phone: e164, role, skipNotify });
    },
    addPropertyById: async ({ propertyId, skipNotify }) => {
      const p = byId.get(propertyId);
      if (p) manualRef.current = [...manualRef.current, fixtureView(p)];
      return live({ op: "add", title: p?.title ?? "Propiedad de prueba", skipNotify });
    },
    search: async ({ criteria, text, offset = 0 }) => {
      const n = normalizeCriteria(criteria);
      if (!n.ok) return invalid;
      const all = sortCandidates(candidates(fixtureProperties, n.criteria, { requirePhoto: false, text }), n.criteria, createdAt);
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
        refresh({ criteria: n.criteria });
        return changes ? live({ op: "reorder", skipNotify }) : unchanged();
      },
      previewAuto: async ({ criteria }) => {
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
      actions={actions}
      basePath="/dev-fixtures/mi-espacio"
      numberLabel="nº 01"
      onLocalAdd={onLocalAdd}
      share={liveToken ? { token: liveToken, expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString(), expired: false } : null}
      shareActions={shareActions}
      measureMode={measureMode}
      texts={fxTexts.views()}
      storyHref={() => "#historia-de-prueba"}
    />
  );
}
