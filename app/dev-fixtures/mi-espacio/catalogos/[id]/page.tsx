import { notFound } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";
import { FixtureReport } from "@/components/catalogs/dev/fixture-report";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { FixtureCatalogManager } from "./fixture-manager";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** SOLO DESARROLLO LOCAL (BCP-01, E7): gestión de un catálogo con datos
 *  sintéticos y acciones falsas en memoria. 404 fuera de desarrollo.
 *  ?vivo=1 conecta los guardados con el almacén sintético del lector
 *  (/seleccion/fixtureMainToken…) y ?medir=1 activa el modo medición.
 *  E2: ?grande=1 abre el catálogo grande (22 viviendas; automático hasta 24),
 *  y la página reproduce el marco del admin (barra lateral REAL con datos
 *  sintéticos y el mismo <main>) para probar el aviso al salir y las barras
 *  fijas frente al botón de menú del CRM. «Cerrar sesión» no se usa aquí. */
export default async function FixtureCatalogPage({ searchParams }: { searchParams: Promise<{ vivo?: string; medir?: string; grande?: string }> }) {
  if (!isCatalogFixtureMode()) notFound();
  const { vivo, medir, grande } = await searchParams;
  const { fixtureCatalogDetail } = await import("@/lib/catalogs/fixtures");
  const { fixtureLargeCatalogDetail, fixturePropertiesLarge } = await import("@/lib/catalogs/fixtures-selection");
  const { FIXTURE_TOKENS } = await import("@/lib/catalogs/fixture-store");
  const { fixtureHomeState } = await import("@/lib/catalogs/fixture-groups");
  const large = grande === "1";
  const catalog = large ? fixtureLargeCatalogDetail() : fixtureCatalogDetail;
  return (
    <div className="crm-root relative min-h-screen bg-cream-50">
      <div className="relative z-10">
        <AdminSidebar
          user={{ firstName: "Usuario", lastName: "de prueba", initials: "UP", roleKey: "admin.role.owner" }}
          currentRole="owner"
          country="es"
          isHomeOwner
        />
        <main className="min-h-screen pt-16 lg:ml-[260px] lg:pt-0">
          <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">
            Datos de prueba sintéticos · solo desarrollo local · nada se guarda
          </p>
          <div className="mx-auto max-w-[1600px] px-4 lg:px-8">
            <header className="pt-7">
              <p className="crm-label-sm text-gold">Catálogo</p>
              <h1 className="crm-page-title mt-1 line-clamp-2 text-ink">{catalog.title}</h1>
            </header>
            <FixtureCatalogManager
              catalog={catalog}
              liveToken={vivo === "1" ? FIXTURE_TOKENS.main : null}
              measureMode={medir === "1"}
              pool={large ? fixturePropertiesLarge : undefined}
              groups={fixtureHomeState().groups}
            />
          </div>
        </main>
      </div>
      <FixtureReport />
    </div>
  );
}
