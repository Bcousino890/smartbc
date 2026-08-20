import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { propertyRowToClientProperty } from "@/lib/db/adapters";
import {
  getPropertyBySlugPublic,
  resolveLegacySlug,
} from "@/lib/db/queries/properties";
import { getOrComputePropertyCoords } from "@/lib/geo/geocode";
import { getApprovedStoryPublic } from "@/lib/db/queries/story";
import { getNeighborhoodPublic } from "@/lib/db/queries/neighborhoods";
import { PublicPropertyView } from "./public-property-view";
import { CollectionReturnBar } from "@/components/public/collection-return-bar";

export const dynamic = "force-dynamic";

// URL base pública del portal para construir URLs absolutas en OG/canonical.
// Caemos al dominio de producción si no hay env explícito.
const PORTAL_URL = (
  process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.bcousinoprop.com"
).replace(/\/+$/, "");

function formatPriceForOg(price: number, isRent: boolean): string {
  const n = new Intl.NumberFormat("es-ES").format(price);
  return isRent ? `${n} €/mes` : `${n} €`;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ op?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { op } = await searchParams;
  const row = (await getPropertyBySlugPublic(slug)) as
    | {
        title: string;
        title_rent: string | null;
        operation: "rent" | "sale";
        operations: string[] | null;
        price: number;
        rent_price: number | null;
        zone: string;
        bedrooms: number;
        bathrooms: number;
        square_meters: number | null;
        cover_photo_url: string | null;
        property_photos:
          | Array<{ url: string; is_cover: boolean }>
          | null;
      }
    | null;
  if (!row) {
    return { title: "Propiedad no disponible · Benjamín Cousiño Propiedades" };
  }

  // Propiedad dual: `?op=rent` pide explícitamente la variante de alquiler
  // (título/precio propios). Fuera de eso, se mantiene la operación
  // "principal" de siempre (venta cuando aplica, si no alquiler).
  const isDual =
    Array.isArray(row.operations) &&
    row.operations.includes("sale") &&
    row.operations.includes("rent");
  const isRent = isDual && op === "rent" ? true : row.operation === "rent";
  const effectivePrice =
    isDual && isRent && row.rent_price != null
      ? Number(row.rent_price)
      : Number(row.price);
  const effectiveTitle =
    isDual && isRent && row.title_rent ? row.title_rent : row.title;
  const price = formatPriceForOg(effectivePrice, isRent);
  const title = `${effectiveTitle} · ${price}`;
  const description = [
    `${row.bedrooms} hab · ${row.bathrooms} baños`,
    row.square_meters ? `${row.square_meters} m²` : null,
    row.zone,
    "Madrid",
  ]
    .filter(Boolean)
    .join(" · ");

  // OG image: usamos un endpoint dedicado que sirve la foto principal
  // como JPEG 1200×630 (formato más compatible que WebP para WhatsApp,
  // Twitter, Slack, etc.). El endpoint cachea por 24h.
  const ogImage = `${PORTAL_URL}/og/property/${slug}`;
  const canonical =
    isDual && isRent
      ? `${PORTAL_URL}/compartir/${slug}?op=rent`
      : `${PORTAL_URL}/compartir/${slug}`;

  return {
    title,
    description,
    metadataBase: new URL(PORTAL_URL),
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: "Benjamín Cousiño Propiedades",
      locale: "es_ES",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          type: "image/jpeg",
          alt: effectiveTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function PublicSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ op?: string }>;
}) {
  const { slug } = await params;
  const { op } = await searchParams;
  // Bypasa RLS con service role (visitante no autenticado).
  const row = (await getPropertyBySlugPublic(slug)) as
    | (Parameters<typeof propertyRowToClientProperty>[0] & {
        id: string;
        address: string | null;
        zone: string;
        latitude: number | null;
        longitude: number | null;
        property_media?: Array<{
          url: string;
          file_name?: string | null;
          type?: string | null;
        }> | null;
      })
    | null;
  if (!row) {
    // Slug viejo (con prefijo de agencia, ej. "level-…"): redirigimos al
    // nuevo para no romper SmartLinks ya enviados a clientes.
    const newSlug = await resolveLegacySlug(slug);
    if (newSlug && newSlug !== slug) {
      redirect(`/compartir/${newSlug}${op ? `?op=${op}` : ""}`);
    }
    notFound();
  }

  // Geocoding cacheado: en el primer acceso resuelve y guarda; en los
  // siguientes devuelve las coords ya guardadas. Si falla devuelve null
  // y la vista cae al fallback por barrio.
  const coords = await getOrComputePropertyCoords({
    propertyId: row.id,
    address: row.address,
    zone: row.zone,
    cachedLat: row.latitude,
    cachedLng: row.longitude,
  });

  // `?op=rent` pide la variante de alquiler cuando la propiedad es dual
  // (venta + alquiler) — ver propertyRowToClientProperty.
  const property = propertyRowToClientProperty(
    row,
    op === "rent" ? "rent" : op === "sale" ? "sale" : undefined,
  );
  // Si geocoding devolvió coords pero el adapter aún no las tenía
  // (porque acabamos de cachearlas), las ponemos aquí.
  if (coords) {
    property.latitude = coords.lat;
    property.longitude = coords.lng;
  }

  // Videos y planos subidos desde /admin/publicacion (tabla property_media).
  // SmartLink 2.0: los vídeos viajan CON su metadata (source/format/medidas)
  // para que el renderer decida hero vs signature vs contenedor vertical.
  const media = (row.property_media ?? []) as Array<{
    url: string;
    file_name?: string | null;
    type?: string | null;
    source?: string | null;
    format?: string | null;
    width?: number | null;
    height?: number | null;
    duration_seconds?: number | null;
    poster_url?: string | null;
  }>;
  const videos = media
    .filter((m) => m.type === "video" && m.url)
    .map((m) => ({
      url: m.url,
      file_name: m.file_name ?? null,
      source: m.source ?? null,
      format: m.format ?? null,
      width: m.width ?? null,
      height: m.height ?? null,
      durationSeconds: m.duration_seconds != null ? Number(m.duration_seconds) : null,
      posterUrl: m.poster_url ?? null,
    }));
  const plans = media
    .filter((m) => m.type === "plan" && m.url)
    .map((m) => ({ url: m.url, file_name: m.file_name ?? null }));

  // Story aprobado (o null → fallback determinista) y capa curada de barrio.
  // Ambos tolerantes a fallos: sin migración 0144 el SmartLink no se cae.
  const [story, neighborhood] = await Promise.all([
    getApprovedStoryPublic(row.id),
    getNeighborhoodPublic({
      zone: row.zone,
      subzone: (row as { subzone?: string | null }).subzone ?? null,
      lat: property.latitude ?? null,
      lng: property.longitude ?? null,
    }),
  ]);

  return (
    <>
      <CollectionReturnBar />
      <PublicPropertyView
        property={property}
        videos={videos}
        plans={plans}
        story={story}
        neighborhood={neighborhood}
      />
    </>
  );
}
