import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, Heart, MapPin } from "lucide-react";
import { getProperty, properties, type Property } from "@/data/properties";
import { PropertyCard } from "@/components/site/PropertyCard";

export const Route = createFileRoute("/propiedades/$id")({
  loader: ({ params }) => {
    const p = getProperty(params.id);
    if (!p) throw notFound();
    return p;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} — ${loaderData.zone} · ${loaderData.city}` },
          { name: "description", content: loaderData.description.slice(0, 160) },
          { property: "og:title", content: `${loaderData.title} — Benjamín Cousiño Propiedades` },
          { property: "og:description", content: loaderData.description.slice(0, 160) },
          { property: "og:image", content: loaderData.cover },
        ]
      : [{ title: "Propiedad" }],
  }),
  notFoundComponent: () => (
    <div className="container-luxe py-32 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-4 font-display text-5xl text-navy">Propiedad no disponible</h1>
      <Link to="/propiedades" className="mt-8 inline-block border border-navy px-6 py-3 text-[11px] tracking-[0.24em] uppercase text-navy hover:bg-navy hover:text-cream transition-colors">Ver catálogo</Link>
    </div>
  ),
  component: PropertyDetail,
});

function PropertyDetail() {
  const p = Route.useLoaderData() as Property;
  const similar = properties.filter((x) => x.id !== p.id).slice(0, 3);

  return (
    <div>
      {/* GALLERY */}
      <section className="bg-cream-deep">
        <div className="container-luxe py-6 grid md:grid-cols-3 gap-2 h-[70vh]">
          <div className="md:col-span-2 relative overflow-hidden">
            <img src={p.cover} alt={p.title} className="h-full w-full object-cover" />
            <button className="absolute bottom-6 left-6 bg-cream/95 text-navy px-5 py-2 text-[11px] tracking-[0.24em] uppercase">↗ Ver galería</button>
          </div>
          <div className="hidden md:grid grid-rows-2 gap-2">
            {p.gallery.slice(0, 2).map((img, i) => (
              <div key={i} className="overflow-hidden relative">
                <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                {i === 1 && p.gallery.length > 2 && (
                  <span className="absolute bottom-4 right-4 bg-navy/80 text-cream px-3 py-1 text-[11px] tracking-wider uppercase">+{p.gallery.length - 2} fotos</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container-luxe py-16 grid lg:grid-cols-[1fr_380px] gap-16">
        <article>
          <p className="text-[11px] tracking-[0.24em] uppercase text-muted-foreground">
            <Link to="/" className="hover:text-gold">Inicio</Link> / <Link to="/propiedades" className="hover:text-gold">Propiedades</Link> / {p.zone}
          </p>
          <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-[11px] tracking-[0.28em] uppercase text-gold">Ref. {p.ref}</p>
            {p.badge && <span className="text-[10px] tracking-[0.28em] uppercase bg-navy text-cream px-3 py-1.5">{p.badge}</span>}
          </div>
          <h1 className="mt-4 font-display text-5xl md:text-7xl text-navy leading-tight">{p.title}</h1>
          <div className="mt-6 flex items-end justify-between gap-6 flex-wrap pb-6 border-b border-border">
            <div>
              <p className="font-display text-4xl text-navy">{p.price}</p>
              <p className="mt-1 text-[11px] tracking-[0.24em] uppercase text-muted-foreground">{p.operation}</p>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
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
                <p className="text-[11px] tracking-[0.24em] uppercase text-muted-foreground mt-1">{m.l}</p>
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

          <section className="mt-16">
            <h2 className="font-display text-3xl text-navy">Ubicación</h2>
            <div className="mt-6 aspect-[16/7] bg-cream-deep border border-border flex items-center justify-center">
              <div className="text-center">
                <MapPin size={28} className="text-gold mx-auto" />
                <p className="mt-3 text-navy font-display text-xl">{p.address}</p>
                <p className="text-sm text-muted-foreground">{p.city}, {p.country}</p>
              </div>
            </div>
          </section>
        </article>

        {/* SIDEBAR */}
        <aside className="lg:sticky lg:top-28 lg:self-start space-y-6">
          <div className="border border-border bg-card p-8">
            <p className="eyebrow">Gestionado por</p>
            <div className="mt-4 flex items-center gap-4 pb-6 border-b border-border">
              <div className="h-14 w-14 border border-gold text-gold flex items-center justify-center font-display text-xl">BC</div>
              <div>
                <p className="font-display text-xl text-navy">Benjamín Cousiño</p>
                <p className="text-xs text-muted-foreground">Oficina {p.office}</p>
              </div>
            </div>
            <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="mt-6 block text-navy font-display text-2xl hover:text-gold">{p.phone}</a>
            <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mt-2">
              {p.office === "Madrid" ? "Lun–Vie 9:00–19:00 · Sáb 10:00–14:00" : "Lun–Vie 9:00–18:30"}
            </p>
            <button className="mt-6 w-full bg-navy text-cream py-4 text-[11px] tracking-[0.28em] uppercase hover:bg-gold hover:text-navy transition-colors">
              Solicitar Visita
            </button>
            <button className="mt-2 w-full border border-border py-4 text-[11px] tracking-[0.24em] uppercase text-navy hover:bg-cream-deep inline-flex items-center justify-center gap-2">
              <Heart size={14} /> Guardar
            </button>
          </div>

          <div className="border border-gold/40 p-8 bg-cream-deep">
            <p className="eyebrow">¿Busca algo diferente?</p>
            <p className="mt-3 text-sm text-navy/80 leading-relaxed">Consulte nuestra cartera off market de 1.800+ propiedades no publicadas.</p>
            <Link to="/off-market" className="mt-4 inline-flex items-center gap-2 text-[11px] tracking-[0.24em] uppercase text-gold hover:text-navy">
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
            <Link to="/propiedades" className="text-[11px] tracking-[0.28em] uppercase text-gold hover:text-navy inline-flex items-center gap-2">Ver todas <ArrowRight size={14} /></Link>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {similar.map((s) => <PropertyCard key={s.id} p={s} />)}
          </div>
        </div>
      </section>
    </div>
  );
}
