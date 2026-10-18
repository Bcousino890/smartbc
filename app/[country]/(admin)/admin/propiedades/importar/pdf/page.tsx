import { FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { checkPermission, guardPage } from "@/lib/auth/guard";
import type { Country } from "@/lib/country-config";
import { PdfImportClient } from "./pdf-import-client";

/** Importar desde PDF (BCP-01 P8). España V1; exige crear propiedades. */
export default async function AdminImportPdfPage({ params }: { params: Promise<{ country: Country }> }) {
  const { country } = await params;
  await guardPage("properties", country);
  if (country !== "es") notFound();
  const canCreate = (await checkPermission("properties", "create", { country })).ok;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader titleKey="adminProps.title" subtitleKey="adminProps.subtitle" welcome={false} />
      <section className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-8">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-full bg-gold/10 p-2 text-gold">
            <FileText size={18} strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="crm-section-title text-ink">Importar desde PDF</h2>
            <p className="mt-1 text-sm text-ink/60">
              Sube el PDF de un colaborador. Lo leemos en tu navegador (también los escaneados), proponemos una vivienda por bloque y
              sale un borrador privado por cada una para que lo revises. Nada se publica ni se avisa a nadie sin que lo confirmes.
            </p>
          </div>
        </div>
        {canCreate ? (
          <PdfImportClient country={country} />
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">No tienes permiso para crear propiedades. Pide a un administrador que te dé acceso desde Usuarios.</p>
        )}
      </section>
      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
