import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";
import { createClient } from "@/lib/db/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { isStaffRole } from "@/lib/permissions";
import type { AdminUser } from "@/lib/types";

const ROLE_KEY_MAP: Record<string, string> = {
  owner:        "admin.role",
  admin:        "admin.role",
  advisor:      "admin.role.advisor",
  agent_junior: "admin.role.agent_junior",
  agent_senior: "admin.role.agent_senior",
  agent_admin:  "admin.role.agent_admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isStaffRole(profile.role)) redirect("/inicio");

  const adminUser = profileToAdminUser(profile.full_name, profile.email, profile.role);

  // Obtener visitas pendientes para el badge del sidebar
  const supabase = await createClient();
  const { count: pendingVisits } = await supabase
    .from("visit_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <div className="relative min-h-screen bg-cream-50">
      {/* Soft warm background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(135deg,#fbf8f3_0%,#f1e9d6_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -left-40 -top-40 z-0 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,235,190,0.45),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -right-32 bottom-0 z-0 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(201,169,110,0.20),transparent_70%)] blur-3xl"
      />

      <div className="relative z-10">
        <AdminSidebar user={adminUser} currentRole={profile.role} pendingVisits={pendingVisits ?? 0} />
        <main className="ml-[260px] min-h-screen">{children}</main>
      </div>
    </div>
  );
}

function profileToAdminUser(
  fullName: string | null,
  email: string,
  role: string,
): AdminUser {
  const display = fullName?.trim() || email;
  const parts = display.split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");
  const initials = (
    (firstName[0] ?? "") + (lastName[0] ?? firstName[1] ?? "")
  ).toUpperCase() || display.slice(0, 2).toUpperCase();
  return {
    firstName,
    lastName,
    initials,
    roleKey: ROLE_KEY_MAP[role] ?? "admin.role.advisor",
  };
}
