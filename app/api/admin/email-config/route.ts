import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { encryptSecret } from "@/lib/crypto/secret";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const supabase = createAdminClient() as any;

    const { data, error } = await supabase
      .from("email_config")
      .select("*")
      .limit(1)
      .single();

    if (error || !data) {
      return Response.json({ config: null }, { status: 200 });
    }

    return Response.json({
      config: {
        id: data.id,
        awsRegion: data.aws_region,
        awsAccessKeyId: data.aws_access_key_id,
        hasSecretAccessKey: Boolean(data.aws_secret_access_key_encrypted),
        fromEmail: data.from_email,
        fromName: data.from_name,
      },
    });
  } catch (error) {
    console.error("Error fetching email config:", error);
    return Response.json(
      { error: "Failed to fetch config" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      awsRegion,
      awsAccessKeyId,
      awsSecretAccessKey,
      fromEmail,
      fromName,
    } = body;

    if (!awsRegion || !awsAccessKeyId || !fromEmail) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient() as any;

    // Check if config already exists
    const { data: existing } = await supabase
      .from("email_config")
      .select("id, aws_secret_access_key_encrypted")
      .limit(1)
      .single();

    // Secrets are only (re)written when a new value is provided, so leaving
    // the field blank keeps the previously stored secret.
    const row: Record<string, unknown> = {
      aws_region: awsRegion,
      aws_access_key_id: awsAccessKeyId,
      from_email: fromEmail,
      from_name: fromName || "SmartBC",
    };

    if (awsSecretAccessKey) {
      const { encrypted, iv } = encryptSecret(awsSecretAccessKey);
      row.aws_secret_access_key_encrypted = encrypted;
      row.aws_secret_access_key_iv = iv;
    } else if (!existing?.aws_secret_access_key_encrypted) {
      return Response.json(
        { error: "AWS Secret Access Key is required" },
        { status: 400 }
      );
    }

    if (existing) {
      const { error } = await supabase
        .from("email_config")
        .update(row)
        .eq("id", existing.id);

      if (error) {
        console.error("Error updating email config:", error);
        return Response.json(
          { error: "Failed to update config" },
          { status: 500 }
        );
      }
    } else {
      const { error } = await supabase.from("email_config").insert(row);

      if (error) {
        console.error("Error creating email config:", error);
        return Response.json(
          { error: "Failed to create config" },
          { status: 500 }
        );
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Error handling email config:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
