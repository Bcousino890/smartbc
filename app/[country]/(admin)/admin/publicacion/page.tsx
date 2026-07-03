import { Home, Tag } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { StatCard } from "@/components/ui/stat-card";
import { createAdminClient } from "@/lib/db/admin";
import { getMlTokens } from "@/lib/sync/portalinmobiliario/ml-config";
import type { Country } from "@/lib/country-config";
import { PublicacionClient } from "./publicacion-client";
import { PublicacionClClient } from "./publicacion-cl-client";

export const dynamic = "force-dynamic";

// España usa Idealista/Fotocasa (formulario propio, sin filtro de país — así
// funcionaba /es/admin/publicacion antes de este refactor). Chile usa
// PortalInmobiliario.com y sí filtra por country='cl' (Fase 1).
export default async function AdminPublicacionPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;

  if (country === "cl") {
    const db = createAdminClient() as any;

    const [{ data: properties }, tokens] = await Promise.all([
      db
        .from("properties")
        .select(
          "id, slug, title, price, operation, bedrooms, bathrooms, square_meters, cover_photo_url, bc_reference, commune, region, property_type, currency, portalinmobiliario_id, portalinmobiliario_published_at, portalinmobiliario_sync_status"
        )
        .eq("country", "cl")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
      getMlTokens(),
    ]);

    const rows = (properties ?? []) as Array<{
      id: string;
      slug: string;
      title: string;
      price: number | null;
      operation: string | null;
      bedrooms: number | null;
      bathrooms: number | null;
      square_meters: number | null;
      cover_photo_url: string | null;
      bc_reference: string | null;
      commune: string | null;
      region: string | null;
      property_type: string | null;
      currency: string | null;
      portalinmobiliario_id: string | null;
      portalinmobiliario_published_at: string | null;
      portalinmobiliario_sync_status: string | null;
    }>;

    const isConnected = !!tokens?.access_token;

    return (
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
        <AdminPageHeader
          titleKey="admin.nav.publicacion"
          subtitleKey="Publica propiedades en PortalInmobiliario.com y en la web"
        />

        <PublicacionClClient properties={rows} isConnected={isConnected} />

        <PageFooter textKey="admin.realtime.footer" variant="inline" />
      </div>
    );
  }

  const supabase = createAdminClient();

  const { data: properties } = await supabase
    .from("properties")
    .select(
      "id, slug, title, zone, price, operation, bedrooms, bathrooms, square_meters, status, cover_photo_url, external_id, bc_reference, created_at",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (properties ?? []) as Array<{
    id: string; slug: string; title: string; zone: string | null;
    price: number | null; operation: string | null; bedrooms: number | null;
    bathrooms: number | null; square_meters: number | null; status: string | null;
    cover_photo_url: string | null; external_id: string | null;
    bc_reference: string | null; created_at: string;
  }>;

  const stats = {
    total: rows.length,
    rent: rows.filter((r) => r.operation === "rent").length,
    sale: rows.filter((r) => r.operation === "sale").length,
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="publicacion.title"
        subtitleKey="publicacion.subtitle"
      />

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<Home size={20} strokeWidth={1.75} />}
          labelKey="publicacion.stats.total"
          helpKey="publicacion.stats.help"
          value={stats.total}
        />
        <StatCard
          icon={<Home size={20} strokeWidth={1.75} />}
          labelKey="publicacion.stats.rent"
          helpKey="publicacion.stats.help"
          value={stats.rent}
        />
        <StatCard
          icon={<Tag size={19} strokeWidth={1.75} />}
          labelKey="publicacion.stats.sale"
          helpKey="publicacion.stats.help"
          value={stats.sale}
        />
      </div>

      <PublicacionClient properties={rows} />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
