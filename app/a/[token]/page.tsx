import type { Metadata } from "next";
import {
  getParticularByShareToken,
  recordParticularShareOpen,
} from "@/lib/db/queries/particulares-shares";

// Enlace temporal de UN particular (anuncio scrapeado, no ficha nuestra).
// Completamente aparte de /c (SmartLinks de `properties`) y /v (Viewing
// Collections) — ver migración 0149. `force-dynamic` porque el token
// resuelve contra la BD en cada visita (igual que /c/[token]).
export const dynamic = "force-dynamic";

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

function fmtPrice(price: number, isRent: boolean): string {
  const n = new Intl.NumberFormat("es-ES").format(price);
  return isRent ? `${n} €/mes` : `${n} €`;
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
      ? `${fmtPrice(p.price, isRent)}${p.zone ? ` · ${p.zone}` : ""}`
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
  const photos =
    p.photos && p.photos.length > 0
      ? p.photos
      : p.cover_url
        ? [{ url: p.cover_url }]
        : [];

  return (
    <div className="smartlink-root min-h-screen bg-cream-50 text-ink">
      <header className="border-b border-ink/8 px-6 py-5 text-center">
        <p className="crm-label-sm text-ink/40">
          Benjamín Cousiño Propiedades
        </p>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {photos.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((ph, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={ph.url}
                alt={ph.alt ?? ""}
                loading={i === 0 ? "eager" : "lazy"}
                className={
                  i === 0
                    ? "col-span-2 aspect-[16/10] w-full rounded-lg object-cover sm:col-span-3"
                    : "aspect-[4/3] w-full rounded-lg object-cover"
                }
              />
            ))}
          </div>
        )}

        <div className="mb-6">
          {p.price != null && (
            <p className="crm-display text-ink">{fmtPrice(p.price, isRent)}</p>
          )}
          <p className="mt-1 text-sm text-ink/60">
            {isRent ? "Alquiler" : "Venta"}
            {p.zone ? ` · ${p.zone}` : ""}
          </p>
        </div>

        {(p.bedrooms != null || p.bathrooms != null || p.square_meters != null) && (
          <div className="mb-6 flex flex-wrap gap-4 border-y border-ink/8 py-4 text-sm text-ink/70">
            {p.bedrooms != null && <span>{p.bedrooms} hab.</span>}
            {p.bathrooms != null && <span>{p.bathrooms} baños</span>}
            {p.square_meters != null && <span>{p.square_meters} m²</span>}
          </div>
        )}

        {p.features && p.features.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 crm-label-sm text-ink/40">Características</p>
            <div className="flex flex-wrap gap-1.5">
              {p.features.map((f, i) => (
                <span
                  key={i}
                  className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-xs text-ink/70"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {p.description && (
          <div>
            <p className="mb-2 crm-label-sm text-ink/40">Descripción</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/75">
              {p.description}
            </p>
          </div>
        )}
      </main>

      <footer className="px-6 py-8 text-center">
        <p className="crm-caption text-ink/30">
          Enlace temporal · válido por tiempo limitado
        </p>
      </footer>
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
