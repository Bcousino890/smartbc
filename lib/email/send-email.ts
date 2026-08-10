import "server-only";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer');
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { createAdminClient } from "@/lib/db/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret";

export interface EmailConfig {
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKeyEncrypted: string;
  awsSecretAccessKeyIv: string;
  fromEmail: string;
  fromName?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export { encryptSecret, decryptSecret };

/**
 * Builds a nodemailer transporter backed by the AWS SES v3 SDK instead of
 * SMTP. Nodemailer's SES transport composes the MIME message the same way
 * the old SMTP transport did (attachments, HTML, etc. all keep working
 * unchanged) and calls SES's SendRawEmail API over HTTPS — no ports, no
 * STARTTLS negotiation, no SMTP AUTH quirks.
 */
export function createSesTransport(awsRegion: string, awsAccessKeyId: string, awsSecretAccessKey: string) {
  const sesClient = new SESClient({
    region: awsRegion,
    credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey },
  });
  return nodemailer.createTransport({ SES: { ses: sesClient, aws: { SendRawEmailCommand } } });
}

/**
 * Fetch email config from database, or fallback to environment variables
 */
export async function getEmailConfig(): Promise<EmailConfig | null> {
  try {
    const db = createAdminClient() as any;

    const { data } = await db
      .from("email_config")
      .select("*")
      .limit(1)
      .single();

    if (data) {
      return {
        awsRegion: data.aws_region,
        awsAccessKeyId: data.aws_access_key_id,
        awsSecretAccessKeyEncrypted: data.aws_secret_access_key_encrypted,
        awsSecretAccessKeyIv: data.aws_secret_access_key_iv,
        fromEmail: data.from_email,
        fromName: data.from_name,
      };
    }

    // Fallback: try environment variables (for local development / staging)
    const envRegion = process.env.AWS_SES_REGION;
    const envAccessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
    const envSecretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;
    const envFromEmail = process.env.FROM_EMAIL;

    if (envRegion && envAccessKeyId && envSecretAccessKey && envFromEmail) {
      console.log("[email] Using SES config from environment variables");
      return {
        awsRegion: envRegion,
        awsAccessKeyId: envAccessKeyId,
        awsSecretAccessKeyEncrypted: "", // Not encrypted from env
        awsSecretAccessKeyIv: "",
        fromEmail: envFromEmail,
        fromName: process.env.FROM_NAME || "SmartBC",
      };
    }

    console.warn("[email] No email config found in database or environment variables");
    return null;
  } catch (error) {
    console.error("Error fetching email config:", error);
    return null;
  }
}

/**
 * Send email using configured AWS SES credentials
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const config = await getEmailConfig();

    if (!config) {
      return {
        success: false,
        error: "Email config not configured",
      };
    }

    // Decrypt the secret access key (or use directly if from env vars)
    const secretAccessKey = config.awsSecretAccessKeyEncrypted
      ? decryptSecret(config.awsSecretAccessKeyEncrypted, config.awsSecretAccessKeyIv)
      : process.env.AWS_SES_SECRET_ACCESS_KEY || "";

    if (!secretAccessKey) {
      return {
        success: false,
        error: "No AWS secret access key available",
      };
    }

    const transporter = createSesTransport(config.awsRegion, config.awsAccessKeyId, secretAccessKey);

    // Send email
    const result = await transporter.sendMail({
      from: `${config.fromName || "SmartBC"} <${config.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
      attachments: options.attachments,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error("Error sending email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
