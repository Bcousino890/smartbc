import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { normalizePhone, isValidPhoneChile } from "@/lib/phone-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("captacion_contacts")
      .select("*")
      .eq("captacion_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /contacts error:", error);
    return NextResponse.json(
      { error: "Error al obtener contactos" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { contact_type, contact_name, phone, email, has_whatsapp, relationship } = body;

    // Validaciones
    if (!contact_type || !["owner", "spouse", "family", "other"].includes(contact_type)) {
      return NextResponse.json(
        { error: "contact_type inválido" },
        { status: 400 }
      );
    }

    if (phone && !isValidPhoneChile(phone)) {
      return NextResponse.json(
        { error: "Teléfono inválido. Debe ser un número chileno válido." },
        { status: 400 }
      );
    }

    // Normalizar teléfono si viene
    let normalizedPhone = null;
    if (phone) {
      normalizedPhone = normalizePhone(phone);
      if (!isValidPhoneChile(normalizedPhone)) {
        return NextResponse.json(
          { error: "Teléfono no pudo ser normalizado" },
          { status: 400 }
        );
      }
    }

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("captacion_contacts")
      .insert({
        captacion_id: id,
        contact_type,
        contact_name: contact_name || null,
        phone: normalizedPhone,
        email: email || null,
        has_whatsapp: has_whatsapp || false,
        relationship: relationship || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("POST /contacts error:", error);
    return NextResponse.json(
      { error: "Error al crear contacto" },
      { status: 500 }
    );
  }
}
