import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { createPasswordResetToken, sendPasswordResetEmail } from "@/lib/email/password-reset";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return Response.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    // Find user by email
    const { data: user, error: userError } = await db
      .from("profiles")
      .select("id, full_name, email")
      .eq("email", email)
      .single();

    if (userError || !user) {
      // Don't reveal whether the email exists (security)
      return Response.json(
        { ok: true, message: "If the email exists, you will receive a password reset link" },
        { status: 200 }
      );
    }

    // Create reset token
    const tokenData = await createPasswordResetToken(user.id, 24);

    if (!tokenData) {
      return Response.json(
        { error: "Error creating reset token" },
        { status: 500 }
      );
    }

    // Build reset URL (adjust domain as needed)
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3137"}/auth/reset-password?token=${tokenData.token}`;

    // Send email
    const emailResult = await sendPasswordResetEmail(
      user.email,
      user.full_name || "Usuario",
      resetUrl
    );

    if (!emailResult.success) {
      console.error("Failed to send password reset email:", emailResult.error);
      // Don't expose email service errors to client
      return Response.json(
        { ok: true, message: "If the email exists, you will receive a password reset link" },
        { status: 200 }
      );
    }

    return Response.json(
      { ok: true, message: "If the email exists, you will receive a password reset link" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Forgot password error:", error);
    return Response.json(
      { error: "Error processing password reset request" },
      { status: 500 }
    );
  }
}
