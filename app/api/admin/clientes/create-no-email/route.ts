import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { randomBytes } from "crypto";

function generatePassword(length: number = 16): string {
  return randomBytes(length).toString("base64").slice(0, length);
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { firstName, lastName, email, phone } = body;

    if (!firstName || !lastName || !email) {
      return Response.json(
        { error: "firstName, lastName, and email are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient() as any;
    const tempPassword = generatePassword(16);

    // Create user with temporary password (no email invitation)
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm since no email is being sent
      user_metadata: {
        full_name: `${firstName} ${lastName}`,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
      },
    });

    if (createError || !data.user) {
      return Response.json(
        { error: createError?.message || "Error creating user" },
        { status: 400 }
      );
    }

    const clientId = data.user.id;

    // Update phone if provided
    if (phone) {
      await supabase
        .from("profiles")
        .update({ phone })
        .eq("id", clientId);
    }

    return Response.json({
      ok: true,
      clientId,
      email,
      password: tempPassword,
      message: `Cliente creado. Credenciales temporales: ${email} / ${tempPassword}`,
    });
  } catch (error) {
    console.error("Error creating client:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
