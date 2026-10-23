import { notFound } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";
import { FixtureReport } from "@/components/catalogs/dev/fixture-report";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { FixtureCatalogManager } from "./fixture-manager";
import { StudioRoot } from "@/components/admin/catalogs/studio/studio-root";

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
export default async function FixtureCatalogPage({ searchParams }: { searchParams: Promise<{ vivo?: string; medir?: string; grande?: string; auto?: string }> }) {
  if (!isCatalogFixtureMode()) notFound();
  const { vivo, medir, grande, auto } = await searchParams;
  const { fixtureCatalogDetail } = await import("@/lib/catalogs/fixtures");
  const { fixtureLargeCatalogDetail, fixturePropertiesLarge } = await import("@/lib/catalogs/fixtures-selection");
  const { FIXTURE_TOKENS } = await import("@/lib/catalogs/fixture-store");
  const { fixtureHomeState } = await import("@/lib/catalogs/fixture-groups");
  const large = grande === "1";
  const base = large ? fixtureLargeCatalogDetail() : fixtureCatalogDetail;
  // BCP-01 P3/P4: ?auto=1 abre el mismo catálogo como AUTOMÁTICO antiguo (con
  // criterios), para comprobar que su panel no cambia y para la conversión.
  const withMode = auto === "1" ? { ...base, mode: "auto" as const, criteria: { ...base.criteria, operation: "sale" as const, max: 12 } } : base;
  // N5: aviso de «Contenido» con las viviendas sin traducción vigente en un idioma activo.
  const { fixtureTranslations } = await import("@/lib/catalogs/fixture-store");
  const { activeLanguageGaps } = await import("@/lib/catalogs/translation-service");
  const mem = (await fixtureTranslations()).mem;
  const translationGaps = await activeLanguageGaps(mem, withMode.id).catch(() => []);
  // 0228: el idioma del catálogo sintético (selector junto a «Compartir»).
  const defaultLang = (await mem.esState(withMode.id).catch(() => null))?.defaultLang ?? "es";
  const catalog = { ...withMode, defaultLang };
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
          <StudioRoot className="mx-auto max-w-[1600px] px-4 lg:px-8">
            <FixtureCatalogManager
              catalog={catalog}
              liveToken={vivo === "1" ? FIXTURE_TOKENS.main : null}
              measureMode={medir === "1"}
              pool={large ? fixturePropertiesLarge : undefined}
              groups={fixtureHomeState().groups}
              translationGaps={translationGaps}
            />
          </StudioRoot>
        </main>
      </div>
      <FixtureReport />
    </div>
  );
}
