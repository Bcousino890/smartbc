import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Heart, MapPin } from "lucide-react";
import { createAdminClient } from "@/lib/db/admin";
import type { Property } from "@/lib/portal-properties";
import { PropertyCard } from "../../_components/PropertyCard";
import { PropertyGallery } from "../../_components/PropertyGallery";
import { PropertyVideos } from "../../_components/PropertyVideos";
import { CampusDistance } from "../../_components/CampusDistance";
import { PropertyLocationMap } from "../../_components/PropertyLocationMap";
import type { Metadata } from "next";

type Props = { params: Promise<{ id: string }> };

async function getPortalProperty(slug: string): Promise<Property | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from("properties")
    .select(
      "id, slug, bc_reference, property_reference, title, zone, address, country, price, operation, bedrooms, bathrooms, square_meters, description, features, features_manual, cover_photo_url, property_photos(url, is_cover, position), property_media(url, type, file_name)",
    )
    .eq("slug", slug)
    .in("status", ["available", "reserved"])
    .is("archived_at", null)
    .maybeSingle();

  if (!data) return null;

  const p = data as Record<string, unknown>;
  const photos = ((p.property_photos as Array<{ url: string; is_cover: boolean; position: number }>) ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);
  const coverFromPhotos =
    photos.find((ph) => ph.is_cover)?.url ?? photos[0]?.url ?? "";
  const cover =
    ((p.cover_photo_url as string | null) ??
      coverFromPhotos) ||
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80&auto=format&fit=crop";
  const gallery = photos.filter((ph) => ph.url !== cover).map((ph) => ph.url);
  const media = ((p.property_media as Array<{ url: string; type: string; file_name: string }>) ?? [])
    .filter((m) => m.type === "video" && m.url);
  const videos = media.map((m) => ({
    url: m.url,
    title: m.file_name || "Video",
  }));
  const countryCode = p.country as string;
  const city = countryCode === "es" ? "Madrid" : "Santiago";
  const office = countryCode === "es" ? "Madrid" : "Santiago";
  const phone = countryCode === "es" ? "+34 694 209 763" : "+56 9 61791938";
  const priceNum = Number(p.price);
  const priceStr =
    countryCode === "cl"
      ? `USD ${priceNum.toLocaleString("en-US")}`
      : `€ ${priceNum.toLocaleString("es-ES")}`;

  return {
    id: p.slug as string,
    ref: (p.bc_reference as string | null) ?? (p.property_reference as string),
    title: p.title as string,
    zone: p.zone as string,
    city,
    country: countryCode === "es" ? "España" : "Chile",
    price: priceStr,
    priceNum,
    operation: (p.operation as string) === "sale" ? "Venta" : "Alquiler",
    type: "Apartamento",
    beds: Number(p.bedrooms),
    baths: Number(p.bathrooms),
    sqm: Number(p.square_meters ?? 0),
    cover,
    gallery,
    videos: videos.length > 0 ? videos : undefined,
    description: (p.description as string | null) ?? "",
    features: [
      ...((p.features as string[]) ?? []),
      ...((p.features_manual as string[]) ?? []),
    ],
    address: (p.address as string | null) ?? (p.zone as string),
    office: office as "Madrid" | "Santiago",
    phone,
  };
}

async function getSimilarProperties(currentSlug: string): Promise<Property[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from("properties")
    .select(
      "id, slug, bc_reference, property_reference, title, zone, address, country, price, operation, bedrooms, bathrooms, square_meters, description, features, features_manual, cover_photo_url, property_photos(url, is_cover, position), property_media(url, type, file_name)",
    )
    .in("status", ["available", "reserved"])
    .is("archived_at", null)
    .neq("slug", currentSlug)
    .order("created_at", { ascending: false })
    .limit(3);

  if (!data) return [];
  return ((data as unknown[]) ?? []).map((raw) => {
    const p = raw as Record<string, unknown>;
    const photos = ((p.property_photos as Array<{ url: string; is_cover: boolean; position: number }>) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    const coverFromPhotos =
      photos.find((ph) => ph.is_cover)?.url ?? photos[0]?.url ?? "";
    const cover =
      ((p.cover_photo_url as string | null) ??
        coverFromPhotos) ||
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80&auto=format&fit=crop";
    const gallery = photos.filter((ph) => ph.url !== cover).map((ph) => ph.url);
    const media = ((p.property_media as Array<{ url: string; type: string; file_name: string }>) ?? [])
      .filter((m) => m.type === "video" && m.url);
    const videos = media.map((m) => ({
      url: m.url,
      title: m.file_name || "Video",
    }));
    const countryCode = p.country as string;
    const city = countryCode === "es" ? "Madrid" : "Santiago";
    const office = countryCode === "es" ? "Madrid" : "Santiago";
    const phone = countryCode === "es" ? "+34 694 209 763" : "+56 9 61791938";
    const priceNum = Number(p.price);
    const priceStr =
      countryCode === "cl"
        ? `USD ${priceNum.toLocaleString("en-US")}`
        : `€ ${priceNum.toLocaleString("es-ES")}`;
    return {
      id: p.slug as string,
      ref: (p.bc_reference as string | null) ?? (p.property_reference as string),
      title: p.title as string,
      zone: p.zone as string,
      city,
      country: countryCode === "es" ? "España" : "Chile",
      price: priceStr,
      priceNum,
      operation: (p.operation as string) === "sale" ? "Venta" : "Alquiler",
      type: "Apartamento",
      beds: Number(p.bedrooms),
      baths: Number(p.bathrooms),
      sqm: Number(p.square_meters ?? 0),
      cover,
      gallery,
      videos: videos.length > 0 ? videos : undefined,
      description: (p.description as string | null) ?? "",
      features: [
        ...((p.features as string[]) ?? []),
        ...((p.features_manual as string[]) ?? []),
      ],
      address: (p.address as string | null) ?? (p.zone as string),
      office: office as "Madrid" | "Santiago",
      phone,
    } satisfies Property;
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = await getPortalProperty(id);
  if (!p) return { title: "Propiedad" };
  return {
    title: `${p.title} — ${p.zone} · ${p.city}`,
    description: p.description.slice(0, 160),
    openGraph: { images: [p.cover] },
  };
}

export default async function PropertyDetail({ params }: Props) {
  const { id } = await params;
  const p = await getPortalProperty(id);
  if (!p) notFound();

  const similar = await getSimilarProperties(id);

  return (
    <div>
      <PropertyGallery cover={p.cover} gallery={p.gallery} title={p.title} />

      <div className="container-luxe py-16 grid lg:grid-cols-[1fr_380px] gap-16">
        <article>
          <p className="text-[11px] tracking-[0.24em] uppercase text-gray-400">
            <Link href="/web" className="hover:text-gold">Inicio</Link> / <Link href="/web/propiedades" className="hover:text-gold">Propiedades</Link> / {p.zone}
          </p>
          <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-[11px] tracking-[0.28em] uppercase text-gold">Ref. {p.ref}</p>
            {p.badge && <span className="text-[10px] tracking-[0.28em] uppercase bg-navy text-cream px-3 py-1.5">{p.badge}</span>}
          </div>
          <h1 className="mt-4 font-display text-5xl md:text-7xl text-navy leading-tight">{p.title}</h1>
          <div className="mt-6 flex items-end justify-between gap-6 flex-wrap pb-6 border-b border-stone-200">
            <div>
              <p className="font-display text-4xl text-navy">{p.price}</p>
              <p className="mt-1 text-[11px] tracking-[0.24em] uppercase text-gray-400">{p.operation}</p>
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <MapPin size={14} className="text-gold" />
              {p.address}, {p.city}, {p.country}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { n: p.beds, l: "Hab." },
              { n: p.baths, l: "Baños" },
              { n: p.sqm, l: "m²" },
              { n: p.cert ?? "—", l: "Cert. Energ." },
            ].map((m, i) => (
              <div key={i} className="border-l-2 border-gold pl-4">
                <p className="font-display text-4xl text-navy">{m.n}</p>
                <p className="text-[11px] tracking-[0.24em] uppercase text-gray-400 mt-1">{m.l}</p>
              </div>
            ))}
          </div>

          <section className="mt-16">
            <h2 className="font-display text-3xl text-navy">Descripción</h2>
            <p className="mt-6 text-base leading-relaxed text-navy/80">{p.description}</p>
          </section>

          <section className="mt-16">
            <h2 className="font-display text-3xl text-navy">Características</h2>
            <ul className="mt-6 grid sm:grid-cols-2 gap-x-8 gap-y-3">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-navy/80">
                  <span className="text-gold mt-1.5 h-1 w-4 bg-gold inline-block" />
                  {f}
                </li>
              ))}
            </ul>
          </section>

          {p.videos && p.videos.length > 0 && (
            <PropertyVideos videos={p.videos} />
          )}

          <section className="mt-16">
            <h2 className="font-display text-3xl text-navy">Ubicación</h2>
            <PropertyLocationMap address={p.address} city={p.city} country={p.country} />
          </section>

          <CampusDistance city={p.city} address={p.address} />
        </article>

        {/* SIDEBAR */}
        <aside className="lg:sticky lg:top-28 lg:self-start space-y-6">
          <div className="border border-stone-200 bg-white p-8">
            <p className="eyebrow">Gestionado por</p>
            <div className="mt-4 flex items-center gap-4 pb-6 border-b border-stone-200">
              <div className="h-14 w-14 border border-gold text-gold flex items-center justify-center font-display text-xl">BC</div>
              <div>
                <p className="font-display text-xl text-navy">Benjamín Cousiño</p>
                <p className="text-xs text-gray-500">Oficina {p.office}</p>
              </div>
            </div>
            <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="mt-6 block text-navy font-display text-2xl hover:text-gold">{p.phone}</a>
            <p className="text-[11px] tracking-[0.22em] uppercase text-gray-400 mt-2">
              {p.office === "Madrid" ? "Lun–Vie 9:00–19:00 · Sáb 10:00–14:00" : "Lun–Vie 9:00–18:30"}
            </p>
            <button className="mt-6 w-full bg-navy text-cream py-4 text-[11px] tracking-[0.28em] uppercase hover:bg-gold hover:text-navy transition-colors">
              Solicitar Visita
            </button>
            <button className="mt-2 w-full border border-stone-200 py-4 text-[11px] tracking-[0.24em] uppercase text-navy hover:bg-cream-deep inline-flex items-center justify-center gap-2">
              <Heart size={14} /> Guardar
            </button>
          </div>

          <div className="border border-gold/40 p-8 bg-cream-deep">
            <p className="eyebrow">¿Busca algo diferente?</p>
            <p className="mt-3 text-sm text-navy/80 leading-relaxed">Consulte nuestra cartera off market de 1.800+ propiedades no publicadas.</p>
            <Link href="/web/off-market" className="mt-4 inline-flex items-center gap-2 text-[11px] tracking-[0.24em] uppercase text-gold hover:text-navy">
              Cartera Off Market <ArrowRight size={14} />
            </Link>
          </div>
        </aside>
      </div>

      {/* SIMILAR */}
      <section className="bg-cream-deep py-24">
        <div className="container-luxe">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <p className="eyebrow">Puede Interesarle</p>
              <h2 className="mt-3 font-display text-4xl md:text-5xl text-navy">Propiedades Similares</h2>
            </div>
            <Link href="/web/propiedades" className="text-[11px] tracking-[0.28em] uppercase text-gold hover:text-navy inline-flex items-center gap-2">Ver todas <ArrowRight size={14} /></Link>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {similar.map((s) => <PropertyCard key={s.id} p={s} />)}
          </div>
        </div>
      </section>
    </div>
  );
}
