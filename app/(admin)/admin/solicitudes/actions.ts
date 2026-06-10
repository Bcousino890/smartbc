"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";

export async function updateVisitStatus(
  id: string,
  status: "confirmed" | "cancelled" | "completed",
) {
  const supabase = createAdminClient() as any;
  const { error } = await supabase
    .from("visit_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("updateVisitStatus error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/solicitudes");
  return { ok: true };
}
