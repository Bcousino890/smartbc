import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { isPersistedLeadImage, persistIdealistaLeadImage } from "@/lib/services/idealista/persist-lead-image";

type StoredProperty = { title: string | null; price: string | null; type: string | null; imageUrl: string | null };

// Recorre los leads de Idealista ya capturados y re-aloja en el bucket las
// imágenes que todavía son hotlinks del CDN de idealista.com (se rompen si el
// anuncio se da de baja o caduca). Idempotente: solo toca las URLs que aún NO
// son una copia permanente nuestra, así que es seguro ejecutarlo varias veces
// (ej. tras capturar leads nuevos).
export async function POST() {
  try {
    const profile = await getCurrentProfile();
    const isAdmin = profile && ["admin", "agent_admin", "owner"].includes(profile.role);
    if (!isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const db = createAdminClient() as any;

    const { data: leads, error } = await db
      .from("idealista_leads")
      .select("id, conversation_id, property_image_url, properties");
    if (error) {
      console.error("[idealista-leads backfill-images] select", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let leadsScanned = 0;
    let coverImagesRehosted = 0;
    let propertyImagesRehosted = 0;
    let failed = 0;

    for (const lead of (leads ?? []) as any[]) {
      leadsScanned++;
      const patch: Record<string, unknown> = {};

      if (lead.property_image_url && !isPersistedLeadImage(lead.property_image_url)) {
        const persisted = await persistIdealistaLeadImage(
          db,
          lead.conversation_id,
          "cover",
          lead.property_image_url,
        );
        if (persisted) {
          patch.property_image_url = persisted.url;
          coverImagesRehosted++;
        } else {
          failed++;
        }
      }

      const properties = (lead.properties as StoredProperty[] | null) ?? [];
      let propertiesChanged = false;
      for (let i = 0; i < properties.length; i++) {
        const p = properties[i];
        if (p.imageUrl && !isPersistedLeadImage(p.imageUrl)) {
          const persisted = await persistIdealistaLeadImage(db, lead.conversation_id, `p${i}`, p.imageUrl);
          if (persisted) {
            p.imageUrl = persisted.url;
            propertiesChanged = true;
            propertyImagesRehosted++;
          } else {
            failed++;
          }
        }
      }
      if (propertiesChanged) patch.properties = properties;

      if (Object.keys(patch).length > 0) {
        await db.from("idealista_leads").update(patch).eq("id", lead.id);
      }
    }

    return NextResponse.json({
      success: true,
      leadsScanned,
      coverImagesRehosted,
      propertyImagesRehosted,
      failed,
    });
  } catch (err) {
    console.error("[idealista-leads backfill-images]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en el backfill" },
      { status: 500 },
    );
  }
}
