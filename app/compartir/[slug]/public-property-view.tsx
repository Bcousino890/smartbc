"use client";

import {
  Bath,
  BedDouble,
  FileSignature,
  Mail,
  MapPin,
  Phone,
  Ruler,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { PropertyGallery } from "@/components/property-detail/property-gallery";
import { formatPrice } from "@/lib/format";
import { shareSlug } from "@/lib/share-slug";
import { detectVideoType, getYoutubeEmbedUrl, getVimeoEmbedUrl } from "@/lib/video-embed";
import type { Property } from "@/lib/types";
import { useAnalytics } from "@/hooks/use-analytics";

// URL pública de "SmartLink": vista limpia de la propiedad, sin login.
// Pensada para enviar a un cliente concreto por WhatsApp/email. Sin
// favoritos, sin solicitud de visita (esos requieren login). El cliente
// contacta a BC por los datos de la caja inferior.

const BC_CONTACT = {
  email: "contacto@bcousinoprop.com",
  // Para WhatsApp usamos el formato internacional sin espacios ni "+".
  phoneDisplay: "+34 694 20 97 63",
  phoneE164: "+34694209763",
  whatsapp: "34694209763",
};

// SVG inline del logo de WhatsApp (evita una dependencia extra).
function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7zm-7.01 15.24h-.01a8.21 8.21 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.7-.8-.23-.08-.39-.12-.56.13-.16.25-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43-.14-.01-.31-.01-.47-.01a.9.9 0 0 0-.66.31c-.23.25-.86.84-.86 2.06s.88 2.39 1 2.55c.12.16 1.74 2.66 4.21 3.73 1.71.74 2.38.79 3.04.7.4-.06 1.23-.5 1.41-.98.17-.49.17-.91.12-.99-.05-.08-.21-.13-.46-.25z" />
    </svg>
  );
}

export function PublicPropertyView({
  property,
  videos,
  plans,
  shareId,
}: {
  property: Property;
  // Videos y planos subidos por el admin (tabla property_media). Opcionales
  // para no romper otros usos del componente (p. ej. /c/[token]).
  videos?: Array<{ url: string; file_name?: string | null }>;
  plans?: Array<{ url: string; file_name?: string | null }>;
  shareId?: string;
}) {
  const trackerRef = useAnalytics({
    pageType: 'public_property',
    propertyId: property.id,
    shareId: shareId,
  });

  const isRent = property.operation === "alquiler";
  const price = formatPrice(property.price);
  // Enlace canónico al propio SmartLink (property.id es el slug) y referencia
  // NEUTRA de BC (BC-XXXX, no delata el portal de origen). Ambos van en el
  // mensaje de WhatsApp para que el cliente identifique el piso y BC sepa cuál.
  const portalUrl =
    process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.bcousinoprop.com";
  const shareUrl = `${portalUrl}/compartir/${shareSlug(property.id, property.bcReference)}`;
  // Referencia sin guion (BC0871) para un mensaje más corto y directo.
  const ref = property.bcReference?.replace(/-/g, "") ?? "";
  const waText = encodeURIComponent(
    `Hola, me interesa esta propiedad ${ref ? `${ref}, ` : ""}${property.title}\n${shareUrl}`,
  );
  const waLink = `https://wa.me/${BC_CONTACT.whatsapp}?text=${waText}`;

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Header sobrio con la marca BC */}
      <header className="border-b border-gold/15 bg-cream-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Benjamín Cousiño Propiedades"
              width={140}
              height={Math.round(140 * (519 / 3282))}
              priority
              className="h-auto w-[140px] select-none"
            />
          </div>
          <a
            href={`mailto:${BC_CONTACT.email}`}
            className="hidden items-center gap-2 rounded-lg border border-ink/15 bg-white/80 px-3 py-2 text-[12px] font-medium text-ink/70 transition hover:border-gold/55 hover:text-ink md:inline-flex"
          >
            <Mail size={13} strokeWidth={1.75} className="text-gold" />
            <span>{BC_CONTACT.email}</span>
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 md:px-8">
        {/* Galería principal — reutilizamos el componente del portal cliente */}
        <PropertyGallery
          property={property}
          onPhotoView={(index) => trackerRef.current?.trackPhotoView(index)}
        />

        {/* Cabecera de la propiedad: título + precio destacado */}
        <section className="mt-6 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-dark">
                  {[
                    isRent ? "Alquiler" : "Venta",
                    property.propertyTypeLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {property.bcReference && (
                  <span
                    className="rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-gold-dark"
                    aria-label={`Referencia interna ${property.bcReference}`}
                  >
                    Ref. {property.bcReference}
                  </span>
                )}
              </div>
              <h1 className="mt-2 font-serif text-3xl font-medium leading-tight text-ink md:text-4xl">
                {property.title}
              </h1>
              <div className="mt-3 inline-flex items-center gap-2 text-sm text-ink/65">
                <MapPin size={14} strokeWidth={1.75} className="text-gold" />
                <span>
                  {property.zone}
                  {property.city ? `, ${property.city}` : ""}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-left md:text-right">
              <p className="font-serif text-3xl font-medium text-ink md:text-4xl">
                {price} €
                {isRent && (
                  <span className="ml-1 text-base font-normal text-ink/55">
                    /mes
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Specs rápidos */}
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-gold/15 pt-5">
            <Spec
              icon={<BedDouble size={16} strokeWidth={1.75} />}
              label="Dormitorios"
              value={String(property.bedrooms)}
            />
            <Spec
              icon={<Bath size={16} strokeWidth={1.75} />}
              label="Baños"
              value={String(property.bathrooms)}
            />
            <Spec
              icon={<Ruler size={16} strokeWidth={1.75} />}
              label="Superficie"
              value={`${property.squareMeters} m²`}
            />
          </div>
        </section>

        {/* Descripción */}
        {property.longDescription && (
          <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
            <h2 className="font-serif text-2xl font-medium text-ink">
              Descripción
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink/75 md:text-base">
              {property.longDescription.split(/\n\n+/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        )}

        {/* Vídeo de la propiedad (subido desde /admin/publicacion) */}
        {videos && videos.length > 0 && (
          <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-2xl font-medium text-ink">
                {videos.length > 1 ? "Vídeos" : "Vídeo"}
              </h2>
              <span className="hidden text-[11px] uppercase tracking-[0.18em] text-gold-dark/70 sm:inline">
                Tour cinematográfico
              </span>
            </div>

            {/* Vídeo DESTACADO: reproducción automática en bucle, sin sonido y
                sin controles — presentación tipo showcase premium (EMAAR/DAMAC).
                El resto, en rejilla elegante con controles. */}
            <div className="mt-4">
              <PropertyVideoTile url={videos[0].url} featured />
            </div>
            {videos.length > 1 && (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {videos.slice(1).map((v) => (
                  <PropertyVideoTile key={v.url} url={v.url} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Plano de la vivienda (subido desde /admin/publicacion) */}
        {plans && plans.length > 0 && (
          <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
            <h2 className="font-serif text-2xl font-medium text-ink">
              {plans.length > 1 ? "Planos" : "Plano"}
            </h2>
            <div className="mt-4 space-y-4">
              {plans.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.url}
                  src={p.url}
                  alt="Plano de la vivienda"
                  className="w-full rounded-xl"
                  loading="lazy"
                />
              ))}
            </div>
          </section>
        )}

        {/* Características — agrupadas en exteriores / interior / servicios
            para que sea más fácil de leer que una lista plana. */}
        {property.featuresText && property.featuresText.length > 0 && (
          <FeaturesSection features={property.featuresText} />
        )}

        {/* Mapa: usa coords reales si las tenemos (geocoding cacheado);
            si no, cae a coords aproximadas del barrio. */}
        <ZoneMap
          zone={property.zone}
          lat={property.latitude ?? null}
          lng={property.longitude ?? null}
        />

        {/* Requisitos y servicios BC: informa al cliente de las
            condiciones generales (fianza/garantías) y del valor añadido
            de BC (Personal Shopper). Sin cifras concretas — las
            condiciones se acuerdan al cerrar la operación. */}
        <RequirementsAndServices isRent={isRent} />

        {/* Contacto BC */}
        <section
          id="contacto"
          className="mt-5 rounded-2xl border border-gold/25 bg-ink p-6 text-cream-50 shadow-[0_25px_50px_-25px_rgba(40,28,10,0.6)] md:p-8"
        >
          <h2 className="font-serif text-2xl font-medium">
            ¿Te interesa esta propiedad?
          </h2>
          <p className="mt-2 text-sm text-cream-50/75">
            Te atendemos de forma personalizada. Contáctanos para más
            información, visitas y todas las propiedades de tu interés.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackerRef.current?.trackContactClick('whatsapp')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#1ebd5b]"
            >
              <WhatsAppIcon size={16} />
              <span>WhatsApp</span>
            </a>
            <a
              href={`mailto:${BC_CONTACT.email}?subject=Consulta: ${encodeURIComponent(
                property.title,
              )}`}
              onClick={() => trackerRef.current?.trackContactClick('email')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-medium text-ink transition hover:bg-gold-dark"
            >
              <Mail size={15} strokeWidth={1.75} />
              <span>Email</span>
            </a>
            <a
              href={`tel:${BC_CONTACT.phoneE164}`}
              onClick={() => trackerRef.current?.trackContactClick('phone')}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-cream-50/30 bg-cream-50/5 px-5 py-3 text-sm font-medium text-cream-50 transition hover:bg-cream-50/10"
            >
              <Phone size={15} strokeWidth={1.75} />
              <span>{BC_CONTACT.phoneDisplay}</span>
            </a>
          </div>
        </section>

        <footer className="mt-8 pb-24 text-center text-[11px] text-ink/45 md:pb-0">
          © {new Date().getFullYear()} Benjamín Cousiño Propiedades · Madrid
        </footer>
      </main>

      {/* Barra de contacto sticky solo en móvil — clave para conversión:
          siempre visible mientras se hace scroll por la propiedad. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/20 bg-cream-50/95 px-3 py-2 shadow-[0_-10px_25px_-15px_rgba(40,28,10,0.3)] backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contactar por WhatsApp"
            onClick={() => trackerRef.current?.trackContactClick('whatsapp')}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 py-2.5 text-sm font-medium text-white"
          >
            <WhatsAppIcon size={15} />
            <span>WhatsApp</span>
          </a>
          <a
            href={`mailto:${BC_CONTACT.email}?subject=Consulta: ${encodeURIComponent(
              property.title,
            )}`}
            aria-label="Contactar por email"
            onClick={() => trackerRef.current?.trackContactClick('email')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gold text-ink"
          >
            <Mail size={15} strokeWidth={1.75} />
          </a>
          <a
            href={`tel:${BC_CONTACT.phoneE164}`}
            aria-label="Llamar por teléfono"
            onClick={() => trackerRef.current?.trackContactClick('phone')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ink/15 bg-white/90 text-ink/75"
          >
            <Phone size={15} strokeWidth={1.75} />
          </a>
        </div>
      </div>
    </div>
  );
}

function Spec({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-gold">{icon}</span>
      <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-ink/55">
        {label}
      </p>
      <p className="mt-0.5 font-medium text-ink">{value}</p>
    </div>
  );
}

// Agrupa las features que extrae el scraper en dos bloques:
// - "Edificio y zonas comunes": elementos compartidos del inmueble.
// - "Piso": características propias de la vivienda.
// La orientación se trata aparte (no es una feature binaria, ver Spec).
const FEATURE_GROUPS: Array<{
  title: string;
  match: RegExp;
}> = [
  {
    title: "Edificio y zonas comunes",
    match: /ascensor|portero|garaje|trastero|piscina|jard[ií]n/i,
  },
  {
    title: "Piso",
    match: /terraza|balc[oó]n|aire|calefacc|reformad|amueblad/i,
  },
];

// Tarjeta de vídeo del SmartLink. `featured` = presentación cinematográfica:
// reproducción automática en bucle, SIEMPRE sin sonido y sin controles (estilo
// showcase premium tipo EMAAR/DAMAC). El resto: rejilla con controles, también
// mutados. Los vídeos de Idealista traen música: nunca deben sonar.
function PropertyVideoTile({
  url,
  featured = false,
}: {
  url: string;
  featured?: boolean;
}) {
  const info = detectVideoType(url);
  const cardCls =
    "group relative overflow-hidden rounded-2xl border border-gold/25 bg-black shadow-[0_25px_60px_-30px_rgba(40,28,10,0.55)] ring-1 ring-inset ring-white/5";

  if (info.type === "youtube" && info.id) {
    const src = featured
      ? `${getYoutubeEmbedUrl(info.id)}&mute=1&autoplay=1&loop=1&playlist=${info.id}&controls=0&modestbranding=1&playsinline=1`
      : `${getYoutubeEmbedUrl(info.id)}&mute=1`;
    return (
      <div className={cardCls}>
        <iframe
          src={src}
          className="aspect-video w-full"
          allow="autoplay; fullscreen"
          allowFullScreen
          loading="lazy"
          title="Vídeo de la propiedad"
        />
      </div>
    );
  }

  if (info.type === "vimeo" && info.id) {
    // background=1 en Vimeo = autoplay + loop + muted + sin controles (ambiente).
    const src = featured
      ? `${getVimeoEmbedUrl(info.id)}?background=1&muted=1&autoplay=1&loop=1`
      : `${getVimeoEmbedUrl(info.id)}?muted=1`;
    return (
      <div className={cardCls}>
        <iframe
          src={src}
          className="aspect-video w-full"
          allow="autoplay; fullscreen"
          allowFullScreen
          loading="lazy"
          title="Vídeo de la propiedad"
        />
      </div>
    );
  }

  // Archivo directo (mp4/webm), típico de Idealista.
  return (
    <div className={cardCls}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={(el) => {
          if (el) el.muted = true;
        }}
        muted
        playsInline
        autoPlay={featured}
        loop={featured}
        controls={!featured}
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onVolumeChange={(e) => {
          const el = e.currentTarget;
          if (!el.muted) el.muted = true;
        }}
        className={
          featured
            ? "aspect-video w-full bg-black object-cover"
            : "aspect-video w-full bg-black object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        }
        // #t=0.5 → el navegador muestra el fotograma a 0,5s como "portada" del
        // vídeo (sin descargarlo entero), en vez de pantalla negra. Así el
        // usuario ve una imagen del piso y le entran ganas de pulsar.
        src={featured ? url : `${url}#t=0.5`}
      />
      {featured && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
      )}
    </div>
  );
}

function FeaturesSection({ features }: { features: string[] }) {
  // "Orientación" no es una característica binaria — se muestra en Specs.
  const visible = features.filter((f) => !/orientaci[oó]n/i.test(f));
  if (visible.length === 0) return null;

  const groups = FEATURE_GROUPS.map((g) => ({
    title: g.title,
    items: visible.filter((f) => g.match.test(f)),
  }));
  const usedKeys = new Set(groups.flatMap((g) => g.items));
  const others = visible.filter((f) => !usedKeys.has(f));
  const populated = groups.filter((g) => g.items.length > 0);

  return (
    <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
      <h2 className="font-serif text-2xl font-medium text-ink">
        Características
      </h2>
      <div className="mt-5 space-y-5">
        {populated.map((g) => (
          <FeatureBlock key={g.title} title={g.title} items={g.items} />
        ))}
        {others.length > 0 && (
          <FeatureBlock title="Otros" items={others} />
        )}
      </div>
    </section>
  );
}

// Coordenadas y bounding box aproximados de las zonas que cubrimos. Se
// usa para centrar el iframe de OpenStreetMap sin revelar la dirección
// exacta. Si la zona no aparece aquí, caemos a Madrid centro.
const ZONE_COORDS: Record<
  string,
  { lat: number; lng: number; zoom: number }
> = {
  Salamanca: { lat: 40.4264, lng: -3.684, zoom: 15 },
  Chamberí: { lat: 40.4378, lng: -3.704, zoom: 15 },
  Retiro: { lat: 40.4151, lng: -3.6814, zoom: 15 },
  Pozuelo: { lat: 40.4337, lng: -3.8087, zoom: 14 },
  Chamartín: { lat: 40.4607, lng: -3.6772, zoom: 14 },
  Centro: { lat: 40.4168, lng: -3.7038, zoom: 15 },
  "La Moraleja": { lat: 40.5197, lng: -3.6332, zoom: 14 },
};

function ZoneMap({
  zone,
  lat,
  lng,
}: {
  zone: string;
  lat: number | null;
  lng: number | null;
}) {
  // Si tenemos coordenadas geocodificadas para esta propiedad concreta,
  // usamos un zoom más cercano (calle). Si caemos al barrio entero (ZONE
  // hardcoded), usamos el zoom de barrio.
  const hasPreciseCoords = lat != null && lng != null;
  const fallback = ZONE_COORDS[zone] ?? { lat: 40.4168, lng: -3.7038, zoom: 14 };
  // Con coordenadas exactas mostramos el punto real con marcador y zoom de
  // calle. Sin ellas, caemos al centro del barrio (aproximado).
  const coords = hasPreciseCoords ? { lat: lat!, lng: lng!, zoom: 16 } : fallback;
  const delta = hasPreciseCoords ? 0.0025 : 0.012;
  const bbox = [
    coords.lng - delta,
    coords.lat - delta * 0.6,
    coords.lng + delta,
    coords.lat + delta * 0.6,
  ].join(",");
  // Con coords exactas: marcador (pin) en el punto real. Sin ellas: sin
  // marcador y un círculo CSS que indica la zona aproximada del barrio.
  const src = hasPreciseCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${coords.lat},${coords.lng}`
    : `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
  const externalLink = `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=${coords.zoom}/${coords.lat}/${coords.lng}`;
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-gold/20 bg-white/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm">
      <div className="px-6 pt-6 md:px-8 md:pt-8">
        <h2 className="font-serif text-2xl font-medium text-ink">
          Ubicación · {zone}
        </h2>
        <p className="mt-1 text-[12px] text-ink/55">
          {hasPreciseCoords
            ? "Ubicación exacta de la propiedad."
            : "Zona aproximada del barrio. Te pasaremos la dirección exacta al coordinar la visita."}
        </p>
      </div>
      <div className="relative mt-4 aspect-[4/3] w-full md:aspect-[16/10]">
        <iframe
          title={`Mapa de ${zone}`}
          src={src}
          className={`h-full w-full border-0 ${hasPreciseCoords ? "" : "pointer-events-none"}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        {/* Sin coords exactas: círculo CSS sobre el centro del barrio para
            indicar zona aproximada. Con coords exactas se ve el pin real del
            iframe, así que no ponemos círculo. */}
        {!hasPreciseCoords && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-32 w-32 rounded-full border-2 border-gold/80 bg-gold/15 shadow-[0_0_0_4px_rgba(212,175,127,0.18)] md:h-40 md:w-40" />
          </div>
        )}
      </div>
      <div className="px-6 py-3 md:px-8">
        <a
          href={externalLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-gold-dark hover:underline"
        >
          Ver mapa en pantalla completa ↗
        </a>
      </div>
    </section>
  );
}

// Bloque de requisitos generales (fianza/garantías) + servicios BC. Las
// cifras concretas se acuerdan al cerrar la operación, así que aquí solo
// se informa de la existencia de estos puntos. La parte de Personal
// Shopper es el valor diferencial de BC frente a anunciar el piso a pelo.
function RequirementsAndServices({ isRent }: { isRent: boolean }) {
  return (
    <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-7">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-gold-dark">
            <FileSignature size={17} strokeWidth={1.75} />
          </span>
          <h2 className="font-serif text-xl font-medium text-ink md:text-2xl">
            Requisitos
          </h2>
        </div>
        <ul className="mt-4 space-y-3 text-sm text-ink/75">
          {isRent ? (
            <>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">
                    Fianza legal
                  </strong>{" "}
                  según ley (LAU). Se entrega al firmar el contrato.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">
                    Garantías adicionales
                  </strong>{" "}
                  según perfil del inquilino (aval, seguro de impago o
                  meses adicionales). Lo acordamos contigo en la visita.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">
                    Documentación
                  </strong>
                  : DNI/NIE, nóminas o justificantes de ingresos y
                  declaración de renta del último año.
                </span>
              </li>
            </>
          ) : (
            <>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">
                    Reserva
                  </strong>{" "}
                  al aceptar oferta. El importe se descuenta del precio
                  final.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">
                    Arras
                  </strong>{" "}
                  al firmar contrato privado. Habitualmente un 10% del
                  precio.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">
                    Documentación
                  </strong>
                  : DNI/NIE, justificante de fondos y, si aplica, oferta
                  vinculante del banco.
                </span>
              </li>
            </>
          )}
        </ul>
        <p className="mt-4 text-[11px] text-ink/55">
          Importes concretos a coordinar con tu agente BC al planificar la
          visita.
        </p>
      </div>

      <div className="rounded-2xl border border-gold/35 bg-ink p-6 text-cream-50 shadow-[0_25px_50px_-25px_rgba(40,28,10,0.55)] md:p-7">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/20 text-gold">
            <Sparkles size={17} strokeWidth={1.75} />
          </span>
          <h2 className="font-serif text-xl font-medium md:text-2xl">
            Personal Shopper Inmobiliario
          </h2>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-cream-50/80">
          En Benjamín Cousiño Propiedades no solo enseñamos pisos: te
          acompañamos en todo el proceso como tu Personal Shopper
          inmobiliario.
        </p>
        <ul className="mt-4 space-y-2.5 text-sm text-cream-50/85">
          <li className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
            <span>Búsqueda a medida y filtrado de propiedades reales.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
            <span>Visitas coordinadas en una sola jornada si lo necesitas.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
            <span>Negociación de precio y condiciones en tu nombre.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
            <span>
              Asesoramiento fiscal y contractual hasta la firma.
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}

function FeatureBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-dark">
        {title}
      </p>
      <ul className="mt-2 grid grid-cols-1 gap-2 text-sm text-ink/75 sm:grid-cols-2 md:grid-cols-3">
        {items.map((f) => (
          <li
            key={f}
            className="inline-flex items-center gap-2 rounded-lg border border-gold/15 bg-cream-50/85 px-3 py-2"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
