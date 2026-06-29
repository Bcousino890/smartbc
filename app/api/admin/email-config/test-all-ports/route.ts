import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { createDecipheriv, scryptSync } from "crypto";

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || "default-insecure-key-change-this";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer');

function decryptPasswordFromIv(encrypted: string, iv: string): string {
  try {
    const [ciphertext, authTag] = encrypted.split(":");
    const key = scryptSync(ENCRYPTION_KEY, "salt", 32);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "hex")
    );

    decipher.setAuthTag(Buffer.from(authTag, "hex"));

    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt password");
  }
}

const PORTS_TO_TEST = [
  { port: 25, secure: false, name: "Puerto 25 (sin SSL)" },
  { port: 465, secure: true, name: "Puerto 465 (SSL)" },
  { port: 587, secure: false, name: "Puerto 587 (STARTTLS)" },
  { port: 2525, secure: false, name: "Puerto 2525 (sin SSL)" },
];

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { smtpServer, smtpUser, smtpPassword } = body;

    // If no password provided, fetch from DB
    let password = smtpPassword;
    if (!password) {
      const supabase = createAdminClient() as any;
      const { data } = await supabase
        .from("email_config")
        .select("*")
        .limit(1)
        .single();

      if (data) {
        password = decryptPasswordFromIv(
          data.smtp_password_encrypted,
          data.smtp_password_iv
        );
      }
    }

    if (!password) {
      return Response.json(
        { error: "No password provided or stored" },
        { status: 400 }
      );
    }

    if (!smtpServer || !smtpUser) {
      return Response.json(
        { error: "Missing SMTP server or user" },
        { status: 400 }
      );
    }

    // Test each port
    const results = [];
    for (const portConfig of PORTS_TO_TEST) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpServer,
          port: portConfig.port,
          secure: portConfig.secure,
          auth: {
            user: smtpUser,
            pass: password,
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        });

        await transporter.verify();

        results.push({
          port: portConfig.port,
          secure: portConfig.secure,
          name: portConfig.name,
          status: "success",
          error: null,
        });
      } catch (error) {
        results.push({
          port: portConfig.port,
          secure: portConfig.secure,
          name: portConfig.name,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successResults = results.filter((r) => r.status === "success");

    return Response.json({
      ok: successResults.length > 0,
      results,
      recommended: successResults.length > 0 ? successResults[0] : null,
      message:
        successResults.length > 0
          ? `✅ Puerto ${successResults[0].port} funciona: ${successResults[0].name}`
          : "❌ Ningún puerto funcionó. Contacta a Hetzner para desbloquear puertos SMTP salientes.",
    });
  } catch (error) {
    console.error("Error testing SMTP ports:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
