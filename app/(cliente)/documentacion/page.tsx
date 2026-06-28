import { redirect } from "next/navigation";
import { PageFooter } from "@/components/ui/page-footer";
import { getCurrentProfile } from "@/lib/db/queries/session";
import {
  getApplicationsByClient,
  getDocumentTypes,
  getApplicationDocumentProgress,
  getDocumentsForApplication,
} from "@/lib/db/queries/property-applications";
import { DocumentacionClient } from "./documentacion-client";

export const dynamic = "force-dynamic";

export default async function DocumentacionPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // Detectar país del cliente basado en su perfil/preferencias
  const country = (profile as Record<string, unknown>).country as "ES" | "CL" | undefined ?? "ES";

  // Obtener solicitudes del cliente
  const applications = await getApplicationsByClient(profile.id);

  // Obtener tipos de documentos para rent y sale en su país
  const [rentDocTypes, saleDocTypes] = await Promise.all([
    getDocumentTypes(country, "rent"),
    getDocumentTypes(country, "sale"),
  ]);

  // Para cada solicitud, obtener progreso y documentos
  const applicationsWithProgress = await Promise.all(
    (applications ?? []).map(async (app) => {
      const [progress, documents] = await Promise.all([
        getApplicationDocumentProgress(app.id),
        getDocumentsForApplication(app.id),
      ]);
      return { ...app, progress, documents };
    })
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-10 md:px-8">
      <DocumentacionClient
        profile={{
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          country,
        }}
        applications={applicationsWithProgress as Parameters<typeof DocumentacionClient>[0]["applications"]}
        rentDocTypes={rentDocTypes}
        saleDocTypes={saleDocTypes}
      />
      <PageFooter textKey="login.footer" />
    </div>
  );
}
