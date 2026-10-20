import { notFound } from "next/navigation";
import { CatalogFeedbackBlock } from "@/components/admin/clientes/catalog-feedback-block";
import { clientLinkState, type ClientCatalogFeedback } from "@/lib/catalogs/feedback-rules";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { sharePath } from "@/lib/catalogs/share";
import { FixtureCardJump } from "./jump";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * SOLO DESARROLLO LOCAL (0218, E7): la parte de la ficha del cliente que
 * muestra sus opiniones de catálogos, y los avisos internos que generaron,
 * con clientes y datos SINTÉTICOS. 404 salvo NODE_ENV=development y
 * CATALOG_FIXTURES=1. No envía nada fuera: no hay correo ni WhatsApp.
 */
export default async function FixtureClientFeedbackPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  if (!isCatalogFixtureMode()) notFound();
  const { FIXTURE_CLIENTS, fixtureClientRecord, fixtureNotices } = await import("@/lib/catalogs/fixture-store");
  const { cliente } = await searchParams;
  const client = FIXTURE_CLIENTS.find((c) => c.id === cliente) ?? FIXTURE_CLIENTS[0];
  const raw = await fixtureClientRecord(client.id);
  const now = Date.now();
  const data: ClientCatalogFeedback = {
    feedback: raw.feedback,
    links: raw.links.map((l) => ({
      id: l.id,
      catalogTitle: l.catalogTitle,
      url: sharePath(l.token),
      expiresAt: l.expiresAt,
      revokedAt: l.revokedAt,
      state: clientLinkState(l, now),
      managerHref: "/dev-fixtures/mi-espacio/catalogos/f0000000-0000-0000-0000-000000000001?seccion=compartir",
    })),
  };
  const notices = fixtureNotices().filter((n) => n.clientId === client.id);
  return (
    <div className="crm-root min-h-screen bg-cream-50 pb-10">
      <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">Datos de prueba sintéticos · solo desarrollo local · nada se envía fuera del CRM</p>
      <div className="mx-auto max-w-[1200px] px-4 lg:px-8">
        <header className="pt-7">
          <h1 className="crm-page-title text-ink" data-testid="fixture-client-name">{client.name}</h1>
          <nav className="mt-2 flex flex-wrap gap-3 text-xs text-ink/55">
            {FIXTURE_CLIENTS.map((c) => (
              <a key={c.id} href={`?cliente=${c.id}`} className={c.id === client.id ? "font-semibold text-ink" : "hover:text-ink"}>
                {c.name}
              </a>
            ))}
          </nav>
        </header>
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-5">
            <CatalogFeedbackBlock data={data} locale="es-ES" />
          </div>
          <div className="min-w-0 space-y-5">
            <FixtureCardJump data={data} />
            <section className="rounded-lg border border-ink/10 bg-white p-4" data-testid="fixture-notices">
              <h2 className="crm-label-sm text-ink/60">Avisos internos generados (campana del CRM)</h2>
              {notices.length === 0 ? (
                <p className="mt-2 text-xs text-ink/50">Ninguno.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {notices.map((n) => (
                    <li key={n.id} className="text-xs text-ink/70" data-testid="fixture-notice">
                      <span className="font-semibold">Para {n.to === "asesor" ? "su asesora" : "el dueño del catálogo"}</span>
                      {n.read ? " · leído" : " · sin leer"} — {n.body}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
