"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";

export async function updateVisitStatus(
  id: string,
  status: "confirmed" | "cancelled" | "completed"
) {
  const db = createAdminClient() as any;
  const { error } = await db
    .from("visit_requests")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/solicitudes");
  return { ok: true };
}
