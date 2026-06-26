import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { unpublishPropertyFromML } from "@/lib/sync/portalinmobiliario/ml-publisher";
import { getCurrentProfile } from "@/lib/db/queries/session";

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userCountry = (profile as any).country ?? "es";
    if (userCountry !== "cl") {
      return NextResponse.json(
        { error: "Solo usuarios Chile pueden gestionar PortalInmobiliario" },
        { status: 403 }
      );
    }

    const { propertyId } = await request.json();
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const db = createAdminClient() as any;

    const { data: property, error } = await db
      .from("properties")
      .select("id, portalinmobiliario_id, portalinmobiliario_sync_status")
      .eq("id", propertyId)
      .eq("country", "cl")
      .maybeSingle();

    if (error || !property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    if (!property.portalinmobiliario_id) {
      return NextResponse.json(
        { error: "Esta propiedad no está publicada en PortalInmobiliario" },
        { status: 400 }
      );
    }

    const result = await unpublishPropertyFromML(property.portalinmobiliario_id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await db
      .from("properties")
      .update({ portalinmobiliario_sync_status: "archived" })
      .eq("id", propertyId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[unpublish-from-portalinmobiliario]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
