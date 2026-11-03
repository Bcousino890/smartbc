import "server-only";

// Las etiquetas RESERVADO / ALQUILADO / NO DISPONIBLE y el estado de la
// propiedad son lo mismo: si una cambia, la otra la sigue (ficha, lista y lote).

/* eslint-disable @typescript-eslint/no-explicit-any */
const STATUS_BY_TAG: Record<string, string> = {
  reservado: "reserved",
  alquilado: "rented",
  "no disponible": "unavailable",
};
const TAG_BY_STATUS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_BY_TAG).map(([tag, status]) => [status, tag]),
);
const key = (n: unknown) => (typeof n === "string" ? n.trim().toLowerCase() : "");

/** Tras añadir/quitar etiquetas: alinea el estado de las propiedades. */
export async function syncStatusFromReservedTag(
  db: any,
  propIds: string[],
  added: string[],
  removed: string[],
): Promise<void> {
  const touched = [...added, ...removed];
  if (propIds.length === 0 || touched.length === 0) return;
  const { data: tags } = await db.from("property_tags").select("id, name").in("id", touched);
  const statusOf = new Map<string, string>(
    (tags ?? []).filter((t: any) => STATUS_BY_TAG[key(t.name)]).map((t: any) => [t.id, STATUS_BY_TAG[key(t.name)]]),
  );
  const addedStatus = added.map((id) => statusOf.get(id)).find(Boolean);
  if (addedStatus) {
    await db.from("properties").update({ status: addedStatus }).in("id", propIds).in("status", ["available", ...Object.values(STATUS_BY_TAG)]);
    return;
  }
  for (const id of removed) {
    const status = statusOf.get(id);
    if (status) await db.from("properties").update({ status: "available" }).in("id", propIds).eq("status", status);
  }
}

/** Tras cambiar el estado: deja solo la etiqueta que le corresponde. */
export async function syncReservedTagFromStatus(
  db: any,
  propertyId: string,
  status: string,
): Promise<void> {
  const { data: prop } = await db.from("properties").select("country").eq("id", propertyId).maybeSingle();
  const { data: tags } = await db.from("property_tags").select("id, name, country");
  const ofCountry = (tags ?? []).filter((t: any) => t.country === (prop?.country ?? "es") && STATUS_BY_TAG[key(t.name)]);
  const wanted = TAG_BY_STATUS[status];
  for (const t of ofCountry) {
    if (key(t.name) === wanted) {
      await db
        .from("property_tag_links")
        .upsert({ property_id: propertyId, tag_id: t.id }, { onConflict: "property_id,tag_id", ignoreDuplicates: true });
    } else {
      await db.from("property_tag_links").delete().eq("property_id", propertyId).eq("tag_id", t.id);
    }
  }
}
