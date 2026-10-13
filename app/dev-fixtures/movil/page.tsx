import { notFound } from "next/navigation";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { MobileFrame } from "./mobile-frame";

export const dynamic = "force-dynamic";

/** SOLO DESARROLLO LOCAL (BCP-01, E7): una ruta de prueba dentro de un marco
 *  de 362 px de ancho reales (Chrome de escritorio no deja ventanas tan
 *  estrechas). Solo admite rutas /dev-fixtures/*. */
export default async function FixtureMobilePage({ searchParams }: { searchParams: Promise<{ ruta?: string; alto?: string }> }) {
  if (!isCatalogFixtureMode()) notFound();
  const { ruta, alto } = await searchParams;
  const height = Math.min(Math.max(Number.parseInt(alto ?? "780", 10) || 780, 400), 4000);
  const target = ruta && /^\/dev-fixtures\/[a-z0-9/_?=&-]+$/i.test(ruta) && !ruta.startsWith("/dev-fixtures/movil") ? ruta : "/dev-fixtures/mi-espacio";
  return <MobileFrame src={target} height={height} />;
}
