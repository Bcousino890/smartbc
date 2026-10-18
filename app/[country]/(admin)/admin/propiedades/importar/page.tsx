import { Link2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { checkPermission, guardPage } from "@/lib/auth/guard";
import type { Country } from "@/lib/country-config";
import { ImportClient } from "./import-client";

export default async function AdminImportByLinkPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  await guardPage("properties", country);
  // Ver la página exige «ver»; importar exige «crear» (antes daba un error sin tratar).
  const canCreate = (await checkPermission("properties", "create", { country })).ok;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="adminProps.title"
        subtitleKey="adminProps.subtitle"
        welcome={false}
      />

      <section className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-8">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-full bg-gold/10 p-2 text-gold">
            <Link2 size={18} strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="crm-section-title text-ink">
              Importar propiedad por link
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              Pega el enlace público del anuncio: lo leemos y preparamos un
              borrador privado para que lo revises antes de crear la ficha.
              Funciona con Idealista, Fotocasa, yaencontre, Ukio, webs sobre
              Inmoweb y otros portales (con extractor genérico).
            </p>
          </div>
        </div>

        <ImportClient country={country} canCreate={canCreate} />
      </section>

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
