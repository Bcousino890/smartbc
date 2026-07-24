import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { getCaptacionEditPermissions } from "@/lib/db/queries/permissions";

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

    // Cualquier usuario con permiso para cambiar el estado de captaciones
    // (admin, agent_admin, agent_senior, owner…) puede convertir una
    // captación confirmada — no solo el creador original. Así un agente
    // senior puede convertir las captaciones confirmadas que ve, aunque las
    // haya creado otra persona.
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

    // La captación guarda la operación en español ('venta' | 'arriendo'); la
    // propiedad usa el enum en inglés ('sale' | 'rent'). Respetamos el arriendo
    // en vez de asumir venta siempre.
    const operation = captacion.operation === "arriendo" ? "rent" : "sale";

    // status 'archived' + archived_at null = "Borrador" en el admin (así lo
    // mapea lib/db/adapters). La ficha no sale al público hasta que el agente
    // la complete y la marque como disponible.
    //
    // Volcamos TODA la ficha de la captación en la propiedad: datos del inmueble,
    // ubicación, datos internos del dueño (owner_*) y notas internas, para que el
    // agente no tenga que re-tipear nada. Los campos owner_* / internal_notes son
    // siempre del admin y el motor de sindicación (diff-engine) nunca los pisa
    // (ver migración 0006).
    const { data: property, error: insertError } = await db
      .from("properties")
      .insert({
        title,
        slug,
        source: "manual",
        status: "archived",
        operation,
        operations: [operation],
        property_type: captacion.property_type ?? null,
        country: "cl",
        price: captacion.price ?? 0,
        currency: captacion.currency || "clp",
        bedrooms: captacion.bedrooms ?? 0,
        bathrooms: captacion.bathrooms ?? 0,
        square_meters: captacion.square_meters ?? null,
        zone: captacion.commune || captacion.zone || captacion.region || "Chile",
        subzone: captacion.subzone ?? null,
        address: captacion.address_real || captacion.address_scraped || null,
        commune: captacion.commune ?? null,
        region: captacion.region ?? null,
        latitude: captacion.latitude ?? null,
        longitude: captacion.longitude ?? null,
        description: captacion.description ?? null,
        cover_photo_url: captacion.cover_photo_url ?? null,
        source_url: captacion.source_url ?? null,
        // Datos internos del dueño (solo visibles para el equipo).
        owner_name: captacion.owner_name ?? null,
        owner_phone: captacion.owner_phone ?? null,
        owner_email: captacion.owner_contact ?? null,
        internal_notes: captacion.notes ?? null,
      })
      .select("id, slug")
      .single();

    if (insertError || !property) {
      return NextResponse.json(
        { error: insertError?.message ?? "No se pudo crear la propiedad" },
        { status: 500 }
      );
    }

    // Copiar las fotos de la captación a la propiedad. Las fotos de la captación
    // son URLs externas scrapeadas del portal: pueden vencer, estar protegidas
    // contra hotlinking y no rinden en la ficha de la propiedad. Por eso las
    // descargamos y las re-subimos al bucket `properties-photos` — igual que las
    // fotos que sube el agente a mano — para que queden permanentes y se muestren
    // bien. Si la descarga o subida de una foto falla, caemos a la URL original
    // para no perder la referencia (mismo comportamiento que antes).
    const { data: photos } = await db
      .from("captacion_photos")
      .select("url, storage_path, position")
      .eq("captacion_id", id)
      .order("position", { ascending: true });

    if (photos && photos.length > 0) {
      const rehosted: { url: string; position: number; is_cover: boolean }[] = [];

      for (let i = 0; i < photos.length; i++) {
        const p = photos[i] as {
          url: string;
          storage_path: string | null;
          position: number | null;
        };

        // Origen a descargar: la copia ya persistida en el bucket si existe,
        // si no la URL externa original scrapeada.
        let sourceUrl = p.url;
        if (p.storage_path) {
          const { data: sp } = db.storage
            .from("properties-photos")
            .getPublicUrl(p.storage_path);
          if (sp?.publicUrl) sourceUrl = sp.publicUrl;
        }

        let finalUrl = p.url; // fallback si la descarga/subida falla
        try {
          const res = await fetch(sourceUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartBC/1.0)" },
          });
          if (res.ok) {
            const contentType = res.headers.get("content-type") || "image/jpeg";
            const ext = contentType.includes("png")
              ? "png"
              : contentType.includes("webp")
                ? "webp"
                : "jpg";
            const buffer = await res.arrayBuffer();
            const path = `${property.id}/${Date.now()}-captacion-${i}.${ext}`;
            const { error: upErr } = await db.storage
              .from("properties-photos")
              .upload(path, buffer, { contentType, upsert: false });
            if (!upErr) {
              const { data: urlData } = db.storage
                .from("properties-photos")
                .getPublicUrl(path);
              if (urlData?.publicUrl) finalUrl = urlData.publicUrl;
            } else {
              console.error("[captaciones convert] photo upload error", upErr);
            }
          }
        } catch (e) {
          console.error("[captaciones convert] photo download failed", e);
        }

        rehosted.push({
          url: finalUrl,
          position: p.position ?? i,
          is_cover: i === 0,
        });
      }

      await db.from("property_photos").insert(
        rehosted.map((ph) => ({ property_id: property.id, ...ph }))
      );

      // La portada apunta a la primera foto ya re-hospedada (no a la URL
      // externa scrapeada, que no rendiría).
      const coverUrl = rehosted[0]?.url;
      if (coverUrl) {
        await db
          .from("properties")
          .update({ cover_photo_url: coverUrl })
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
