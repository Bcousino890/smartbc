import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { HomeView } from "@/components/admin/catalogs/home-view";
import { requireHomeOwnerPage } from "@/lib/catalogs/owner";
import { listOwnerCatalogs } from "@/lib/catalogs/queries";

export const dynamic = "force-dynamic";

/**
 * HOME de Fabricio (BCP-01). Solo entra el perfil que está en home_owners
 * (comprobado aquí, en el servidor): cualquier otro recibe 404 y sin sesión
 * se va a /login. Ocultar la entrada del menú no protege nada; esto sí.
 */
export default async function MiEspacioPage({ params }: { params: Promise<{ country: string }> }) {
  const { country } = await params;
  const profile = await requireHomeOwnerPage(country);
  const catalogs = await listOwnerCatalogs(profile.id);
  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-12 lg:px-8">
      <AdminPageHeader titleKey="miEspacio.title" subtitleKey="miEspacio.subtitle" welcome={false} />
      <HomeView catalogs={catalogs} preparedBy={profile.full_name?.trim() || "Fabricio Andree"} />
    </div>
  );
}
