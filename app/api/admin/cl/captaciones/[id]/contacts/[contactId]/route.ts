import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { normalizePhone, isValidPhoneChile } from "@/lib/phone-utils";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const { id, contactId } = await params;
  try {
    const body = await request.json();
    const { contact_type, contact_name, phone, email, has_whatsapp, relationship } = body;

    // Validaciones
    if (contact_type && !["owner", "spouse", "family", "neighbor", "other"].includes(contact_type)) {
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
    let normalizedPhone = phone;
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
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (contact_type !== undefined) updateData.contact_type = contact_type;
    if (contact_name !== undefined) updateData.contact_name = contact_name;
    if (phone !== undefined) updateData.phone = normalizedPhone;
    if (email !== undefined) updateData.email = email;
    if (has_whatsapp !== undefined) updateData.has_whatsapp = has_whatsapp;
    if (relationship !== undefined) updateData.relationship = relationship;

    const { data, error } = await db
      .from("captacion_contacts")
      .update(updateData)
      .eq("id", contactId)
      .eq("captacion_id", id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "Contacto no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("PUT /contacts/[contactId] error:", error);
    return NextResponse.json(
      { error: "Error al actualizar contacto" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const { id, contactId } = await params;
  try {
    const db = createAdminClient() as any;
    const { error } = await db
      .from("captacion_contacts")
      .delete()
      .eq("id", contactId)
      .eq("captacion_id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /contacts/[contactId] error:", error);
    return NextResponse.json(
      { error: "Error al eliminar contacto" },
      { status: 500 }
    );
  }
}
