import { Building2, Home, Sparkles, Tag } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { StatCard } from "@/components/ui/stat-card";
import { propertyRowToAdminProperty } from "@/lib/db/adapters";
import { getProperties } from "@/lib/db/queries/properties";
import { PropertiesAdminClient } from "./properties-admin-client";

export default async function AdminPropiedadesPage() {
  const rows = await getProperties({ includeUnavailable: true }, 200);
  const properties = rows.map(propertyRowToAdminProperty);

  const stats = {
    total: properties.length,
    rent: properties.filter((p) => p.operation === "alquiler").length,
    sale: properties.filter((p) => p.operation === "venta").length,
    featured: properties.filter((p) => p.featured).length,
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="adminProps.title"
        subtitleKey="adminProps.subtitle"
      />

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Building2 size={20} strokeWidth={1.75} />}
          labelKey="adminProps.stats.total"
          helpKey="adminProps.stats.help"
          value={stats.total}
        />
        <StatCard
          icon={<Home size={20} strokeWidth={1.75} />}
          labelKey="adminProps.stats.rent"
          helpKey="adminProps.stats.help"
          value={stats.rent}
        />
        <StatCard
          icon={<Tag size={19} strokeWidth={1.75} />}
          labelKey="adminProps.stats.sale"
          helpKey="adminProps.stats.help"
          value={stats.sale}
        />
        <StatCard
          icon={<Sparkles size={19} strokeWidth={1.75} />}
          labelKey="adminProps.stats.featured"
          helpKey="adminProps.stats.help"
          value={stats.featured}
        />
      </div>

      <PropertiesAdminClient properties={properties} />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
