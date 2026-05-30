import { UserSearch, Home, Tag, Clock } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { StatCard } from "@/components/ui/stat-card";
import { createAdminClient } from "@/lib/db/admin";
import { ParticularesClient, type ParticularRow } from "./particulares-client";

export const dynamic = "force-dynamic";

export default async function AdminParticularesPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("particulares")
    .select(
      "id, portal, external_id, source_url, zone, price, operation, bedrooms, bathrooms, square_meters, description, photos, features, owner_name, phone, chat_only, created_at, is_active",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(2000);

  const rows = (data ?? []) as unknown as ParticularRow[];

  const stats = {
    total: rows.length,
    rent: rows.filter((r) => r.operation === "rent").length,
    sale: rows.filter((r) => r.operation === "sale").length,
    last24h: rows.filter(
      (r) =>
        r.created_at &&
        Date.now() - new Date(r.created_at).getTime() < 24 * 60 * 60 * 1000,
    ).length,
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="adminParticulares.title"
        subtitleKey="adminParticulares.subtitle"
      />

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<UserSearch size={20} strokeWidth={1.75} />}
          labelKey="adminParticulares.stats.total"
          helpKey="adminParticulares.stats.help"
          value={stats.total}
        />
        <StatCard
          icon={<Home size={20} strokeWidth={1.75} />}
          labelKey="adminParticulares.stats.rent"
          helpKey="adminParticulares.stats.help"
          value={stats.rent}
        />
        <StatCard
          icon={<Tag size={19} strokeWidth={1.75} />}
          labelKey="adminParticulares.stats.sale"
          helpKey="adminParticulares.stats.help"
          value={stats.sale}
        />
        <StatCard
          icon={<Clock size={19} strokeWidth={1.75} />}
          labelKey="adminParticulares.stats.last24h"
          helpKey="adminParticulares.stats.help"
          value={stats.last24h}
        />
      </div>

      <ParticularesClient rows={rows} />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
