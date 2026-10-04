import { AdminPageHeader } from "@/components/admin/admin-page-header";
import type { Country } from "@/lib/country-config";
import { CorreoClient } from "./correo-client";

export const dynamic = "force-dynamic";

/**
 * Correo corporativo de cada usuario (IMAP/SMTP del cPanel de
 * bcousinoprop.com). El layout ya exige rol de staff; el buzón que se ve es
 * siempre el del usuario de la sesión (ver lib/mailbox/session.ts).
 */
export default async function CorreoPage({ params }: { params: Promise<{ country: Country }> }) {
  const { country } = await params;
  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 pb-6 lg:px-8">
      <AdminPageHeader titleKey="adminCorreo.title" subtitleKey="adminCorreo.subtitle" />
      <div className="mt-6 flex-1">
        <CorreoClient country={country} />
      </div>
    </div>
  );
}
