"use client";

import { CatalogManager, type CatalogManagerActions } from "@/components/admin/catalogs/catalog-manager";
import type { ShareActions } from "@/components/admin/catalogs/share-panel";
import { parsePropertyRef, refErrorMessage } from "@/lib/catalogs/ref";
import { parseShareDays } from "@/lib/catalogs/share";
import { useRef, useState } from "react";
import type { CatalogDetail, CatalogItemView } from "@/lib/catalogs/types";
import { normalizeCriteria, type CatalogCriteria } from "@/lib/catalogs/criteria";
import { autoSelect, candidates, sortCandidates } from "@/lib/catalogs/selection";
import { fixtureProperties, fixtureSavedListings, fixtureView } from "@/lib/catalogs/fixtures-selection";
import { parseIdealistaAdCode } from "@/lib/catalogs/ads";

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
  const autoItems = (c: CatalogCriteria) => {
    const r = autoSelect(fixtureProperties, c);
    return { items: r.ids.map((id, i) => fixtureView(byId.get(id)!, (i + 1) * 100)), total: r.total };
  };
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
      const inCat = new Set(manualRef.current.map((x) => x.propertyId));
      return {
        ok: true as const,
        total: all.length,
        items: all.slice(offset, offset + 20).map((x) => ({ ...fixtureView(byId.get(x.id)!), inCatalog: inCat.has(x.id) })),
      };
    },
    selection: {
      setCriteria: async ({ criteria }) => {
        const n = normalizeCriteria(criteria);
        if (!n.ok) return invalid;
        setCat((c) => {
          if (c.mode !== "auto") return { ...c, criteria: n.criteria };
          const a = autoItems(n.criteria);
          return { ...c, criteria: n.criteria, items: a.items, autoTotal: a.total };
        });
        return unchanged();
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
        if (mode === "auto") {
          const a = autoItems(cat.criteria);
          setCat((c) => ({ ...c, mode: "auto", items: a.items, autoTotal: a.total, manualCount: manualRef.current.length }));
        } else {
          if (strategy === "convert") manualRef.current = autoItems(cat.criteria).items;
          setCat((c) => ({ ...c, mode: "manual", items: manualRef.current, autoTotal: null, manualCount: manualRef.current.length }));
        }
        return unchanged();
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
    />
  );
}
