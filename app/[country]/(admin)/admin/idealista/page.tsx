import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings, Sparkles } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getCountryConfig, type Country } from "@/lib/country-config";
import type { DbIdealistaListing } from "@/lib/services/idealista/listing-helpers";
import { IdealistaClient } from "./idealista-client";

export const dynamic = "force-dynamic";

export default async function AdminIdealistaPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  // Idealista es un módulo exclusivo de España. En Chile la publicación en
  // portales se gestiona en /cl/admin/publicacion (Portal Inmobiliario).
  if (country !== "es") redirect(`${getCountryConfig(country).prefix}/publicacion`);

  const currentProfile = await getCurrentProfile();
  if (!canAccess(currentProfile?.role ?? "", "publicacion", "view")) {
    redirect(getCountryConfig(country).prefix);
  }

  const supabase = createAdminClient();

  // Obtener propiedades propias para publicar
  const { data: properties } = await supabase
    .from("properties")
    .select(
      "id, slug, title, zone, price, operation, bedrooms, bathrooms, square_meters, status, cover_photo_url, bc_reference, created_at"
    )
    .not("bc_reference", "is", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  // Obtener listados ya preparados para Idealista
  const { data: listings } = await supabase
    .from("idealista_listings")
    .select("*")
    .order("updated_at", { ascending: false });

  const rows = (properties ?? []) as Array<{
    id: string;
    slug: string;
    title: string;
    zone: string | null;
    price: number | null;
    operation: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    square_meters: number | null;
    status: string | null;
    cover_photo_url: string | null;
    bc_reference: string | null;
    created_at: string;
  }>;

  const idealista = (listings ?? []) as DbIdealistaListing[];

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="admin.nav.idealista"
        subtitleKey="Prepara y publica anuncios en Idealista"
      />

      <div className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-gold" />
            <h2 className="font-serif text-lg font-semibold text-ink">
              Publicar en Idealista
            </h2>
          </div>
          <Link
            href="/es/admin/idealista/configuracion"
            className="flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/60 px-3 py-1.5 text-xs font-medium text-ink/60 transition hover:bg-white hover:text-ink"
          >
            <Settings size={13} />
            Conectar cuenta
          </Link>
        </div>
        <p className="mb-6 text-sm text-ink/60">
          Selecciona una propiedad, completa los datos de Idealista y sube fotos, videos y planos. Los datos quedan guardados y listos para publicar.
        </p>

        <IdealistaClient properties={rows} listings={idealista} />
      </div>

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
