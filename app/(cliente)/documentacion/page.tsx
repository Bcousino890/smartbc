import { redirect } from "next/navigation";
import { PageFooter } from "@/components/ui/page-footer";
import { getCurrentProfile } from "@/lib/db/queries/session";
import {
  getApplicationsForClientIncludingShared,
  acceptPendingCoApplicantInvites,
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

  // Vincula automáticamente cualquier invitación de co-solicitante pendiente
  // para este email — no existe una página aparte de "aceptar invitación",
  // así que el primer login con ese email la acepta.
  await acceptPendingCoApplicantInvites(profile.id, profile.email).catch(() => {});

  // Solicitudes propias + solicitudes conjuntas donde ya es co-solicitante
  const applications = await getApplicationsForClientIncludingShared(profile.id);

  // Obtener tipos de documentos para rent y sale en su país
  const [rentDocTypes, saleDocTypes] = await Promise.all([
    getDocumentTypes(country, "rent"),
    getDocumentTypes(country, "sale"),
  ]);

  // Para cada solicitud, obtener progreso y documentos — si no es el
  // solicitante principal (co-solicitante), filtramos a solo sus propios
  // documentos para respetar la privacidad entre solicitantes.
  const applicationsWithProgress = await Promise.all(
    (applications ?? []).map(async (app) => {
      const coApplicantId = app.is_primary ? undefined : profile.id;
      const [progress, documents] = await Promise.all([
        getApplicationDocumentProgress(app.id, coApplicantId),
        getDocumentsForApplication(app.id, coApplicantId),
      ]);
      return { ...app, progress, documents, coApplicantId };
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
