import { TrendingUp, Users, Home, Clock } from "lucide-react";
import { createAdminClient } from "@/lib/db/admin";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { StatCard } from "@/components/ui/stat-card";
import { DashboardActivity } from "./dashboard-activity";

export const dynamic = "force-dynamic";
export const revalidate = 30; // Revalidate every 30 seconds

export default async function DashboardPage() {
  const supabase = createAdminClient();

  // Fetch all data in parallel
  const [activParticulares, newParticulares7d, totalClients, pendingSolicitudes, recentActivity] = await Promise.all([
    // Total particulares activos
    supabase.from("particulares").select("id", { count: "exact", head: true }).eq("is_active", true),

    // Particulares nuevos en últimos 7 días
    supabase
      .from("particulares")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

    // Total clientes
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "client"),

    // Solicitudes pendientes este mes
    supabase
      .from("visit_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("requested_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

    // Actividad reciente (últimas 10)
    getRecentActivity(supabase),
  ]);

  // Fetch last week's count for trend calculation
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count: particulares7dAgoBefore } = await supabase
    .from("particulares")
    .select("id", { count: "exact", head: true })
    .gte("created_at", twoWeeksAgo)
    .lt("created_at", oneWeekAgo);

  const currentNew = newParticulares7d.count ?? 0;
  const previousNew = particulares7dAgoBefore ?? 0;
  const trend = previousNew > 0 ? Math.round(((currentNew - previousNew) / previousNew) * 100) : 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader titleKey="dashboard.title" subtitleKey="dashboard.subtitle" />

      {/* Stats Cards */}
      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Home size={20} strokeWidth={1.75} />}
          labelKey="dashboard.stats.activeListings"
          value={activParticulares.count ?? 0}
        />
        <StatCard
          icon={<TrendingUp size={20} strokeWidth={1.75} />}
          labelKey="dashboard.stats.newListings7d"
          value={newParticulares7d.count ?? 0}
          footer={
            trend !== 0 ? (
              <p className={`text-[11px] ${trend > 0 ? "text-green-600" : "text-red-600"}`}>
                {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}% vs última semana
              </p>
            ) : undefined
          }
        />
        <StatCard
          icon={<Users size={20} strokeWidth={1.75} />}
          labelKey="dashboard.stats.totalClients"
          value={totalClients.count ?? 0}
        />
        <StatCard
          icon={<Clock size={20} strokeWidth={1.75} />}
          labelKey="dashboard.stats.pendingRequests30d"
          value={pendingSolicitudes.count ?? 0}
        />
      </div>

      {/* Recent Activity */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-ink mb-4">Actividad Reciente</h2>
        <DashboardActivity activity={recentActivity} />
      </div>
    </div>
  );
}

async function getRecentActivity(supabase: any) {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch from 3 sources and combine
  const [particulares, visits, clients] = await Promise.all([
    supabase
      .from("particulares")
      .select("id, portal, external_id, created_at")
      .gte("created_at", oneWeekAgo)
      .order("created_at", { ascending: false })
      .limit(3),

    supabase
      .from("visit_requests")
      .select("id, property_id, requested_at, status")
      .gte("requested_at", oneWeekAgo)
      .order("requested_at", { ascending: false })
      .limit(3),

    supabase
      .from("profiles")
      .select("id, full_name, created_at")
      .eq("role", "client")
      .gte("created_at", oneWeekAgo)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const activity = [
    ...(particulares.data ?? []).map((p: any) => ({
      type: "particular",
      description: `Nuevo anuncio: ${p.portal} (${p.external_id})`,
      timestamp: p.created_at,
    })),
    ...(visits.data ?? []).map((v: any) => ({
      type: "visit",
      description: `Solicitud de visita (${v.status})`,
      timestamp: v.requested_at,
    })),
    ...(clients.data ?? []).map((c: any) => ({
      type: "client",
      description: `Nuevo cliente: ${c.full_name || "Sin nombre"}`,
      timestamp: c.created_at,
    })),
  ];

  return activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);
}
