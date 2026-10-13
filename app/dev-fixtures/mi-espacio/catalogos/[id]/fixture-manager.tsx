"use client";

import { CatalogManager, type CatalogManagerActions } from "@/components/admin/catalogs/catalog-manager";
import { parsePropertyRef, refErrorMessage } from "@/lib/catalogs/ref";
import type { CatalogDetail, CatalogItemView } from "@/lib/catalogs/types";

// SOLO DESARROLLO LOCAL (BCP-01, E7): acciones falsas en memoria, para revisar
// el gestor sin base de datos ni sistemas reales. Reproducen los mismos
// mensajes de validación que las acciones reales.
const ok = async () => ({ ok: true as const, version: 1 });

export function FixtureCatalogManager({ catalog }: { catalog: CatalogDetail }) {
  const actions: CatalogManagerActions = {
    updateMeta: ok,
    removeProperty: ok,
    reorder: ok,
    setStatus: ok,
    addProperty: async ({ reference }) => {
      const ref = parsePropertyRef(reference);
      if (ref.kind === "invalid") return { ok: false as const, error: refErrorMessage(ref.reason) };
      return { ok: true as const, version: 1 };
    },
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
    />
  );
}
