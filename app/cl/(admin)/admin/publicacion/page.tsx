import { Globe2, Link as LinkIcon } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { createAdminClient } from "@/lib/db/admin";
import { getMlTokens } from "@/lib/sync/portalinmobiliario/ml-config";
import { PublicacionClClient } from "./publicacion-cl-client";

export const dynamic = "force-dynamic";

export default async function AdminPublicacionClPage() {
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
