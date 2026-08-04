import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
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

// Next.js oculta el mensaje real de cualquier error lanzado desde un Server
// Component en producción (solo deja pasar un "digest" opaco) — por diseño,
// para no filtrar detalles a un atacante. Aquí necesitamos justo lo
// contrario mientras se depura este 500 en producción sin acceso SSH al
// VPS: capturamos el error ANTES de que se lance como excepción y su
// mensaje real (típicamente de Postgres/PostgREST: "relation ... does not
// exist", PGRST205, etc.) se pinta como datos normales de la página, no
// como un throw — así no lo toca el sanitizado de Next.
// TODO: una vez identificada y corregida la causa raíz, volver a un
// mensaje genérico sin el bloque de detalle técnico.
function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [e.code, e.message, e.details, e.hint].filter(Boolean);
    if (parts.length > 0) return parts.join(" · ");
  }
  return String(error);
}

export default async function DocumentacionPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // Detectar país del cliente basado en su perfil/preferencias
  const country = (profile as Record<string, unknown>).country as "ES" | "CL" | undefined ?? "ES";

  // Vincula automáticamente cualquier invitación de co-solicitante pendiente
  // para este email — no existe una página aparte de "aceptar invitación",
  // así que el primer login con ese email la acepta.
  await acceptPendingCoApplicantInvites(profile.id, profile.email).catch(() => {});

  // Todo lo que sigue depende de las tablas de property_applications (país,
  // tipos de documento, progreso...). Si a alguna consulta le falta una
  // migración o el schema cache de PostgREST no se recargó tras aplicarla,
  // Supabase devuelve un error y sin este try/catch la página entera moría
  // con el crash genérico de Next sin dejar rastro. Se loguea con contexto
  // (visible en pm2 logs) y se devuelve un estado amigable con el detalle
  // técnico real (ver describeError arriba) en vez de la pantalla en
  // blanco con solo un digest.
  try {
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
  } catch (error) {
    const detail = describeError(error);
    console.error(`[/documentacion] Error cargando documentación para profile ${profile.id}: ${detail}`, error);
    return (
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-4 pb-10 md:px-8">
        <div className="w-full max-w-md rounded-2xl border border-gold/25 bg-cream-50/85 p-8 text-center shadow-[0_15px_40px_-25px_rgba(40,28,10,0.30)] backdrop-blur-sm">
          <AlertTriangle size={36} strokeWidth={1.25} className="mx-auto text-gold/60" />
          <p className="mt-4 font-serif text-lg text-ink">No se pudo cargar tu documentación</p>
          <p className="mt-1 text-sm text-ink/55">
            Ha ocurrido un problema al conectar con el servidor. Inténtalo de nuevo en unos
            instantes; si el problema continúa, contacta con tu asesor.
          </p>
          {/* Detalle técnico temporal para depuración — ver TODO arriba */}
          <p className="mt-3 break-words rounded-lg bg-ink/5 px-3 py-2 text-left text-[11px] text-ink/45">
            {detail}
          </p>
          <a
            href="/documentacion"
            className="mt-6 inline-block rounded-xl bg-ink px-6 py-3 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
          >
            Reintentar
          </a>
        </div>
      </div>
    );
  }
}
