import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/guard";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Gate de autorización: operar sobre una captación requiere captaciones/edit.
  const gate = await requirePermission("captaciones", "edit");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  try {
    const body = await request.json();
    const { phone } = body;

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { error: "Teléfono inválido" },
        { status: 400 }
      );
    }

    // TODO: Integrar con Twilio WhatsApp API o similar
    // Por ahora, solo marcamos como "unknown" — UI permite al usuario seleccionar manualmente
    //
    // Ejemplo de integración futura:
    // import { verifyWhatsApp } from "@/lib/whatsapp";
    // const hasWhatsApp = await verifyWhatsApp(phone);
    // return NextResponse.json({ has_whatsapp: hasWhatsApp });

    return NextResponse.json({
      has_whatsapp: false,
      status: "unknown",
      message: "Verificación manual disponible",
    });
  } catch (error) {
    console.error("check-whatsapp error:", error);
    return NextResponse.json(
      { error: "Error al verificar WhatsApp" },
      { status: 500 }
    );
  }
}
