import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { scrapeCaptacionUrl } from "@/lib/sync/portalinmobiliario/scraper-captacion";
import { persistCaptacionPhotos } from "@/lib/captaciones/persist-photos";
import { canAccess } from "@/lib/permissions";
import { getDefaultPipeline, getStagesForPipeline } from "@/lib/captaciones/pipeline";

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Verificar permiso oficial: ¿tiene "create" en captaciones?
    if (!canAccess(profile.role, "captaciones", "create")) {
      return NextResponse.json(
        { error: "No tienes permisos para crear captaciones" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const db = createAdminClient() as any;

    // Pipeline de la captación nueva: el que venga en el body (si el agente
    // eligió uno en el selector) o el pipeline default del país.
    let pipelineId: string | null = null;
    let draftStageId: string | null = null;
    if (body.pipeline_id) {
      const stages = await getStagesForPipeline(body.pipeline_id).catch(() => []);
      const draftStage = stages.find((s) => s.stage_type === "draft");
      if (draftStage) {
        pipelineId = body.pipeline_id;
        draftStageId = draftStage.id;
      }
    }
    if (!pipelineId) {
      const defaultPipeline = await getDefaultPipeline("cl").catch(() => null);
      if (defaultPipeline) {
        pipelineId = defaultPipeline.pipeline.id;
        draftStageId = defaultPipeline.stages.find((s) => s.stage_type === "draft")?.id ?? null;
      }
    }

    // Create the captacion first (with whatever data the agent provided)
    const { data: captacion, error } = await db
      .from("captaciones")
      .insert({
        country: "cl",
        created_by: profile.id,
        source_url: body.source_url,
        source_site: body.source_site || null,
        title: body.title || null,
        price: body.price || null,
        currency: body.currency || "clp",
        bedrooms: body.bedrooms || null,
        bathrooms: body.bathrooms || null,
        square_meters: body.square_meters || null,
        cover_photo_url: body.cover_photo_url || null,
        region: body.region || null,
        commune: body.commune || null,
        zone: body.zone || null,
        notes: body.notes || null,
        status: "draft",
        pipeline_id: pipelineId,
        stage_id: draftStageId,
        scrape_status: "pending",
      })
      .select()
      .single();

    if (error) throw error;

    // Auto-scrape in background (fire-and-forget, don't block response)
    if (body.source_url) {
      scrapeAndUpdate(captacion.id, body.source_url).catch((e) =>
        console.error("[captacion scrape bg]", e)
      );
    }

    return NextResponse.json(captacion);
  } catch (err) {
    console.error("[captaciones create]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear captación" },
      { status: 500 }
    );
  }
}

async function scrapeAndUpdate(captacionId: string, url: string) {
  const db = createAdminClient() as any;
  try {
    const scraped = await scrapeCaptacionUrl(url);

    await db
      .from("captaciones")
      .update({
        source_site: scraped.source_site,
        title: scraped.title || undefined,
        description: scraped.description,
        price: scraped.price || undefined,
        currency: scraped.currency || "clp",
        bedrooms: scraped.bedrooms || undefined,
        bathrooms: scraped.bathrooms || undefined,
        square_meters: scraped.square_meters || undefined,
        useful_square_meters: scraped.useful_square_meters || undefined,
        region: scraped.region || undefined,
        commune: scraped.commune || undefined,
        zone: scraped.zone || undefined,
        address_scraped: scraped.address_scraped,
        latitude: scraped.latitude,
        longitude: scraped.longitude,
        cover_photo_url: scraped.cover_photo_url || undefined,
        features: scraped.features,
        broker_name: scraped.broker_name,
        external_reference: scraped.external_reference,
        operation: scraped.operation,
        portal_publication_number: scraped.portal_publication_number,
        published_ago: scraped.published_ago,
        scrape_status: "scraped",
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", captacionId);

    if (scraped.photo_urls.length > 0) {
      // Descarga y persiste las fotos en el bucket para que no dependan de las
      // URLs externas del portal (que vencen). Guarda la copia permanente.
      const rows = await persistCaptacionPhotos(
        captacionId,
        scraped.photo_urls.slice(0, 30),
        db
      );
      await db.from("captacion_photos").insert(rows);
      // Portada = copia persistida de la primera foto.
      if (rows[0]?.url) {
        await db
          .from("captaciones")
          .update({ cover_photo_url: rows[0].url })
          .eq("id", captacionId);
      }
    }
  } catch (err) {
    await db
      .from("captaciones")
      .update({
        scrape_status: "failed",
        scrape_error: err instanceof Error ? err.message : String(err),
      })
      .eq("id", captacionId);
  }
}
