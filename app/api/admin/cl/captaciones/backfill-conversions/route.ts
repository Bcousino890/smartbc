import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

const BUCKET = "properties-photos";
const MARKER = "/properties-photos/";

// Descarga una URL externa y la sube al bucket bajo la carpeta de la propiedad.
// Devuelve la URL pública permanente o null si falla.
async function rehost(
  db: any,
  propertyId: string,
  sourceUrl: string,
  index: number
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartBC/1.0)" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const buffer = await res.arrayBuffer();
    const path = `${propertyId}/${Date.now()}-rehost-${index}.${ext}`;
    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (upErr) return null;
    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Repara las propiedades ya convertidas desde captaciones ANTES de los últimos
// arreglos: (1) vuelca los datos del dueño / notas / subzona / tipo que no se
// copiaban, y (2) re-hospeda en el bucket las fotos que quedaron como URLs
// externas del portal (que se rompen). Es idempotente: no pisa datos que el
// agente ya editó ni re-sube fotos que ya están en el bucket.
export async function POST() {
  try {
    const profile = await getCurrentProfile();
    const isAdmin =
      profile &&
      ["admin", "agent_admin", "owner"].includes(profile.role);
    if (!isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const db = createAdminClient() as any;

    const { data: captaciones } = await db
      .from("captaciones")
      .select(
        "id, converted_to_property_id, owner_name, owner_phone, owner_contact, notes, subzone, property_type, operation"
      )
      .not("converted_to_property_id", "is", null);

    let propertiesScanned = 0;
    let ownerUpdated = 0;
    let photosRehosted = 0;
    const errors: string[] = [];

    for (const cap of (captaciones || []) as any[]) {
      const propId = cap.converted_to_property_id;
      if (!propId) continue;

      const { data: prop } = await db
        .from("properties")
        .select(
          "id, owner_name, owner_phone, owner_email, internal_notes, subzone, property_type, cover_photo_url"
        )
        .eq("id", propId)
        .maybeSingle();
      if (!prop) continue;
      propertiesScanned++;

      // (1) Datos del dueño / ficha que faltaban: solo se rellenan si la
      // propiedad los tiene vacíos (no pisamos ediciones manuales).
      const patch: Record<string, unknown> = {};
      if (!prop.owner_name && cap.owner_name) patch.owner_name = cap.owner_name;
      if (!prop.owner_phone && cap.owner_phone) patch.owner_phone = cap.owner_phone;
      if (!prop.owner_email && cap.owner_contact) patch.owner_email = cap.owner_contact;
      if (!prop.internal_notes && cap.notes) patch.internal_notes = cap.notes;
      if (!prop.subzone && cap.subzone) patch.subzone = cap.subzone;
      if (!prop.property_type && cap.property_type)
        patch.property_type = cap.property_type;
      if (Object.keys(patch).length > 0) {
        await db.from("properties").update(patch).eq("id", propId);
        ownerUpdated++;
      }

      // (2) Fotos externas → re-hospedar en el bucket.
      const { data: photos } = await db
        .from("property_photos")
        .select("id, url, position, is_cover")
        .eq("property_id", propId)
        .order("position", { ascending: true });

      let newCover: string | null = null;
      for (let i = 0; i < (photos || []).length; i++) {
        const ph = (photos as any[])[i];
        if (typeof ph.url === "string" && ph.url.includes(MARKER)) continue; // ya persistida
        const publicUrl = await rehost(db, propId, ph.url, i);
        if (!publicUrl) continue;
        await db
          .from("property_photos")
          .update({ url: publicUrl })
          .eq("id", ph.id);
        photosRehosted++;
        if (ph.is_cover || i === 0) newCover = newCover ?? publicUrl;
      }

      // Portada: si era externa (o coincidía con una foto re-hospedada), la
      // apuntamos a la nueva copia.
      if (
        newCover &&
        (!prop.cover_photo_url || !prop.cover_photo_url.includes(MARKER))
      ) {
        await db
          .from("properties")
          .update({ cover_photo_url: newCover })
          .eq("id", propId);
      }
    }

    return NextResponse.json({
      success: true,
      propertiesScanned,
      ownerUpdated,
      photosRehosted,
      errors,
    });
  } catch (err) {
    console.error("[captaciones backfill-conversions]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en el backfill" },
      { status: 500 }
    );
  }
}
