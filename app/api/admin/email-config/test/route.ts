import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { createSesTransport } from "@/lib/email/send-email";
import { decryptSecret } from "@/lib/crypto/secret";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { awsRegion, awsAccessKeyId, awsSecretAccessKey } = body;

    // If no secret provided, fetch from DB
    let secretAccessKey = awsSecretAccessKey;
    if (!secretAccessKey) {
      const supabase = createAdminClient() as any;
      const { data } = await supabase
        .from("email_config")
        .select("*")
        .limit(1)
        .single();

      if (data) {
        secretAccessKey = decryptSecret(
          data.aws_secret_access_key_encrypted,
          data.aws_secret_access_key_iv
        );
      }
    }

    if (!secretAccessKey) {
      return Response.json(
        { error: "No secret access key provided or stored" },
        { status: 400 }
      );
    }

    if (!awsRegion || !awsAccessKeyId) {
      return Response.json(
        { error: "Missing AWS region or access key ID" },
        { status: 400 }
      );
    }

    const transporter = createSesTransport(awsRegion, awsAccessKeyId, secretAccessKey);
    await transporter.verify();

    return Response.json({ ok: true, message: "Conexión con AWS SES exitosa" });
  } catch (error) {
    console.error("Error testing SES connection:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to connect" },
      { status: 400 }
    );
  }
}
