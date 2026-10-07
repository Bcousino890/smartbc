import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { getCountryConfig, isCountry } from "@/lib/country-config";
import { getCurrentProfile } from "@/lib/db/queries/session";
import {
  EXTENSION_ROLES,
  getExtensionSecurity,
  listExtensionSessions,
} from "@/lib/extension/sessions";
import { ExtensionClient } from "./extension-client";

export const dynamic = "force-dynamic";

// ============================================================================
// /{país}/admin/extension — conectar la extensión de Chrome con TU usuario.
//
// Es a donde lleva el botón "Conectar" de la extensión. Aquí se ve además qué
// navegadores tienes conectados (y se desconectan), y los admins ven los de
// todo el equipo y la seguridad de la extensión.
// ============================================================================

export default async function ExtensionPage({ params }: { params: Promise<{ country: string }> }) {
  const { country } = await params;
  const prefix = getCountryConfig(isCountry(country) ? country : "es").prefix;

  const me = await getCurrentProfile();
  if (!me || !(EXTENSION_ROLES as readonly string[]).includes(me.role)) redirect(prefix);

  const isAdmin = ["owner", "admin"].includes(me.role);
  const [mine, all, security] = await Promise.all([
    listExtensionSessions(me.id),
    isAdmin ? listExtensionSessions() : Promise.resolve([]),
    getExtensionSecurity(),
  ]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="Extensión de Chrome"
        subtitleKey="Manda anuncios de Idealista, Fotocasa, Habitaclia y pisos.com a la ficha de un cliente, y captura los contactos del inbox de Idealista."
      />
      <ExtensionClient
        me={{ id: me.id, name: me.full_name || me.email || "—" }}
        mine={mine}
        all={all}
        isAdmin={isAdmin}
        security={security}
      />
    </div>
  );
}
