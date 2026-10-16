import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { isCatalogFixtureMode } from "../fixture-mode";
import { linkExportReaders } from "../public-data";
import type { InternalSnapshot } from "../to-public";
import type { CaptureDeps } from "./capture";

// ============================================================================
// PDF del catálogo · lectores de cada ámbito (dos autorizaciones separadas):
//   · dueño: está en home_owners Y el catálogo es suyo (también archivado o
//     sin enlace, P4). La instantánea se lee directamente (no por el enlace).
//   · enlace: el mismo camino que el estado público (P5): enlace válido y
//     catálogo disponible, o nada.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

export type ExportScope = { kind: "owner"; ownerId: string; catalogId: string } | { kind: "link"; token: string };

export function scopeKey(s: ExportScope): string {
  return s.kind === "owner" ? `dueño:${s.ownerId}:${s.catalogId}` : `enlace:${s.token}`;
}

export function exportReaders(scope: ExportScope): CaptureDeps<InternalSnapshot> {
  if (scope.kind === "link") return linkExportReaders(scope.token);
  if (isCatalogFixtureMode()) return fixtureOwnerReaders(scope.catalogId);
  const { ownerId, catalogId } = scope;
  return {
    checkAccess: async () => {
      const { isHomeOwner } = await import("../owner");
      if (!(await isHomeOwner(ownerId))) return false;
      const { data } = await db().from("catalogs").select("id").eq("id", catalogId).eq("owner_id", ownerId).maybeSingle();
      return !!data;
    },
    readMeta: async () => {
      const { data, error } = await db().from("catalogs").select("version, criteria").eq("id", catalogId).eq("owner_id", ownerId).maybeSingle();
      if (error) throw new Error(`catalogs: ${error.message}`);
      return data ? { version: Number(data.version), operation: data.criteria?.operation } : null;
    },
    readSnapshot: async () => {
      const { data, error } = await db().rpc("catalog_internal_snapshot", { p_catalog: catalogId });
      if (error) throw new Error(`catalog_internal_snapshot: ${error.message}`);
      return (data as InternalSnapshot | null) ?? null;
    },
  };
}

/** Desarrollo local: el catálogo de la gestión de prueba lee el almacén
 *  sintético de su enlace, aunque esté revocado, caducado o archivado (el
 *  dueño puede descargarlo igual, P4). */
function fixtureOwnerReaders(catalogId: string): CaptureDeps<InternalSnapshot> {
  return {
    checkAccess: async () => (await import("../fixture-store")).fixtureOwnerToken(catalogId) !== null,
    readMeta: async () => {
      const fx = await import("../fixture-store");
      const t = fx.fixtureOwnerToken(catalogId);
      return t ? ((await fx.fixtureGetMetas([t])).get(t) ?? null) : null;
    },
    readSnapshot: async () => {
      const fx = await import("../fixture-store");
      const t = fx.fixtureOwnerToken(catalogId);
      return t ? fx.fixtureOwnerSnapshot(t) : null;
    },
  };
}
