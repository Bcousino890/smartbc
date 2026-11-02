import { checkRoles } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { getRoutingAdvisors, getRoutingTargets } from "@/lib/db/queries/routing";
import { getCountryConfig, isCountry, type Country } from "@/lib/country-config";
import { ADMIN_ROLES } from "@/lib/sales-inbox/routing";
import { RepartoClient } from "./reparto-client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const PAGE_SIZE = 50;

/**
 * Administración → Reparto comercial. Qué asesor recibe a los clientes NUEVOS
 * (o sin asesor) que llegan por cada inmueble. Solo administradores: el
 * permiso se vuelve a comprobar en cada acción y dentro de la base.
 */
export default async function RepartoPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: Country }>;
  searchParams: Promise<SP>;
}) {
  const { country: raw } = await params;
  const country: Country = isCountry(raw) ? raw : "es";
  const sp = await searchParams;

  const gate = await checkRoles(ADMIN_ROLES, { country });
  if (!gate.ok) {
    // Sin permisos se EXPLICA la limitación en vez de redirigir en silencio.
    return <RepartoClient country={country} denied={gate.error} />;
  }

  const filter = {
    search: one(sp.q),
    advisor: one(sp.advisor),
    page: Math.max(1, Number(one(sp.page) ?? 1) || 1),
    pageSize: PAGE_SIZE,
  };

  const [page, advisors, pending] = await Promise.all([
    getRoutingTargets(country, filter),
    getRoutingAdvisors(),
    // Lo que espera a un administrador en la bandeja (solo hay leads en España).
    country === "es"
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (createAdminClient() as any)
          .from("lead_inbox_facts")
          .select("id", { count: "exact", head: true })
          .is("assigned_to", null)
          .not("commercial_state", "in", "(converted,discarded)")
          .then((r: { count: number | null }) => r.count ?? 0)
      : Promise.resolve(0),
  ]);

  return (
    <RepartoClient
      country={country}
      page={page}
      advisors={advisors}
      pendingLeads={pending}
      inboxHref={`${getCountryConfig(country).prefix}/solicitudes?view=unassigned`}
    />
  );
}
