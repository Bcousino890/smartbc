import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { createAdminClient } from "@/lib/db/admin";
import { guardPage } from "@/lib/auth/guard";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { IdealistaConfigClient } from "./config-client";
import { AIConfigSection } from "./ai-config-section";
import { ExtensionTokenSection } from "./extension-token-section";
import { ApiConfigSection } from "./api-config-section";

export const dynamic = "force-dynamic";

export default async function IdealistaConfigPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  if (country !== "es") redirect(getCountryConfig(country).prefix);
  await guardPage("publicacion", country);

  const supabase = createAdminClient() as any;

  const { data: configRow } = await supabase
    .from("idealista_config")
    .select("username, last_login_at")
    .limit(1)
    .single();

  const initialConfig = configRow
    ? {
        username: configRow.username ?? null,
        lastLoginAt: configRow.last_login_at ?? null,
      }
    : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="admin.nav.idealista"
        subtitleKey="Conexión con tu cuenta de Idealista"
      />

      <div className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Settings size={20} className="text-gold" />
          <h2 className="font-serif text-lg font-semibold text-ink">
            Acceso a Idealista
          </h2>
        </div>
        <p className="mb-6 text-sm text-ink/60">
          Conecta tu cuenta de Idealista para publicar propiedades automáticamente. La sesión se guarda en el servidor y no tendrás que volver a autenticarte hasta que Idealista la expire.
        </p>

        <IdealistaConfigClient initialConfig={initialConfig} />
      </div>

      <ExtensionTokenSection />

      <ApiConfigSection />

      <AIConfigSection />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
