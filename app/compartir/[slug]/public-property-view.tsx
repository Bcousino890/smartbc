"use client";

import {
  Bath,
  BedDouble,
  Building2,
  CalendarCheck,
  FileSignature,
  Layers,
  Mail,
  MapPin,
  Maximize2,
  Phone,
  Play,
  Ruler,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { PropertyGallery } from "@/components/property-detail/property-gallery";
import { formatPrice } from "@/lib/format";
import { shareSlug } from "@/lib/share-slug";
import { detectVideoType, getYoutubeEmbedUrl, getVimeoEmbedUrl } from "@/lib/video-embed";
import { splitDescriptionForFactsLed } from "@/lib/services/story/fallback";
import { isMicroChapter, microChapterFact } from "@/lib/services/story/micro-chapter";
import { heroSrcSet } from "./hero-srcset";
import { CHAPTER_HEADINGS, type PublicStoryBlock, type StoryChapter } from "@/lib/services/story/types";
import { groupFeatures } from "@/lib/property-features-taxonomy";
import { ATICO_FLOOR } from "@/lib/floor";
import type { PoiTravel } from "@/lib/geo/poi-distance";
import type { Property } from "@/lib/types";
import { useAnalytics } from "@/hooks/use-analytics";
import { LocationModule } from "./location-module";
import type { NearbyUniversity } from "@/lib/geo/universities-nearby";
import type { MapProvider } from "@/lib/services/location/provider";

// ============================================================================
// SMARTLINK 2.0 · Adaptive Property Renderer
// ----------------------------------------------------------------------------
// Un solo renderer para /compartir/[slug] y /c/[token] que elige módulos según
// datos VERIFICADOS (nunca headings vacíos ni placeholders):
//   hero media → identidad → key facts → intro/capítulos del story aprobado →
//   recorrido en vídeo → detalles agrupados → plano → vivir en {barrio} →
//   ubicación+POIs → condiciones → servicio BCP → contacto.
// Sin story aprobado: fallback determinista (bloques ≤70 palabras) — el resto
// del 2.0 funciona igual. Disciplina narrativa EMAAR, jerarquía de media
// DAMAC, capa de servicio BCP.
// ============================================================================

const BC_CONTACT = {
  email: "contacto@bcousinoprop.com",
  phoneDisplay: "+34 694 20 97 63",
  phoneE164: "+34694209763",
  whatsapp: "34694209763",
};

export type VideoMedia = {
  url: string;
  file_name?: string | null;
  source?: string | null;
  format?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  posterUrl?: string | null;
  /** Marcado por un humano (property_media.has_watermark): nunca hero. */
  hasWatermark?: boolean | null;
};

export type NeighborhoodData = {
  displayName: string;
  intro: string;
  pois: PoiTravel[];
  district?: string | null;
  municipality?: string | null;
};

// Qué clases de foto alimentan cada capítulo (regla foto→capítulo del sprint:
// jamás una cocina ilustrada con un dormitorio "por necesidad visual").
const CHAPTER_PHOTO_CLASSES: Record<StoryChapter, string[]> = {
  overview: [],
  living: ["living_room", "dining"],
  kitchen: ["kitchen"],
  private: ["bedroom", "bathroom"],
  outdoor: ["terrace_outdoor", "garden", "pool", "view"],
  // Sin clase de foto propia para acabados: mejor bloque solo-texto que
  // reutilizar un salón que no aporta información (decisión del piloto).
  finishes: [],
  // "LA FINCA" habla del INMUEBLE: fachada, portal, zaguán, patio, entrada y
  // zonas comunes. Nada de calle, edificios vecinos, monumentos ni skyline —
  // eso es `street_context`, y su sitio es el barrio, no la finca. Antes las
  // dos cosas compartían clase (`facade_building` incluía "calle"), y por eso
  // aparecían iglesias y fachadas ajenas encabezando el capítulo.
  building: ["facade_building"],
  barrio: ["street_context", "view"],
};

const CHAPTER_ORDER: StoryChapter[] = [
  "living",
  "kitchen",
  "private",
  "outdoor",
  "finishes",
  "building",
];

// Hero-vídeo (decisión D4): manual + directo + horizontal + metadata válida.
// Los externos (YouTube/Vimeo) no son hero-safe en v1; los auto son signature;
// un vertical jamás se fuerza a 16:9.
function pickHeroVideo(videos: VideoMedia[]): VideoMedia | null {
  return (
    videos.find((v) => {
      if (v.source !== "manual") return false;
      // Vídeo con marca de agua marcado por un humano: jamás de portada.
      if (v.hasWatermark) return false;
      if (detectVideoType(v.url).type !== "direct") return false;
      if (!v.width || !v.height || v.width < v.height) return false;
      if (v.format === "vertical") return false;
      if (v.width < 960) return false;
      if (v.durationSeconds != null && v.durationSeconds > 180) return false;
      return true;
    }) ?? null
  );
}

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7zm-7.01 15.24h-.01a8.21 8.21 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.7-.8-.23-.08-.39-.12-.56.13-.16.25-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43-.14-.01-.31-.01-.47-.01a.9.9 0 0 0-.66.31c-.23.25-.86.84-.86 2.06s.88 2.39 1 2.55c.12.16 1.74 2.66 4.21 3.73 1.71.74 2.38.79 3.04.7.4-.06 1.23-.5 1.41-.98.17-.49.17-.91.12-.99-.05-.08-.21-.13-.46-.25z" />
    </svg>
  );
}

export function PublicPropertyView({
  property,
  videos,
  plans,
  shareId,
  publicUrl,
  story,
  prelude,
  preludeHeadline,
  neighborhood,
  universities,
  mapProvider,
  experienceState,
}: {
  property: Property;
  videos?: VideoMedia[];
  plans?: Array<{ url: string; file_name?: string | null }>;
  shareId?: string;
  // URL pública REAL de esta página. Desde /c/[token] llega la URL tokenizada
  // para que el reenvío por WhatsApp conserve el tracking (fix del sprint).
  publicUrl?: string;
  story?: PublicStoryBlock[] | null;
  /** Apertura editorial aprobada (Property Prelude). Sustituye al overview
   *  como comienzo del libro de la vivienda; nunca conviven los dos. */
  prelude?: string | null;
  /** Titular editorial del spread (columna izquierda). Opcional: sin él la
   *  banda se compone igual, solo con el eyebrow. */
  preludeHeadline?: string | null;
  neighborhood?: NeighborhoodData | null;
  /** Universidades cercanas (catálogo existente, mismo cálculo de tiempos). */
  universities?: NearbyUniversity[];
  /** Proveedor del explorador de zona. Sin credenciales de Google → "osm". */
  mapProvider?: MapProvider;
  /** Estado de EXPERIENCIA (no de Property Story): complete | partial |
   *  sparse llegan de una story aprobada; facts_led = estructura 2.0 sin
   *  narrativa aprobada. Solo alimenta analytics — el render se decide por
   *  los datos que llegan. */
  experienceState?: "complete" | "partial" | "sparse" | "facts_led";
}) {
  // property.id en el DTO público ES el slug (nunca se expone el UUID):
  // se manda como propertySlug y el servidor lo resuelve a property_id.
  // Mandarlo como propertyId era el 500 que perdía los page views.
  const trackerRef = useAnalytics({
    pageType: "public_property",
    propertySlug: property.id,
    shareId: shareId,
    experienceState,
  });

  const isRent = property.operation === "alquiler";
  const price = formatPrice(property.price);
  const portalUrl =
    process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.bcousinoprop.com";
  const shareUrl =
    publicUrl ??
    `${portalUrl}/compartir/${shareSlug(property.id, property.bcReference)}${
      property.hasBothOperations ? `?op=${isRent ? "rent" : "sale"}` : ""
    }`;
  const ref = property.bcReference?.replace(/-/g, "") ?? "";
  const waText = encodeURIComponent(
    `Hola, me interesa esta propiedad ${ref ? `${ref}, ` : ""}${property.title}\n${shareUrl}`,
  );
  const waLink = `https://wa.me/${BC_CONTACT.whatsapp}?text=${waText}`;
  const visitMail = `mailto:${BC_CONTACT.email}?subject=${encodeURIComponent(
    `Solicitar visita: ${property.title}${ref ? ` (${ref})` : ""}`,
  )}&body=${encodeURIComponent(`Hola, me gustaría visitar esta propiedad:\n${shareUrl}`)}`;

  // ── Media: hero + signature + verticales ──
  const allVideos = videos ?? [];
  const heroVideo = useMemo(() => pickHeroVideo(allVideos), [allVideos]);
  const horizontalVideos = allVideos.filter(
    (v) => v !== heroVideo && v.format !== "vertical",
  );
  const verticalVideos = allVideos.filter((v) => v.format === "vertical");

  // ── Story: intro + capítulos + barrio ──
  const blocks = story ?? null;
  // §17: una sola responsabilidad. Con prelude aprobado, el overview calla —
  // queda como capa de evidencia en admin. Sin prelude, el overview sigue
  // haciendo de intro como hasta ahora.
  const intro = prelude ? null : (blocks?.find((b) => b.chapter === "overview") ?? null);
  // El cuerpo llega con los párrafos separados por líneas en blanco: el
  // spread los renderiza como bloques con aire, no como un muro de texto.
  const preludeParagraphs = (prelude ?? "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // §9 · REGLA DE MICRO-CAPÍTULO (presentación, no validación).
  // Un capítulo que solo dice un dato suelto ("Finca construida en 1941.") no
  // sostiene una banda entera con su rótulo: el hecho se enseña en Detalles y
  // el capítulo desaparece. El dato NO se pierde ni se relaja ningún
  // invariante — solo cambia de sitio.
  const allChapterBlocks = (blocks ?? []).filter((b) => CHAPTER_ORDER.includes(b.chapter));
  const chapterBlocks = allChapterBlocks.filter((b) => !isMicroChapter(b.chapter, b.copy));
  const movedFacts = allChapterBlocks
    .filter((b) => isMicroChapter(b.chapter, b.copy))
    .map((b) => microChapterFact(b.copy))
    .filter(Boolean);
  const barrioBlock = blocks?.find((b) => b.chapter === "barrio") ?? null;

  // Asignación foto→capítulo: primera foto con clase compatible aún no usada.
  // La foto 0 (portada/hero) se reserva. Sin clases (fotos sin clasificar) no
  // se asigna nada: capítulo compacto solo-texto, nunca una foto incorrecta.
  const chapterPhotos = useMemo(() => {
    const used = new Set<number>([0]);
    const photos = property.photos ?? [];
    const classes = property.photoClasses ?? [];
    const marked = property.photoWatermarked ?? [];
    const map = new Map<StoryChapter, string>();
    for (const block of chapterBlocks) {
      const wanted = CHAPTER_PHOTO_CLASSES[block.chapter];
      const candidates = photos
        .map((_, i) => i)
        .filter((i) => !used.has(i) && classes[i] != null && wanted.includes(classes[i]!));
      // Entre las candidatas de la clase correcta, primero las limpias: una
      // foto con el logo de otro portal encabezando un capítulo es lo menos
      // premium que puede pasar. Si TODAS están marcadas se usa igualmente la
      // primera — mejor una foto marcada que un capítulo mutilado.
      const idx = candidates.find((i) => !marked[i]) ?? candidates[0];
      if (idx != null) {
        used.add(idx);
        map.set(block.chapter, photos[idx]);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, property.photos, property.photoClasses, property.photoWatermarked]);

  // Capítulos partidos en dos tandas: el vídeo signature entra tras el 2º
  // (patrón DAMAC medido: el film a media página, nunca al final). El corte
  // se hace sobre las FILAS ya compuestas, para no partir en dos una pareja
  // de capítulos solo-texto.
  const chapterRows = buildChapterRows(chapterBlocks, chapterPhotos);
  const firstRows = chapterRows.slice(0, 2);
  const restRows = chapterRows.slice(2);

  // FACTS-LED sin capítulos limpios: descripción legible bajo "Información
  // de la vivienda" — splitter determinista ≤70 palabras, frases de agencia
  // conocidas excluidas, y si el texto es extremadamente pobre el módulo se
  // omite entero. Nada inventado, ningún heading temático.
  const fallbackBlocks = useMemo(
    () =>
      !blocks && property.longDescription
        ? splitDescriptionForFactsLed(property.longDescription)
        : [],
    [blocks, property.longDescription],
  );

  // ── Galería (lightbox controlada desde el hero) ──
  const [galleryOpenAt, setGalleryOpenAt] = useState<number | null>(null);

  // ── Scroll depth 25/50/75/90 (una vez por checkpoint) ──
  const firedDepths = useRef(new Set<number>());
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const depth =
        ((window.scrollY + window.innerHeight) / el.scrollHeight) * 100;
      for (const cp of [25, 50, 75, 90]) {
        if (depth >= cp && !firedDepths.current.has(cp)) {
          firedDepths.current.add(cp);
          trackerRef.current?.trackScroll(cp);
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [trackerRef]);

  const facts = buildKeyFacts(property);
  const detailGroups = useMemo(
    () => groupFeatures((property.featuresText ?? []).filter((f) => !/orientaci[oó]n/i.test(f))),
    [property.featuresText],
  );

  const trackVisit = () => trackerRef.current?.trackVisitRequest();

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
            href={`mailto:${BC_CONTACT.email}`}
            className="hidden items-center gap-2 rounded-lg border border-ink/15 bg-white/80 px-3 py-2 crm-button text-ink/70 transition hover:border-gold/55 hover:text-ink md:inline-flex"
          >
            <Mail size={13} strokeWidth={1.75} className="text-gold" />
            <span>{BC_CONTACT.email}</span>
          </a>
        </div>
      </header>

      {/* 01 · HERO MEDIA — vídeo manual apto o portada, full-bleed. */}
      <HeroMedia
        heroVideo={heroVideo}
        coverImage={property.image ?? property.photos?.[0] ?? null}
        coverWidth={property.coverWidth ?? null}
        title={property.title}
        photoCount={property.photos?.length ?? 0}
        onOpenGallery={() => {
          trackerRef.current?.trackEvent("photo_gallery_open");
          setGalleryOpenAt(0);
        }}
        onHeroPlay={() => trackerRef.current?.trackEvent("hero_video_play")}
        onProgress={(q) => trackerRef.current?.trackEvent("video_progress", { quarter: q, video: "hero" })}
      />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 md:px-8">
        {/* 02 · IDENTIDAD + 03 · KEY FACTS */}
        <section className="rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="crm-label text-gold-dark">
                  {[isRent ? "Alquiler" : "Venta", property.propertyTypeLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {property.bcReference && (
                  <span
                    className="rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-bold tracking-wider text-gold-dark"
                    aria-label={`Referencia interna ${property.bcReference}`}
                  >
                    Ref. {property.bcReference}
                  </span>
                )}
              </div>
              <h1 className="crm-page-title mt-2 text-ink">{property.title}</h1>
              <div className="mt-3 inline-flex items-center gap-2 text-sm text-ink/65">
                <MapPin size={14} strokeWidth={1.75} className="text-gold" />
                <span>
                  {property.zone}
                  {property.city ? `, ${property.city}` : ""}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-left md:text-right">
              <p className="crm-number text-3xl text-ink md:text-4xl">
                {price} €
                {isRent && (
                  <span className="ml-1 text-base font-normal text-ink/55">/mes</span>
                )}
              </p>
              {/* Conversión TOP (modelo EMAAR contenido): visita + WhatsApp */}
              <div className="mt-4 flex gap-2 md:justify-end">
                <a
                  href="#contacto"
                  onClick={trackVisit}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 crm-button text-cream-50 transition hover:bg-ink-soft"
                >
                  <CalendarCheck size={14} strokeWidth={1.75} />
                  <span>Solicitar visita</span>
                </a>
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackerRef.current?.trackContactClick("whatsapp")}
                  aria-label="WhatsApp"
                  className="inline-flex items-center justify-center rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-[#1ebd5b] transition hover:border-gold/50"
                >
                  <WhatsAppIcon size={17} />
                </a>
              </div>
            </div>
          </div>

          {/* 03 · KEY FACTS — hechos verificados fuera de la prosa. */}
          <div className="mt-6 flex gap-3 overflow-x-auto border-t border-gold/15 pt-5 md:grid md:grid-cols-4 lg:grid-cols-5">
            {facts.map((f) => (
              <div
                key={f.label}
                className="flex min-w-[104px] flex-col items-center text-center"
              >
                <span className="text-gold">{f.icon}</span>
                <p className="crm-label-sm mt-1 text-ink/55">{f.label}</p>
                <p className="mt-0.5 font-medium text-ink">{f.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 04 · INTRO editorial (solo story aprobado). */}
        {/* PROPERTY PRELUDE · apertura editorial. Sin card, sin borde, sin
            heading: el comienzo de un libro, no una ficha. Cuerpo mayor que
            el copy de capítulo, interlineado generoso y ancho de lectura. */}
        {prelude && blocks && (
          <section className="bcp-prelude-spread mx-auto mt-12 max-w-[71rem] px-1 md:mt-20">
            <div className="md:flex md:items-start md:gap-12 lg:gap-16">
              {/* Columna izquierda (35-40%): eyebrow + titular editorial. */}
              <div className="md:w-[36%] md:shrink-0">
                <p className="crm-label-sm text-gold-dark">La residencia</p>
                {preludeHeadline && (
                  <h2 className="bcp-prelude-headline mt-3 text-ink md:mt-4">{preludeHeadline}</h2>
                )}
              </div>
              {/* Columna derecha (60-65%): el prelude, en medida de lectura. */}
              <div className="mt-6 md:mt-0 md:w-[64%] md:max-w-[45rem]">
                {preludeParagraphs.map((p, i) => (
                  <p key={i} className={`bcp-prelude text-ink/85${i > 0 ? " mt-5" : ""}`}>
                    {p}
                  </p>
                ))}
              </div>
            </div>
          </section>
        )}

        {intro && (
          <section className="mx-auto mt-8 max-w-3xl px-1 text-center">
            <p className="text-lg leading-relaxed text-ink/80">{intro.copy}</p>
          </section>
        )}

        {/* 05-10 · CAPÍTULOS (primera tanda) */}
        {firstRows.length > 0 && (
          <StoryChapters
            rows={firstRows}
            onView={(ch) => trackerRef.current?.trackEvent("story_chapter_view", { chapter: ch })}
          />
        )}

        {/* 11 · RECORRIDO EN VÍDEO (signature) — tras los primeros capítulos,
            nunca enterrado al final. Si el hero ya es vídeo, los demás vídeos
            horizontales siguen aquí como material adicional. */}
        {horizontalVideos.length > 0 && (
          <SignatureVideo
            videos={horizontalVideos}
            muteAutoplay={heroVideo == null}
            onPlay={(i) => trackerRef.current?.trackVideoPlay(i)}
            onProgress={(q) => trackerRef.current?.trackEvent("video_progress", { quarter: q, video: "signature" })}
          />
        )}

        {/* Conversión MID tras el momento fuerte de media/story. */}
        {(firstRows.length > 0 || horizontalVideos.length > 0 || heroVideo) && (
          <div className="mt-8 text-center">
            <a
              href="#contacto"
              onClick={trackVisit}
              className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-5 py-3 crm-button text-gold-dark transition hover:bg-gold/20"
            >
              <CalendarCheck size={14} strokeWidth={1.75} />
              <span>Organizar una visita privada</span>
            </a>
          </div>
        )}

        {/* Capítulos restantes */}
        {restRows.length > 0 && (
          <StoryChapters
            rows={restRows}
            onView={(ch) => trackerRef.current?.trackEvent("story_chapter_view", { chapter: ch })}
          />
        )}

        {/* Vídeo VERTICAL: contenedor propio 9:16, jamás recortado a 16:9. */}
        {verticalVideos.length > 0 && (
          <VerticalVideos
            videos={verticalVideos}
            onPlay={(i) => trackerRef.current?.trackVideoPlay(i)}
          />
        )}

        {/* FACTS-LED · 04 NARRATIVE CONTENT (variante sin capítulos): la
            descripción como lectura cómoda, nunca como muro. Heading genérico
            — los temáticos solo existen con evidencia del story. */}
        {!blocks && fallbackBlocks.length > 0 && (
          <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
            <h2 className="crm-section-title text-ink">Información de la vivienda</h2>
            <div className="mt-4 max-w-3xl space-y-4 text-base leading-relaxed text-ink/75">
              {fallbackBlocks.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        )}

        {/* 12 · DETALLES DE LA VIVIENDA — taxonomía determinista. */}
        {(detailGroups.length > 0 || movedFacts.length > 0) && (
          <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
            <h2 className="crm-section-title text-ink">Detalles de la vivienda</h2>
            <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3">
              {detailGroups.map((g) => (
                <div key={g.group}>
                  <p className="crm-label-sm text-gold-dark">{g.label}</p>
                  <ul className="mt-2 space-y-2 text-sm text-ink/75">
                    {g.items.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {/* Datos rescatados de capítulos que no daban para capítulo. Van
                en frase, no en viñeta: no son etiquetas de taxonomía. */}
            {movedFacts.length > 0 && (
              <div className="mt-6 border-t border-gold/15 pt-5">
                <ul className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm text-ink/75 md:grid-cols-2">
                  {movedFacts.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* 13 · PLANO — preview grande + fullscreen + plan_view. */}
        {plans && plans.length > 0 && (
          <FloorPlans
            plans={plans}
            onView={(i) => trackerRef.current?.trackPlanView(i)}
          />
        )}

        {/* 14 · VIVIR EN {BARRIO} — capa curada + complemento del story. */}
        {(neighborhood || barrioBlock) && (
          <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
            <h2 className="crm-section-title text-ink">
              Vivir en {neighborhood?.displayName ?? property.subzone ?? property.zone}
            </h2>
            <div className="mt-4 max-w-3xl space-y-4 text-base leading-relaxed text-ink/75">
              {neighborhood && <p>{neighborhood.intro}</p>}
              {barrioBlock && <p>{barrioBlock.copy}</p>}
            </div>
          </section>
        )}

        {/* 15 · UBICACIÓN — Luxury Location Module */}
        <LocationModule
          zone={property.zone}
          lat={property.latitude ?? null}
          lng={property.longitude ?? null}
          pois={neighborhood?.pois ?? []}
          neighborhood={neighborhood ?? null}
          fallbackCoords={
            ZONE_COORDS[property.zone] ?? { lat: 40.4168, lng: -3.7038, zoom: 14 }
          }
          universities={universities ?? []}
          mapProvider={mapProvider ?? "maplibre"}
          onView={() => trackerRef.current?.trackEvent("location_module_view")}
          onExplore={() => trackerRef.current?.trackEvent("map_explore")}
          onRestore={() => trackerRef.current?.trackEvent("location_overview_restore")}
          onPoiClick={(name, category) =>
            trackerRef.current?.trackEvent(
              category === "educacion" ? "location_university_select" : "location_poi_select",
              { name, category, experienceState },
            )
          }
          // Búsqueda de zona: jamás la consulta en crudo (§17-18) — solo el
          // hecho de buscar y la categoría/fuente del resultado elegido.
          onSearchEvent={(event, meta) =>
            trackerRef.current?.trackEvent(event, { ...meta, experienceState })
          }
        />

        {/* 16 · CONDICIONES + 17 · SERVICIO PRIVADO BCP */}
        <RequirementsAndServices isRent={isRent} />

        {/* 18 · SOLICITAR UNA VISITA — panel completo. */}
        <section
          id="contacto"
          className="mt-5 rounded-2xl border border-gold/25 bg-ink p-6 text-cream-50 shadow-[0_25px_50px_-25px_rgba(40,28,10,0.6)] md:p-8"
        >
          <h2 className="crm-section-title">Solicitar una visita</h2>
          <p className="mt-2 text-base text-cream-50/75">
            Te atendemos de forma personalizada. Cuéntanos cuándo te viene bien
            y organizamos la visita contigo.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <a
              href={visitMail}
              onClick={() => {
                trackVisit();
                trackerRef.current?.trackContactClick("email");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-cream-50 px-5 py-3 crm-button text-ink transition hover:bg-cream-100"
            >
              <CalendarCheck size={15} strokeWidth={1.75} />
              <span>Solicitar visita</span>
            </a>
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackerRef.current?.trackContactClick("whatsapp")}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-5 py-3 crm-button text-white transition hover:bg-[#1ebd5b]"
            >
              <WhatsAppIcon size={16} />
              <span>WhatsApp</span>
            </a>
            <a
              href={`mailto:${BC_CONTACT.email}?subject=Consulta: ${encodeURIComponent(property.title)}`}
              onClick={() => trackerRef.current?.trackContactClick("email")}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-3 crm-button text-ink transition hover:bg-gold-dark"
            >
              <Mail size={15} strokeWidth={1.75} />
              <span>Email</span>
            </a>
            <a
              href={`tel:${BC_CONTACT.phoneE164}`}
              onClick={() => trackerRef.current?.trackContactClick("phone")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-cream-50/30 bg-cream-50/5 px-5 py-3 crm-button text-cream-50 transition hover:bg-cream-50/10"
            >
              <Phone size={15} strokeWidth={1.75} />
              <span>{BC_CONTACT.phoneDisplay}</span>
            </a>
          </div>
        </section>

        <footer className="mt-8 pb-24 text-center crm-meta text-ink/45 md:pb-0">
          © {new Date().getFullYear()} Benjamín Cousiño Propiedades · Madrid
        </footer>
      </main>

      {/* Sticky móvil ÚNICA (sin doble sticky): visita + WhatsApp + tel. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/20 bg-cream-50/95 px-3 py-2 shadow-[0_-10px_25px_-15px_rgba(40,28,10,0.3)] backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <a
            href="#contacto"
            onClick={trackVisit}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2.5 crm-button text-cream-50"
          >
            <CalendarCheck size={14} strokeWidth={1.75} />
            <span>Solicitar visita</span>
          </a>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contactar por WhatsApp"
            onClick={() => trackerRef.current?.trackContactClick("whatsapp")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#25D366] text-white"
          >
            <WhatsAppIcon size={15} />
          </a>
          <a
            href={`tel:${BC_CONTACT.phoneE164}`}
            aria-label="Llamar por teléfono"
            onClick={() => trackerRef.current?.trackContactClick("phone")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ink/15 bg-white/90 text-ink/75"
          >
            <Phone size={15} strokeWidth={1.75} />
          </a>
        </div>
      </div>

      {/* GALLERY 2.0 · lightbox completa, abierta desde el hero. */}
      <PropertyGallery
        property={property}
        mode="lightbox-only"
        forceOpenAt={galleryOpenAt}
        onLightboxClose={() => setGalleryOpenAt(null)}
        onPhotoView={(index) => trackerRef.current?.trackPhotoView(index)}
      />
    </div>
  );
}

// ─── 01 · HERO MEDIA ─────────────────────────────────────────────────────────

function HeroMedia({
  heroVideo,
  coverImage,
  coverWidth,
  title,
  photoCount,
  onOpenGallery,
  onHeroPlay,
  onProgress,
}: {
  heroVideo: VideoMedia | null;
  coverImage: string | null;
  /** Ancho real de la portada; acota el `srcset`. */
  coverWidth: number | null;
  title: string;
  photoCount: number;
  onOpenGallery: () => void;
  onHeroPlay: () => void;
  onProgress: (quarter: number) => void;
}) {
  // reduced-motion y Save-Data degradan SIEMPRE a poster (regla del sprint).
  const [videoAllowed, setVideoAllowed] = useState(false);
  useEffect(() => {
    if (!heroVideo) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const poorNetwork = conn?.saveData === true || /(^|\b)2g\b/.test(conn?.effectiveType ?? "");
    setVideoAllowed(!reduced && !poorNetwork);
  }, [heroVideo]);

  const playedRef = useRef(false);
  const quartersRef = useRef(new Set<number>());
  const poster = heroVideo?.posterUrl ?? coverImage ?? undefined;

  if (!heroVideo && !coverImage) return null;

  return (
    <div className="relative w-full bg-ink">
      <div className="relative h-[46vh] min-h-[300px] w-full md:h-[62vh]">
        {heroVideo && videoAllowed ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={(el) => {
              if (el) el.muted = true;
            }}
            muted
            playsInline
            autoPlay
            loop
            preload="metadata"
            poster={poster}
            onPlay={() => {
              if (!playedRef.current) {
                playedRef.current = true;
                onHeroPlay();
              }
            }}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (!el.duration) return;
              const q = Math.floor((el.currentTime / el.duration) * 4) * 25;
              if ([25, 50, 75].includes(q) && !quartersRef.current.has(q)) {
                quartersRef.current.add(q);
                onProgress(q);
              }
            }}
            onVolumeChange={(e) => {
              const el = e.currentTarget;
              if (!el.muted) el.muted = true;
            }}
            className="h-full w-full object-cover"
            src={heroVideo.url}
          />
        ) : coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            srcSet={heroSrcSet(coverImage, coverWidth)}
            // El hero ocupa el ancho completo del viewport: cualquier otra
            // cosa haría que el navegador pidiese una variante pequeña.
            sizes="100vw"
            alt={title}
            className="h-full w-full object-cover"
            fetchPriority="high"
            decoding="async"
          />
        ) : null}
        {/* Gradiente inferior para que el acceso a galería siempre se lea. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink/55 to-transparent" />
        {photoCount > 0 && (
          <button
            type="button"
            onClick={onOpenGallery}
            className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-lg bg-cream-50/95 px-4 py-2.5 crm-button text-ink shadow-lg transition hover:bg-cream-50"
          >
            <Maximize2 size={14} strokeWidth={1.75} />
            <span>Ver todas las fotos · {photoCount}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 05-10 · CAPÍTULOS con foto integrada y alternancia ──────────────────────

/** Un capítulo sin foto y de longitud contenida puede compartir fila con el
 *  siguiente: dos columnas equilibradas en vez de dos párrafos sueltos. */
const PAIRABLE_WORDS = 85;
function isPairable(copy: string): boolean {
  return (copy.trim().match(/\S+/g) ?? []).length <= PAIRABLE_WORDS;
}

type ChapterRow =
  | { kind: "photo"; block: PublicStoryBlock; photo: string; reversed: boolean }
  | { kind: "solo"; block: PublicStoryBlock }
  | { kind: "pair"; left: PublicStoryBlock; right: PublicStoryBlock };

/**
 * Composición de los capítulos, calculada ANTES de partirlos en tandas: los
 * que llevan foto alternan izquierda/derecha (patrón EMAAR); los que se
 * quedan sin foto no se dejan caer como párrafos sueltos — si vienen dos
 * seguidos y ambos son cortos forman una rejilla a dos columnas, y si van
 * solos se maquetan como el spread del prelude.
 *
 * Se calcula sobre la lista COMPLETA a propósito: el vídeo signature y el CTA
 * se cuelan entre la primera tanda y el resto, y partir por número de
 * capítulos rompía la pareja justo por la mitad (visto en BC-0527).
 */
function buildChapterRows(
  blocks: PublicStoryBlock[],
  photos: Map<StoryChapter, string>,
): ChapterRow[] {
  const rows: ChapterRow[] = [];
  let photoIndex = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const photo = photos.get(block.chapter) ?? null;
    if (photo) {
      rows.push({ kind: "photo", block, photo, reversed: photoIndex % 2 === 1 });
      photoIndex++;
      continue;
    }
    const next = blocks[i + 1];
    const nextPhoto = next ? photos.get(next.chapter) ?? null : null;
    if (next && !nextPhoto && isPairable(block.copy) && isPairable(next.copy)) {
      rows.push({ kind: "pair", left: block, right: next });
      i++;
      continue;
    }
    rows.push({ kind: "solo", block });
  }
  return rows;
}

function StoryChapters({
  rows,
  onView,
}: {
  rows: ChapterRow[];
  onView: (chapter: string) => void;
}) {
  return (
    <div className="mt-8 space-y-8 md:space-y-14">
      {rows.map((row) =>
        row.kind === "photo" ? (
          <Chapter
            key={row.block.chapter}
            block={row.block}
            photo={row.photo}
            reversed={row.reversed}
            onView={onView}
          />
        ) : row.kind === "pair" ? (
          <TextChapterPair key={row.left.chapter} left={row.left} right={row.right} onView={onView} />
        ) : (
          <TextChapter key={row.block.chapter} block={row.block} onView={onView} />
        ),
      )}
    </div>
  );
}

/** Observador de lectura del capítulo: una sola vez, al 40% visible. */
function useChapterSeen(chapter: string, onView: (c: string) => void) {
  const ref = useRef<HTMLElement | null>(null);
  const seen = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !seen.current) {
          seen.current = true;
          onView(chapter);
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [chapter, onView]);
  return ref;
}

/** Capítulo solo-texto: rótulo a la izquierda, texto en medida de lectura a
 *  la derecha. Es la misma retórica del spread del prelude, y evita el
 *  párrafo centrado a la deriva entre dos capítulos con foto. */
function TextChapter({
  block,
  onView,
}: {
  block: PublicStoryBlock;
  onView: (chapter: string) => void;
}) {
  const ref = useChapterSeen(block.chapter, onView);
  return (
    <section ref={ref} className="border-t border-gold/20 pt-7 md:pt-9">
      <div className="md:flex md:items-start md:gap-12 lg:gap-16">
        <div className="md:w-[36%] md:shrink-0">
          <h2 className="crm-section-title text-ink">{CHAPTER_HEADINGS[block.chapter]}</h2>
        </div>
        <div className="mt-3 md:mt-0 md:w-[64%] md:max-w-[45rem]">
          <p className="text-[1.02rem] leading-[1.8] text-ink/75 md:text-[1.08rem]">{block.copy}</p>
        </div>
      </div>
    </section>
  );
}

/** Dos capítulos solo-texto seguidos: rejilla editorial 2-up en desktop,
 *  apilados en móvil. La línea superior los une como una unidad compuesta en
 *  vez de dejarlos como dos bloques huérfanos. */
function TextChapterPair({
  left,
  right,
  onView,
}: {
  left: PublicStoryBlock;
  right: PublicStoryBlock;
  onView: (chapter: string) => void;
}) {
  const refLeft = useChapterSeen(left.chapter, onView);
  const refRight = useChapterSeen(right.chapter, onView);
  return (
    <div className="border-t border-gold/20 pt-7 md:pt-9">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-14">
        {[
          { block: left, ref: refLeft },
          { block: right, ref: refRight },
        ].map(({ block, ref }) => (
          <section key={block.chapter} ref={ref} className="max-w-[34rem]">
            <h2 className="crm-section-title text-ink">{CHAPTER_HEADINGS[block.chapter]}</h2>
            <p className="mt-3 text-[1.02rem] leading-[1.8] text-ink/75">{block.copy}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

function Chapter({
  block,
  photo,
  reversed,
  onView,
}: {
  block: PublicStoryBlock;
  photo: string;
  reversed: boolean;
  onView: (chapter: string) => void;
}) {
  const ref = useChapterSeen(block.chapter, onView);

  const copy = (
    <div className="flex flex-col justify-center">
      <h2 className="crm-section-title text-ink">{CHAPTER_HEADINGS[block.chapter]}</h2>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-ink/75">{block.copy}</p>
    </div>
  );

  return (
    <section
      ref={ref}
      className={`grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 md:gap-10 ${
        reversed ? "md:[direction:rtl]" : ""
      }`}
    >
      <div className="[direction:ltr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt={CHAPTER_HEADINGS[block.chapter]}
          loading="lazy"
          className="h-64 w-full rounded-2xl border border-gold/15 object-cover md:h-80"
        />
      </div>
      <div className="[direction:ltr]">{copy}</div>
    </section>
  );
}

// ─── 11 · RECORRIDO EN VÍDEO (signature) ─────────────────────────────────────

function SignatureVideo({
  videos,
  muteAutoplay,
  onPlay,
  onProgress,
}: {
  videos: VideoMedia[];
  // true = no hay hero-vídeo → el signature puede autoreproducirse (muted).
  // false = el hero ya es vídeo → un solo autoplay por página (performance).
  muteAutoplay: boolean;
  onPlay: (index: number) => void;
  onProgress: (quarter: number) => void;
}) {
  const [active, setActive] = useState(0);
  const idx = Math.min(active, videos.length - 1);
  return (
    <section className="mt-8">
      <h2 className="crm-section-title text-ink">Recorrido en vídeo</h2>
      <div className="mt-4">
        <div key={idx} className="opacity-0 [animation:heroFade_.45s_ease_forwards]">
          <VideoPlayer
            video={videos[idx]}
            autoplay={muteAutoplay}
            onPlay={() => onPlay(idx)}
            onProgress={onProgress}
          />
        </div>
      </div>
      {videos.length > 1 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {videos.map((v, i) => (
            <VideoThumb key={v.url} url={v.url} active={i === idx} onSelect={() => setActive(i)} />
          ))}
        </div>
      )}
    </section>
  );
}

// Vertical (9:16): contenedor propio centrado — NUNCA recortado a 16:9.
function VerticalVideos({
  videos,
  onPlay,
}: {
  videos: VideoMedia[];
  onPlay: (index: number) => void;
}) {
  return (
    <section className="mt-8">
      <h2 className="crm-section-title text-ink">Recorrido en vídeo</h2>
      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {videos.map((v, i) => (
          <div
            key={v.url}
            className="relative aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-2xl border border-gold/25 bg-black"
          >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={(el) => {
                if (el) el.muted = true;
              }}
              muted
              playsInline
              loop
              controls
              preload="metadata"
              poster={v.posterUrl ?? undefined}
              onPlay={() => onPlay(i)}
              onVolumeChange={(e) => {
                const el = e.currentTarget;
                if (!el.muted) el.muted = true;
              }}
              className="h-full w-full object-cover"
              src={v.url}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function VideoPlayer({
  video,
  autoplay,
  onPlay,
  onProgress,
}: {
  video: VideoMedia;
  autoplay: boolean;
  onPlay: () => void;
  onProgress: (quarter: number) => void;
}) {
  const info = detectVideoType(video.url);
  const quartersRef = useRef(new Set<number>());
  const playedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cardCls =
    "relative overflow-hidden rounded-2xl border border-gold/25 bg-black shadow-[0_25px_60px_-30px_rgba(40,28,10,0.55)] ring-1 ring-inset ring-white/5";

  // Pausa fuera de viewport (performance del sprint) para archivos directos.
  useEffect(() => {
    const el = containerRef.current;
    const vid = videoRef.current;
    if (!el || !vid) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) vid.pause();
          else if (autoplay) void vid.play().catch(() => {});
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [autoplay]);

  if (info.type === "youtube" && info.id) {
    return (
      <div className={cardCls}>
        <iframe
          src={`${getYoutubeEmbedUrl(info.id)}&mute=1&autoplay=${autoplay ? 1 : 0}&loop=1&playlist=${info.id}&modestbranding=1&playsinline=1`}
          className="aspect-video w-full"
          allow="autoplay; fullscreen"
          allowFullScreen
          title="Vídeo de la propiedad"
        />
      </div>
    );
  }
  if (info.type === "vimeo" && info.id) {
    return (
      <div className={cardCls}>
        <iframe
          src={`${getVimeoEmbedUrl(info.id)}?autoplay=${autoplay ? 1 : 0}&muted=1&loop=1`}
          className="aspect-video w-full"
          allow="autoplay; fullscreen"
          allowFullScreen
          title="Vídeo de la propiedad"
        />
      </div>
    );
  }
  return (
    <div className={cardCls} ref={containerRef}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={(el) => {
          videoRef.current = el;
          if (el) el.muted = true;
        }}
        muted
        playsInline
        autoPlay={autoplay}
        loop
        controls
        preload={autoplay ? "auto" : "metadata"}
        poster={video.posterUrl ?? undefined}
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onPlay={() => {
          if (!playedRef.current) {
            playedRef.current = true;
            onPlay();
          }
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (!el.duration) return;
          const q = Math.floor((el.currentTime / el.duration) * 4) * 25;
          if ([25, 50, 75].includes(q) && !quartersRef.current.has(q)) {
            quartersRef.current.add(q);
            onProgress(q);
          }
        }}
        onVolumeChange={(e) => {
          const el = e.currentTarget;
          if (!el.muted) el.muted = true;
        }}
        className="aspect-video w-full bg-black object-cover"
        src={video.url}
      />
    </div>
  );
}

function VideoThumb({
  url,
  active,
  onSelect,
}: {
  url: string;
  active: boolean;
  onSelect: () => void;
}) {
  const info = detectVideoType(url);
  const ring = active
    ? "ring-2 ring-gold"
    : "ring-1 ring-inset ring-white/10 hover:ring-gold/50";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label="Ver este vídeo"
      className={`group relative block aspect-video w-full overflow-hidden rounded-xl border border-gold/20 bg-black transition ${ring}`}
    >
      {info.type === "youtube" && info.id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://img.youtube.com/vi/${info.id}/hqdefault.jpg`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : info.type === "vimeo" ? (
        <div className="flex h-full w-full items-center justify-center bg-ink/85 crm-label-sm text-cream-50/70">
          Vídeo
        </div>
      ) : (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          src={`${url}#t=0.5`}
        />
      )}
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition ${
          active ? "bg-black/5" : "bg-black/30 group-hover:bg-black/15"
        }`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cream-50/90 text-ink shadow-md transition group-hover:scale-110">
          <Play size={15} className="ml-0.5" fill="currentColor" />
        </span>
      </span>
      {active && (
        <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-0.5 crm-badge text-ink shadow">
          Viendo
        </span>
      )}
    </button>
  );
}

// ─── 13 · PLANO con fullscreen ───────────────────────────────────────────────

function FloorPlans({
  plans,
  onView,
}: {
  plans: Array<{ url: string; file_name?: string | null }>;
  onView: (index: number) => void;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  useEffect(() => {
    if (openIdx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIdx(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx]);

  return (
    <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-8">
      <div className="flex items-center gap-2.5">
        <Layers size={18} strokeWidth={1.75} className="text-gold" />
        <h2 className="crm-section-title text-ink">
          {plans.length > 1 ? "Planos" : "Plano"}
        </h2>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {plans.map((p, i) => (
          <button
            key={p.url}
            type="button"
            onClick={() => {
              onView(i);
              setOpenIdx(i);
            }}
            className="group relative overflow-hidden rounded-xl border border-ink/10 bg-white"
            aria-label="Ampliar plano"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="Plano de la vivienda" loading="lazy" className="w-full" />
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-md bg-ink/80 px-2.5 py-1.5 crm-badge text-cream-50 opacity-0 transition group-hover:opacity-100">
              <Maximize2 size={12} /> Ampliar
            </span>
          </button>
        ))}
      </div>

      {openIdx != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4"
          onClick={() => setOpenIdx(null)}
        >
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-cream-50/15 text-cream-50"
            onClick={() => setOpenIdx(null)}
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={plans[openIdx].url}
            alt="Plano de la vivienda"
            className="max-h-[92vh] max-w-full rounded-lg bg-white object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </section>
  );
}

// ─── 15 · UBICACIÓN + NEARBY ────────────────────────────────────────────────

const ZONE_COORDS: Record<string, { lat: number; lng: number; zoom: number }> = {
  Salamanca: { lat: 40.4264, lng: -3.684, zoom: 15 },
  Chamberí: { lat: 40.4378, lng: -3.704, zoom: 15 },
  Retiro: { lat: 40.4151, lng: -3.6814, zoom: 15 },
  Pozuelo: { lat: 40.4337, lng: -3.8087, zoom: 14 },
  Chamartín: { lat: 40.4607, lng: -3.6772, zoom: 14 },
  Centro: { lat: 40.4168, lng: -3.7038, zoom: 15 },
  "La Moraleja": { lat: 40.5197, lng: -3.6332, zoom: 14 },
};

// ─── 03 · KEY FACTS helpers ─────────────────────────────────────────────────

function buildKeyFacts(property: Property) {
  const facts: Array<{ label: string; value: string; icon: React.ReactNode }> = [
    {
      label: "Dormitorios",
      value: String(property.bedrooms),
      icon: <BedDouble size={16} strokeWidth={1.75} />,
    },
    {
      label: "Baños",
      value: String(property.bathrooms),
      icon: <Bath size={16} strokeWidth={1.75} />,
    },
  ];
  if (property.squareMeters) {
    facts.push({
      label: "Superficie",
      value: `${property.squareMeters} m²`,
      icon: <Ruler size={16} strokeWidth={1.75} />,
    });
  }
  if (property.floor != null) {
    facts.push({
      label: "Planta",
      value: property.floor === ATICO_FLOOR ? "Ático" : `${property.floor}ª`,
      icon: <Building2 size={16} strokeWidth={1.75} />,
    });
  }
  const feats = property.featuresText ?? [];
  if (feats.some((f) => /terraza/i.test(f))) {
    facts.push({
      label: "Terraza",
      value: "Sí",
      icon: <Sparkles size={16} strokeWidth={1.75} />,
    });
  } else if (feats.some((f) => /garaje|parking/i.test(f))) {
    facts.push({
      label: "Garaje",
      value: "Sí",
      icon: <Sparkles size={16} strokeWidth={1.75} />,
    });
  }
  return facts.slice(0, 5);
}

// ─── 16+17 · CONDICIONES + SERVICIO PRIVADO BCP (sin cambios de contenido) ──

function RequirementsAndServices({ isRent }: { isRent: boolean }) {
  return (
    <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-7">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-gold-dark">
            <FileSignature size={17} strokeWidth={1.75} />
          </span>
          <h2 className="crm-section-title text-ink">Condiciones</h2>
        </div>
        <ul className="mt-4 space-y-3 text-sm text-ink/75">
          {isRent ? (
            <>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">Fianza legal</strong>{" "}
                  según ley (LAU). Se entrega al firmar el contrato.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">Garantías adicionales</strong>{" "}
                  según perfil del inquilino (aval, seguro de impago o meses
                  adicionales). Lo acordamos contigo en la visita.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">Documentación</strong>: DNI/NIE,
                  nóminas o justificantes de ingresos y declaración de renta del
                  último año.
                </span>
              </li>
            </>
          ) : (
            <>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">Reserva</strong> al aceptar
                  oferta. El importe se descuenta del precio final.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">Arras</strong> al firmar
                  contrato privado. Habitualmente un 10% del precio.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>
                  <strong className="font-medium text-ink">Documentación</strong>: DNI/NIE,
                  justificante de fondos y, si aplica, oferta vinculante del banco.
                </span>
              </li>
            </>
          )}
        </ul>
        <p className="mt-4 crm-meta text-ink/55">
          Importes concretos a coordinar con tu agente BC al planificar la visita.
        </p>
      </div>

      <div className="rounded-2xl border border-gold/35 bg-ink p-6 text-cream-50 shadow-[0_25px_50px_-25px_rgba(40,28,10,0.55)] md:p-7">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/20 text-gold">
            <Sparkles size={17} strokeWidth={1.75} />
          </span>
          <h2 className="crm-section-title">Servicio privado BCP</h2>
        </div>
        <p className="mt-4 text-base leading-relaxed text-cream-50/80">
          En Benjamín Cousiño Propiedades no solo enseñamos pisos: te acompañamos
          en todo el proceso como tu Personal Shopper inmobiliario.
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
            <span>Asesoramiento fiscal y contractual hasta la firma.</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
