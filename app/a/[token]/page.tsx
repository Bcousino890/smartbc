import type { Metadata } from "next";
import { Bath, BedDouble, Mail, MapPin, Ruler } from "lucide-react";
import Image from "next/image";
import {
  getParticularByShareToken,
  recordParticularShareOpen,
} from "@/lib/db/queries/particulares-shares";
import { ParticularHero } from "./particular-hero";

// Enlace temporal de UN particular (anuncio scrapeado, no ficha nuestra).
// Completamente aparte de /c (SmartLinks de `properties`) y /v (Viewing
// Collections) — ver migración 0149. `force-dynamic` porque el token
// resuelve contra la BD en cada visita (igual que /c/[token]).
//
// El SHELL visual (header, hero, tarjetas rounded-2xl/border-gold,
// tipografía crm-*) se copia deliberadamente del SmartLink real
// (app/compartir/[slug]/public-property-view.tsx) para que este enlace se
// sienta como los demás, no como una página aparte. El CONTENIDO no es un
// port 1:1: sin capítulos de story/vídeo/vecindario (no aplican a un
// anuncio scrapeado) y, sobre todo, SIN CTA de "solicitar visita"/WhatsApp/
// email hacia BC — este anuncio no es una ficha nuestra y BC no lo
// representa, así que ese CTA sería una representación falsa.
export const dynamic = "force-dynamic";

const BC_CONTACT_EMAIL = "contacto@bcousinoprop.com";

// Solo los campos "de escaparate" que devuelve getParticularByShareToken
// (ver el límite de privacidad documentado en lib/db/queries/particulares-shares.ts).
// No es la fuente de verdad del contrato — solo tipa lo que esta página lee.
type PublicParticular = {
  operation: "rent" | "sale" | null;
  price: number | null;
  zone: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  description: string | null;
  features: string[] | null;
  photos: Array<{ url: string; alt?: string }> | null;
  cover_url: string | null;
  portal: string | null;
};

function fmtPrice(price: number): string {
  return new Intl.NumberFormat("es-ES").format(price);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const resolved = await getParticularByShareToken(token);
  // Enlace temporal por definición: nunca se indexa, exista o no.
  const robots = { index: false, follow: false } as const;
  if (!resolved) {
    return { title: "Enlace no disponible", robots };
  }
  const p = resolved.particular as unknown as PublicParticular;
  const isRent = p.operation === "rent";
  const title =
    p.price != null
      ? `${fmtPrice(p.price)} €${isRent ? "/mes" : ""}${p.zone ? ` · ${p.zone}` : ""}`
      : "Anuncio compartido";
  return { title, robots };
}

export default async function ParticularSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await getParticularByShareToken(token);

  if (!resolved) {
    return <UnavailableView />;
  }

  // Registrar la apertura. Fire-and-forget: no bloqueamos el render si falla
  // (el visitante externo es la prioridad, no el contador).
  recordParticularShareOpen(resolved.shareId).catch(() => {});

  const p = resolved.particular as unknown as PublicParticular;
  const isRent = p.operation === "rent";
  const photos = (
    p.photos && p.photos.length > 0
      ? p.photos
      : p.cover_url
        ? [{ url: p.cover_url }]
        : []
  ).map((ph) => ph.url);

  // Sin título propio (no es una ficha nuestra): se sintetiza uno breve para
  // ocupar el mismo hueco visual que crm-page-title en un SmartLink real.
  const title = `${isRent ? "Alquiler" : "Venta"} de piso${p.zone ? ` en ${p.zone}` : ""}`;

  const facts: Array<{ label: string; value: string; icon: React.ReactNode }> = [];
  if (p.bedrooms != null) {
    facts.push({ label: "Dormitorios", value: String(p.bedrooms), icon: <BedDouble size={16} strokeWidth={1.75} /> });
  }
  if (p.bathrooms != null) {
    facts.push({ label: "Baños", value: String(p.bathrooms), icon: <Bath size={16} strokeWidth={1.75} /> });
  }
  if (p.square_meters != null) {
    facts.push({ label: "Superficie", value: `${p.square_meters} m²`, icon: <Ruler size={16} strokeWidth={1.75} /> });
  }

  return (
    <div className="smartlink-root min-h-screen bg-cream-50">
      <header className="border-b border-gold/15 bg-cream-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <Image
            src="/logo.png"
            alt="Benjamín Cousiño Propiedades"
            width={140}
            height={Math.round(140 * (519 / 3282))}
            priority
            className="h-auto w-[140px] select-none"
          />
          <a
            href={`mailto:${BC_CONTACT_EMAIL}`}
            className="hidden items-center gap-2 rounded-lg border border-ink/15 bg-white/80 px-3 py-2 crm-button text-ink/70 transition hover:border-gold/55 hover:text-ink md:inline-flex"
          >
            <Mail size={13} strokeWidth={1.75} className="text-gold" />
            <span>{BC_CONTACT_EMAIL}</span>
          </a>
        </div>
      </header>

      <ParticularHero photos={photos} title={title} />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 md:px-8">
        {/* Identidad + precio, mismo layout que el SmartLink real. */}
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
            {p.price != null && (
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

        {p.features && p.features.length > 0 && (
          <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
            <h2 className="crm-section-title text-ink">Características</h2>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {p.features.map((f, i) => (
                <span
                  key={i}
                  className="rounded-full border border-ink/10 bg-cream-50 px-2.5 py-1 text-xs text-ink/70"
                >
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

        <footer className="mt-8 pb-4 text-center crm-meta text-ink/45">
          © {new Date().getFullYear()} Benjamín Cousiño Propiedades · Madrid
          <br />
          <span className="crm-caption text-ink/30">
            Enlace temporal · válido por tiempo limitado
          </span>
        </footer>
      </main>
    </div>
  );
}

// Vista terminal: token inexistente o ya caducado. No se distingue el
// motivo — mismo criterio de privacidad que /v y /s (dar el mismo mensaje
// evita filtrar si un token concreto existió alguna vez).
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
