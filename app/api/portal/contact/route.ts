import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, phone, countryInterest, subject, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("contact_requests").insert({
      name,
      email,
      phone: phone || null,
      country_interest: countryInterest || null,
      subject: subject || null,
      message,
    });

    if (error) {
      console.error("contact_requests insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("portal/contact error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
