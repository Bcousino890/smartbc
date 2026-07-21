import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { getCaptacionEditPermissions } from "@/lib/db/queries/permissions";

const PHOTOS_BUCKET = "properties-photos";

// Re-aloja una foto scrapeada (CDN externo, ej. http2.mlstatic.com de
// MercadoLibre/PortalInmobiliario) en nuestro storage. Necesario porque:
//  - La galería de Propiedades usa next/image, que solo carga dominios en el
//    allowlist de next.config.ts — las fotos de captaciones quedaban en
//    blanco ahí (aunque sí se veían en Captaciones, que usa <img> normal).
//  - El anuncio de origen suele darse de baja poco después de confirmarse la
//    captación, así que depender de esa URL externa es frágil.
// Si falla la descarga/subida, se devuelve la URL original (mejor mostrarla
// sin re-alojar que perder la foto).
async function rehostCaptacionPhoto(
  db: ReturnType<typeof createAdminClient>,
  sourceUrl: string,
  captacionId: string,
  index: number,
): Promise<string> {
  try {
    const res = await fetch(sourceUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch_${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(buf, { failOn: "none" }).rotate().webp({ quality: 82 }).toBuffer();
    const path = `captaciones/${captacionId}/${index}.webp`;
    const { error: uploadError } = await db.storage
      .from(PHOTOS_BUCKET)
      .upload(path, webp, { contentType: "image/webp", upsert: true });
    if (uploadError) throw uploadError;
    const { data } = db.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error("[captaciones convert] no se pudo re-alojar foto:", sourceUrl, err);
    return sourceUrl;
  }
}

// Convierte una captación CONFIRMADA en una propiedad real del catálogo de
// Chile. Antes la transición confirmed → converted_to_property solo cambiaba
// el estado: nunca se creaba la propiedad ni se rellenaba
// converted_to_property_id, así que el flujo moría ahí y el agente tenía que
// re-tipear todo a mano.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const editPerms = getCaptacionEditPermissions(profile.role);
    const isAdmin = profile.role === "admin" || profile.role === "agent_admin";
    if (!isAdmin && !editPerms.fields.canEditStatus) {
      return NextResponse.json(
        { error: "No tienes permisos para convertir captaciones" },
        { status: 403 }
      );
    }

    const db = createAdminClient() as any;

    const { data: captacion, error: fetchError } = await db
      .from("captaciones")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !captacion) {
      return NextResponse.json({ error: "Captación no encontrada" }, { status: 404 });
    }

    if (!isAdmin && captacion.created_by !== profile.id) {
      return NextResponse.json(
        { error: "Solo el creador o un admin puede convertirla" },
        { status: 403 }
      );
    }

    let convertedStageId: string | null = null;
    if (captacion.stage_id) {
      const { data: currentStage } = await db
        .from("captacion_pipeline_stages")
        .select("stage_type, pipeline_id")
        .eq("id", captacion.stage_id)
        .single();
      if (currentStage?.stage_type !== "confirmed") {
        return NextResponse.json(
          { error: "Solo se pueden convertir captaciones en una etapa de tipo \"confirmada\"" },
          { status: 400 }
        );
      }
      const { data: convertedStage } = await db
        .from("captacion_pipeline_stages")
        .select("id")
        .eq("pipeline_id", currentStage.pipeline_id)
        .eq("stage_type", "converted")
        .limit(1)
        .maybeSingle();
      convertedStageId = convertedStage?.id ?? null;
    } else if (captacion.status !== "confirmed") {
      // Captación legada sin pipeline_id (no debería pasar tras la migración
      // 0078, pero por si acaso queda alguna sin backfillear)
      return NextResponse.json(
        { error: "Solo se pueden convertir captaciones confirmadas" },
        { status: 400 }
      );
    }
    if (captacion.converted_to_property_id) {
      return NextResponse.json(
        { error: "Esta captación ya fue convertida" },
        { status: 400 }
      );
    }

    const title: string = captacion.title || "Propiedad captada";
    const baseSlug =
      title
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "propiedad";
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

    // status 'archived' + archived_at null = "Borrador" en el admin (así lo
    // mapea lib/db/adapters). La ficha no sale al público hasta que el agente
    // la complete y la marque como disponible.
    const { data: property, error: insertError } = await db
      .from("properties")
      .insert({
        title,
        slug,
        source: "manual",
        status: "archived",
        operation: "sale",
        country: "cl",
        price: captacion.price ?? 0,
        currency: captacion.currency || "clp",
        bedrooms: captacion.bedrooms ?? 0,
        bathrooms: captacion.bathrooms ?? 0,
        square_meters: captacion.square_meters ?? null,
        zone: captacion.commune || captacion.zone || captacion.region || "Chile",
        address: captacion.address_real || captacion.address_scraped || null,
        commune: captacion.commune ?? null,
        region: captacion.region ?? null,
        latitude: captacion.latitude ?? null,
        longitude: captacion.longitude ?? null,
        description: captacion.description ?? null,
        cover_photo_url: captacion.cover_photo_url ?? null,
        source_url: captacion.source_url ?? null,
      })
      .select("id, slug")
      .single();

    if (insertError || !property) {
      return NextResponse.json(
        { error: insertError?.message ?? "No se pudo crear la propiedad" },
        { status: 500 }
      );
    }

    // Copiar fotos snapshot de la captación a la propiedad, re-alojándolas en
    // nuestro storage (ver rehostCaptacionPhoto).
    const { data: photos } = await db
      .from("captacion_photos")
      .select("url, position")
      .eq("captacion_id", id)
      .order("position", { ascending: true });

    if (photos && photos.length > 0) {
      const typedPhotos = photos as Array<{ url: string; position: number | null }>;
      const rehostedUrls = await Promise.all(
        typedPhotos.map((p, i) => rehostCaptacionPhoto(db, p.url, id, i)),
      );

      await db.from("property_photos").insert(
        rehostedUrls.map((url, i) => ({
          property_id: property.id,
          url,
          position: typedPhotos[i].position ?? i,
          is_cover: i === 0,
        }))
      );
      if (!captacion.cover_photo_url) {
        await db
          .from("properties")
          .update({ cover_photo_url: rehostedUrls[0] })
          .eq("id", property.id);
      }
    }

    await db
      .from("captaciones")
      .update({
        status: "converted_to_property",
        ...(convertedStageId ? { stage_id: convertedStageId } : {}),
        converted_to_property_id: property.id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await db.from("captacion_logs").insert({
      captacion_id: id,
      created_by: profile.id,
      attempt_type: "status_change",
      result: "converted_to_property",
      notes: `Convertida a propiedad ${property.slug}`,
    });

    await db.from("crm_notifications").insert({
      user_id: captacion.created_by,
      type: "captacion_converted",
      title: "🏠 Captación convertida",
      body: `${title} ya es una propiedad (borrador). Completa la ficha y publícala.`,
      link: `/cl/admin/propiedades/${property.slug}`,
      data: { captacion_id: id, property_id: property.id },
    });

    return NextResponse.json({
      success: true,
      propertyId: property.id,
      slug: property.slug,
    });
  } catch (err) {
    console.error("[captaciones convert]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al convertir" },
      { status: 500 }
    );
  }
}
