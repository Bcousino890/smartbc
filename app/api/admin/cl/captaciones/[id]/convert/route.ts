import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile || !["admin", "agent", "agent_admin", "agent_senior"].includes(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const db = createAdminClient() as any;

    const { data: cap, error: capErr } = await db
      .from("captaciones")
      .select("*")
      .eq("id", id)
      .single();

    if (capErr || !cap) {
      return NextResponse.json({ error: "Captación no encontrada" }, { status: 404 });
    }

    if (cap.converted_to_property_id) {
      return NextResponse.json(
        { error: "Esta captación ya fue convertida a propiedad", property_id: cap.converted_to_property_id },
        { status: 409 }
      );
    }

    // Generar slug único
    const baseTitle = cap.title || `Propiedad captada ${new Date().toLocaleDateString("es-CL")}`;
    const baseSlug = slugify(baseTitle) || "propiedad-captada";
    let slug = baseSlug;
    let attempt = 0;
    while (true) {
      const { data: existing } = await db.from("properties").select("id").eq("slug", slug).single();
      if (!existing) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    const zone = cap.commune || cap.zone || cap.region || "Sin zona";

    const { data: property, error: propErr } = await db
      .from("properties")
      .insert({
        source: "manual",
        slug,
        title: baseTitle,
        description: cap.description || null,
        operation: "sale",
        status: "draft",
        price: cap.price || 0,
        bedrooms: cap.bedrooms || 0,
        bathrooms: cap.bathrooms || 0,
        square_meters: cap.square_meters || null,
        zone,
        address: cap.address_real || cap.address_scraped || null,
        cover_photo_url: cap.cover_photo_url || null,
        captacion_id: id,
      })
      .select("id, slug")
      .single();

    if (propErr) throw propErr;

    // Copiar fotos
    const { data: captacionPhotos } = await db
      .from("captacion_photos")
      .select("url, position")
      .eq("captacion_id", id)
      .order("position");

    if (captacionPhotos && captacionPhotos.length > 0) {
      await db.from("property_photos").insert(
        captacionPhotos.map((p: { url: string; position: number }, i: number) => ({
          property_id: property.id,
          url: p.url,
          position: p.position,
          is_cover: i === 0,
        }))
      );
    }

    // Marcar captación como convertida
    await db.from("captaciones").update({
      status: "converted_to_property",
      converted_to_property_id: property.id,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({ property_id: property.id, slug: property.slug });
  } catch (err) {
    console.error("[captacion convert]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al convertir" },
      { status: 500 }
    );
  }
}
