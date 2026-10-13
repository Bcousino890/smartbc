"use client";

import { CatalogManager, type CatalogManagerActions } from "@/components/admin/catalogs/catalog-manager";
import type { ShareActions } from "@/components/admin/catalogs/share-panel";
import { parsePropertyRef, refErrorMessage } from "@/lib/catalogs/ref";
import { parseShareDays } from "@/lib/catalogs/share";
import type { CatalogDetail, CatalogItemView } from "@/lib/catalogs/types";

// SOLO DESARROLLO LOCAL (BCP-01, E7): acciones falsas, para revisar el gestor
// sin base de datos ni sistemas reales. Reproducen los mismos mensajes de
// validación que las acciones reales. Con `liveToken` (fase 2), cada guardado
// cambia además el almacén sintético del lector (/dev-fixtures/api/catalogo)
// y devuelve su huella nueva: así se prueba la medición de D13 de punta a
// punta en local (medición SINTÉTICA, no demuestra nada del entorno real).

async function mutate(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch("/dev-fixtures/api/catalogo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => null);
  return d?.fingerprint ?? null;
}

export function FixtureCatalogManager({
  catalog,
  liveToken = null,
  measureMode = false,
}: {
  catalog: CatalogDetail;
  liveToken?: string | null;
  measureMode?: boolean;
}) {
  const live = async (body: Record<string, unknown>) =>
    ({ ok: true as const, version: 1, fingerprint: liveToken ? await mutate({ token: liveToken, ...body }) : null });
  let n = 0;
  const actions: CatalogManagerActions = {
    updateMeta: ({ title }) => live({ op: "title", title: `${title} · ${++n}` }),
    removeProperty: () => live({ op: "remove", key: "__first__" }),
    reorder: () => live({ op: "reorder" }),
    setStatus: async () => ({ ok: true as const, version: 1 }),
    addProperty: async ({ reference }) => {
      const ref = parsePropertyRef(reference);
      if (ref.kind === "invalid") return { ok: false as const, error: refErrorMessage(ref.reason) };
      return live({ op: "add", title: `Propiedad de prueba ${ref.kind === "bc" ? ref.reference : ref.slug}` });
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
      catalog={catalog}
      actions={actions}
      preparedBy="Fabricio Andree"
      basePath="/dev-fixtures/mi-espacio"
      numberLabel="nº 01"
      onLocalAdd={onLocalAdd}
      share={liveToken ? { token: liveToken, expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString(), expired: false } : null}
      shareActions={shareActions}
      measureMode={measureMode}
    />
  );
}
