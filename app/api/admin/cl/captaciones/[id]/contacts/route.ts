import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { normalizePhone, isValidPhoneChile } from "@/lib/phone-utils";

function normalizePhoneList(phones: unknown): string[] {
  if (!Array.isArray(phones)) return [];
  const result: string[] = [];
  for (const p of phones) {
    if (typeof p !== "string" || !p.trim()) continue;
    const n = normalizePhone(p);
    if (!isValidPhoneChile(n)) continue;
    result.push(n);
  }
  return result;
}

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
    const { contact_type, contact_name, phone, email, has_whatsapp, relationship, extra_phones } = body;

    if (!contact_type || !["owner", "spouse", "family", "neighbor", "other"].includes(contact_type)) {
      return NextResponse.json(
        { error: "contact_type inválido" },
        { status: 400 }
      );
    }

    let normalizedPhone = null;
    if (phone) {
      const n = normalizePhone(phone);
      if (!isValidPhoneChile(n)) {
        return NextResponse.json(
          { error: "Teléfono inválido. Debe ser un número chileno válido." },
          { status: 400 }
        );
      }
      normalizedPhone = n;
    }

    const normalizedExtras = normalizePhoneList(extra_phones);

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("captacion_contacts")
      .insert({
        captacion_id: id,
        contact_type,
        contact_name: contact_name || null,
        phone: normalizedPhone,
        extra_phones: normalizedExtras,
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
