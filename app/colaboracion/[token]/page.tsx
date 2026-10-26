import type { Metadata } from "next";
import { headers } from "next/headers";
import { Bath, BedDouble, MapPin, Ruler } from "lucide-react";
import { getCollabByToken, recordCollabOpen } from "@/lib/db/queries/collab-links";
import {
  COLLAB_COMPANY_LABEL,
  collabTitle,
  isBotUserAgent,
} from "@/lib/collab/white-label";
import { ParticularHero } from "@/app/a/[token]/particular-hero";
import { LanguageSelect } from "@/app/a/[token]/language-select";
import { ParticularLocation } from "@/app/a/[token]/particular-location";

// Enlace temporal EN BLANCO de una propiedad para una empresa colaboradora
// (migración 0231). Sin logo, teléfono, correo ni nombre de BC: solo
// "Empresa colaboradora" y la referencia neutra de la propiedad. No lleva CTA
// hacia BC. Nunca se indexa. Cada visita queda registrada (IP, navegador,
// procedencia). `force-dynamic` porque el token se resuelve en cada visita.
export const dynamic = "force-dynamic";

function fmtPrice(price: number): string {
  return new Intl.NumberFormat("es-ES").format(price);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const robots = { index: false, follow: false } as const;
  const resolved = await getCollabByToken(token);
  if (!resolved) return { title: "Enlace no disponible", robots };
  const p = resolved.property;
  // Sin nombre de marca: ni en el título ni en la vista previa de mensajería.
  return {
    title: `${collabTitle(p.operation, p.propertyType, p.zone)}${p.reference ? ` · Ref. ${p.reference}` : ""}`,
    description: COLLAB_COMPANY_LABEL,
    robots,
    openGraph: { siteName: COLLAB_COMPANY_LABEL },
  };
}

export default async function CollabSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await getCollabByToken(token);
  if (!resolved) return <UnavailableView />;

  // Registrar la apertura sin bloquear el render. IP detrás del proxy: la
  // primera de X-Forwarded-For.
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip"))?.trim() || null;
  const userAgent = h.get("user-agent");
  recordCollabOpen(resolved.linkId, {
    ip,
    userAgent,
    referer: h.get("referer"),
    isBot: isBotUserAgent(userAgent),
  }).catch(() => {});

  const p = resolved.property;
  const isRent = p.operation === "rent";
  const title = collabTitle(p.operation, p.propertyType, p.zone);

  const facts: Array<{ label: string; value: string; icon: React.ReactNode }> = [];
  if (p.bedrooms != null) {
    facts.push({ label: "Dormitorios", value: String(p.bedrooms), icon: <BedDouble size={16} strokeWidth={1.75} /> });
  }
  if (p.bathrooms != null) {
    facts.push({ label: "Baños", value: String(p.bathrooms), icon: <Bath size={16} strokeWidth={1.75} /> });
  }
  if (p.squareMeters != null) {
    facts.push({ label: "Superficie", value: `${p.squareMeters} m²`, icon: <Ruler size={16} strokeWidth={1.75} /> });
  }

  return (
    <div className="smartlink-root min-h-screen bg-cream-50">
      <header className="border-b border-gold/15 bg-cream-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div>
            <p className="crm-label text-ink">{COLLAB_COMPANY_LABEL}</p>
            {p.reference && <p className="crm-meta text-ink/55">Ref. {p.reference}</p>}
          </div>
          <LanguageSelect />
        </div>
      </header>

      <ParticularHero photos={p.photos} title={title} />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 md:px-8">
        <section className="rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="crm-label text-gold-dark">{isRent ? "Alquiler" : "Venta"}</p>
              <h1 className="crm-page-title mt-2 text-ink">{title}</h1>
              {p.zone && (
                <div className="mt-3 inline-flex items-center gap-2 text-sm text-ink/65">
                  <MapPin size={14} strokeWidth={1.75} className="text-gold" />
                  <span>{p.zone}</span>
                </div>
              )}
            </div>
            {p.price != null && p.price > 0 && (
              <div className="shrink-0 text-left md:text-right">
                <p className="crm-number text-3xl text-ink md:text-4xl">
                  {fmtPrice(p.price)} €
                  {isRent && <span className="ml-1 text-base font-normal text-ink/55">/mes</span>}
                </p>
              </div>
            )}
          </div>

          {facts.length > 0 && (
            <div className="mt-6 flex gap-3 overflow-x-auto border-t border-gold/15 pt-5 md:grid md:grid-cols-4 lg:grid-cols-5">
              {facts.map((f) => (
                <div key={f.label} className="flex min-w-[104px] flex-col items-center text-center">
                  <span className="text-gold">{f.icon}</span>
                  <p className="crm-label-sm mt-1 text-ink/55">{f.label}</p>
                  <p className="mt-0.5 font-medium text-ink">{f.value}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {p.features.length > 0 && (
          <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
            <h2 className="crm-section-title text-ink">Características</h2>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {p.features.map((f, i) => (
                <span key={i} className="rounded-full border border-ink/10 bg-cream-50 px-2.5 py-1 text-xs text-ink/70">
                  {f}
                </span>
              ))}
            </div>
          </section>
        )}

        {p.description && (
          <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
            <h2 className="crm-section-title text-ink">Descripción</h2>
            <p className="mt-4 max-w-3xl whitespace-pre-wrap text-base leading-relaxed text-ink/75">
              {p.description}
            </p>
          </section>
        )}

        <ParticularLocation
          location={
            p.location
              ? { point: { lat: p.location.lat, lng: p.location.lng, precision: "exact" }, estimate: null }
              : null
          }
        />

        <footer className="mt-8 pb-4 text-center crm-meta text-ink/45">
          {COLLAB_COMPANY_LABEL}
          {p.reference ? ` · Ref. ${p.reference}` : ""}
          <br />
          <span className="crm-caption text-ink/30">Enlace temporal · válido por tiempo limitado</span>
        </footer>
      </main>
    </div>
  );
}

// Token inexistente, caducado o revocado: mismo mensaje en los tres casos para
// no filtrar si un token existió alguna vez.
function UnavailableView() {
  return (
    <div className="smartlink-root flex min-h-screen flex-col items-center justify-center bg-cream-50 px-6 text-center text-ink">
      <p className="crm-section-title text-ink">Enlace no disponible</p>
      <p className="mt-3 max-w-sm text-sm text-ink/60">
        Este enlace ha caducado o ya no está disponible. Pide uno nuevo a la
        persona que te lo envió.
      </p>
    </div>
  );
}
