import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { verifyResetToken, markTokenAsUsed } from "@/lib/email/password-reset";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return Response.json(
        { error: "Token and password are required" },
        { status: 400 }
      );
    }

    // Verify the token
    const userId = await verifyResetToken(token);

    if (!userId) {
      return Response.json(
        { error: "Invalid or expired reset token" },
        { status: 400 }
      );
    }

    // Use service role client to update auth user password
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    );

    // Update the auth user password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      { password }
    );

    if (updateError) {
      console.error("Error updating password:", updateError);
      return Response.json(
        { error: "Error updating password" },
        { status: 500 }
      );
    }

    // Mark token as used
    await markTokenAsUsed(token);

    return Response.json(
      { ok: true, message: "Password reset successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Reset password error:", error);
    return Response.json(
      { error: "Error resetting password" },
      { status: 500 }
    );
  }
}
