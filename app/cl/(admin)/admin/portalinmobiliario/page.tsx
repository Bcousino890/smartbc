import Link from "next/link";
import { Globe2, Settings } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { createAdminClient } from "@/lib/db/admin";
import { getMlTokens } from "@/lib/sync/portalinmobiliario/ml-config";
import { PortalinmobiliarioClient } from "./portalinmobiliario-client";

export const dynamic = "force-dynamic";

export default async function AdminPortalinmobiliarioPage() {
  const db = createAdminClient() as any;

  const [{ data: properties }, tokens] = await Promise.all([
    db
      .from("properties")
      .select(
        "id, slug, title, price, operation, bedrooms, bathrooms, square_meters, cover_photo_url, bc_reference, commune, region, property_type, portalinmobiliario_id, portalinmobiliario_published_at, portalinmobiliario_sync_status"
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
    portalinmobiliario_id: string | null;
    portalinmobiliario_published_at: string | null;
    portalinmobiliario_sync_status: string | null;
  }>;

  const isConnected = !!tokens?.access_token;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="admin.nav.portalinmobiliario"
        subtitleKey="Publica propiedades directamente en PortalInmobiliario.com"
      />

      <div className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
        <div className="mb-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe2 size={20} className="text-gold" />
            <h2 className="font-serif text-lg font-semibold text-ink">
              PortalInmobiliario.com — Chile
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/cl/admin/propiedades"
              className="rounded-lg border border-ink/10 bg-white/60 px-3 py-1.5 text-xs font-medium text-ink/60 transition hover:bg-white hover:text-ink"
            >
              Ver propiedades
            </Link>
            <Link
              href="/cl/admin/configuracion"
              className="flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/60 px-3 py-1.5 text-xs font-medium text-ink/60 transition hover:bg-white hover:text-ink"
            >
              <Settings size={13} />
              Configuración API
            </Link>
          </div>
        </div>

        <PortalinmobiliarioClient properties={rows} isConnected={isConnected} />
      </div>

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
