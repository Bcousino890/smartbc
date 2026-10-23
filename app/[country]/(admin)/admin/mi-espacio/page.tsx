import { HomeView } from "@/components/admin/catalogs/home-view";
import { StudioPageBar } from "@/components/admin/catalogs/studio/page-bar";
import { StudioRoot } from "@/components/admin/catalogs/studio/studio-root";
import { listOwnerGroups } from "@/lib/catalogs/group-data";
import { requireHomeOwnerPage } from "@/lib/catalogs/owner";
import { listOwnerCatalogs } from "@/lib/catalogs/queries";
import {
  createGroupAction,
  deleteGroupAction,
  listGroupsAction,
  moveGroupAction,
  previewDeleteGroupAction,
  renameGroupAction,
  reorderGroupsAction,
  setCatalogGroupAction,
} from "./group-actions";

export const dynamic = "force-dynamic";

/**
 * HOME de Fabricio (BCP-01). Solo entra el perfil que está en home_owners
 * (comprobado aquí, en el servidor): cualquier otro recibe 404 y sin sesión
 * se va a /login. Ocultar la entrada del menú no protege nada; esto sí.
 * HOME · grupos: los grupos del dueño (0207) y ?grupo= de la URL.
 * Rediseño 2026-10-23: barra compacta (avisos e idioma) y la estantería como
 * cabecera de la página, dentro de StudioRoot (tipografía del gestor).
 */
export default async function MiEspacioPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string }>;
  searchParams: Promise<{ grupo?: string | string[] }>;
}) {
  const { country } = await params;
  const { grupo } = await searchParams;
  const profile = await requireHomeOwnerPage(country);
  const [catalogs, groups] = await Promise.all([listOwnerCatalogs(profile.id), listOwnerGroups(profile.id)]);
  return (
    <StudioRoot className="mx-auto max-w-[1600px] px-4 pb-12 lg:px-8">
      <StudioPageBar />
      <HomeView
        catalogs={catalogs}
        preparedBy={profile.full_name?.trim() || "Fabricio Andree"}
        groups={groups}
        groupActions={{
          list: listGroupsAction,
          create: createGroupAction,
          rename: renameGroupAction,
          reorder: reorderGroupsAction,
          move: moveGroupAction,
          previewDelete: previewDeleteGroupAction,
          remove: deleteGroupAction,
          setMember: setCatalogGroupAction,
        }}
        initialGroupParam={typeof grupo === "string" ? grupo : null}
        ownerKey={profile.id}
        country={country}
      />
    </StudioRoot>
  );
}
