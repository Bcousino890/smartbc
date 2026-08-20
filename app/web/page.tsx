"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Plus, Minus } from "lucide-react";
import type { Property } from "@/lib/portal-properties";
import { PropertyCard } from "./_components/PropertyCard";
import { SectionEyebrow } from "./_components/SectionEyebrow";

const moments = [
  {
    n: "01",
    eyebrow: "Residencia Principal",
    title: "Su Casa",
    italic: "Principal",
    body: "Apartamento, villa o chalet como hogar permanente. Le acompañamos en todo el proceso de cambio de país: legal, fiscal, decoración y mudanza.",
    tags: ["Salamanca", "Pozuelo", "Lo Barnechea", "Vitacura", "Las Condes", "Barcelona"],
    img: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1400&q=80&auto=format&fit=crop",
  },
  {
    n: "02",
    eyebrow: "Segunda Residencia",
    title: "Su Casa",
    italic: "de Verano",
    body: "Frente al mar en las costas más exclusivas de Chile y España. Desde Zapallar y Cachagua hasta Marbella o la Costa Brava.",
    tags: ["Zapallar · Cachagua", "Maitencillo", "Marbella", "Costa Brava"],
    img: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1400&q=80&auto=format&fit=crop",
  },
  {
    n: "03",
    eyebrow: "Montaña & Naturaleza",
    title: "Su Casa",
    italic: "de Nieve",
    body: "Casas en entornos de montaña, nieve y naturaleza. Puerto Varas, La Parva o la Sierra Nevada española. Retiros únicos.",
    tags: ["Puerto Varas", "Pichilemu", "Sierra Nevada"],
    img: "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=1400&q=80&auto=format&fit=crop",
  },
];

const institutions = [
  { name: "IE University", domain: "ie.edu" },
  { name: "IESE Business School", domain: "iese.edu" },
  { name: "ESCP Business School", domain: "escp.eu" },
  { name: "ESADE Business School", domain: "esade.edu" },
  { name: "Comillas ICADE–ICAI", domain: "comillas.edu" },
  { name: "Universidad de Navarra", domain: "unav.edu" },
  { name: "CUNEF Universidad", domain: "cunef.edu" },
  { name: "Universidad Carlos III", domain: "uc3m.es" },
  { name: "Universidad Autónoma de Madrid", domain: "uam.es" },
  { name: "Universidad Complutense", domain: "ucm.es" },
  { name: "Universidad Politécnica de Madrid", domain: "upm.es" },
  { name: "Universidad de Alcalá", domain: "uah.es" },
  { name: "Universidad CEU San Pablo", domain: "uspceu.com" },
  { name: "Universidad Nebrija", domain: "nebrija.com" },
  { name: "ESIC University", domain: "esic.edu" },
  { name: "Universidad Europea", domain: "universidadeuropea.com" },
  { name: "Universidad Francisco de Vitoria", domain: "ufv.es" },
  { name: "Universidad Alfonso X", domain: "uax.com" },
  { name: "Universidad Rey Juan Carlos", domain: "urjc.es" },
  { name: "IED Madrid", domain: "ied.es" },
  { name: "EAE Business School", domain: "eae.es" },
  { name: "Saint Louis University Madrid", domain: "slu.edu" },
  { name: "Centro de Estudios Garrigues", domain: "centrogarrigues.com" },
  { name: "IEB", domain: "ieb.es" },
  { name: "CEMFI", domain: "cemfi.es" },
  { name: "ISDE", domain: "isde.es" },
  { name: "EOI Business School", domain: "eoi.es" },
  { name: "Deusto Business School", domain: "deusto.es" }
];

const faqs = [
  { q: "¿Debo pagar algo por adelantado para buscar un piso de alquiler?", a: "No, solo paga por nuestros servicios en el momento en que se concreta la operación, es decir, a la firma del contrato y entrega de llaves. Nuestra prioridad es que encuentre un hogar seguro sin riesgos iniciales." },
  { q: "¿Cómo aseguran que la propiedad no es una estafa?", a: "Verificamos que la propiedad sea legítima, revisamos el contrato y evitamos cláusulas abusivas. Somos sus ojos en Madrid y Santiago — nuestra prioridad es usted." },
  { q: "¿Puedo gestionar la compra de una propiedad sin estar en España?", a: "Sí. La mayoría de nuestros clientes nos contactan desde sus países. Hacemos todo el proceso online, incluyendo informes, vídeos de visita y gestión de trámites. El cambio de país es nuestro día a día." },
  { q: "¿Operan también fuera de Santiago y Madrid?", a: "Sí. En Chile cubrimos Zapallar, Cachagua, Maitencillo, Puerto Varas, Pichilemu y otras zonas. En España trabajamos Madrid, Barcelona, Marbella y Costa Brava. Si su destino no aparece aquí, consúltenos." },
];

export default function Home() {
  const [featured, setFeatured] = useState<Property[]>([]);

  useEffect(() => {
    fetch("/api/portal/properties")
      .then((r) => r.ok ? r.json() : [])
      // Sin fallback de demostración: si no hay catálogo, la sección de
      // destacadas se queda vacía en vez de enseñar pisos inventados.
      .then((data: Property[]) => setFeatured(data.slice(0, 4)))
      .catch(() => setFeatured([]));
  }, []);

  return (
    <div>
      {/* HERO */}
      <section className="relative min-h-[92vh] flex items-end overflow-hidden">
        <img src="/portal-hero.jpg" alt="Villa de lujo frente al mar" className="absolute inset-0 h-full w-full object-cover" width={1920} height={1280} />
        <div className="absolute inset-0 bg-gradient-to-b from-cream/40 via-cream/10 to-navy/70" />
        <div className="absolute top-32 right-8 hidden md:flex items-center gap-3 bg-cream/90 backdrop-blur-sm px-5 py-3 border-l-2 border-gold">
          <span className="h-2 w-2 rounded-full bg-gold" />
          <p className="text-[11px] tracking-[0.24em] uppercase text-navy">1.800+ Propiedades Off Market</p>
        </div>

        <div className="container-luxe relative z-10 pb-24 pt-40">
          <p className="eyebrow text-gold">Personal Shopper Inmobiliario · España · Chile</p>
          <h1 className="mt-6 font-display text-5xl md:text-7xl lg:text-[5.5rem] leading-[1.02] text-navy max-w-5xl">
            Vidas Extraordinarias<br />
            en <span className="italic-display text-navy/90">Lugares Excepcionales</span>
          </h1>
          <p className="mt-8 max-w-xl text-base text-cream leading-relaxed bg-navy/55 backdrop-blur-sm border-l-2 border-gold px-5 py-4">
            Sabemos cómo vive en su país — y queremos que viva igual o mejor. Sin barreras de idioma ni diferencias culturales. Nos adaptamos completamente a usted.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/web/propiedades" className="bg-navy text-cream px-8 py-4 text-[11px] tracking-[0.28em] uppercase hover:bg-gold hover:text-navy transition-colors">
              Ver Propiedades
            </Link>
            <Link href="/web/off-market" className="border border-navy/30 text-navy px-8 py-4 text-[11px] tracking-[0.28em] uppercase hover:bg-navy hover:text-cream transition-colors inline-flex items-center gap-3">
              Cartera Off Market <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* QUICK SEARCH */}
      <section className="bg-cream-deep border-y border-stone-200/60">
        <div className="container-luxe py-10 grid md:grid-cols-[1fr_auto] items-center gap-8">
          <p className="text-sm text-navy/80 max-w-xl leading-relaxed">
            <span className="font-medium text-navy">1.800+ propiedades off market disponibles</span> — No publicadas en ningún portal. Solo accesibles mediante solicitud privada.
          </p>
          <Link href="/web/off-market" className="text-[11px] tracking-[0.28em] uppercase text-gold hover:text-navy inline-flex items-center gap-2">
            Solicitar Acceso <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* MOMENTS */}
      <section className="container-luxe py-28">
        <SectionEyebrow>Para Cada Momento de su Vida</SectionEyebrow>
        <h2 className="mt-6 font-display text-4xl md:text-6xl text-center text-navy leading-tight max-w-4xl mx-auto">
          Su hogar ideal, <span className="italic-display">donde y cuando lo necesite</span>
        </h2>
        <div className="mt-20 grid gap-10 md:grid-cols-3">
          {moments.map((m) => (
            <article key={m.n} className="group">
              <div className="aspect-[4/5] overflow-hidden bg-stone-100">
                <img src={m.img} alt={m.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-[1400ms] group-hover:scale-105" />
              </div>
              <div className="pt-6">
                <p className="text-[11px] tracking-[0.28em] uppercase text-gold">{m.n} · {m.eyebrow}</p>
                <h3 className="mt-4 font-display text-3xl text-navy">
                  {m.title} <span className="italic-display">{m.italic}</span>
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-gray-500">{m.body}</p>
                <div className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tracking-wider uppercase text-navy/60">
                  {m.tags.map((t) => <span key={t}>· {t}</span>)}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* FEATURED */}
      <section className="bg-cream-deep py-28">
        <div className="container-luxe">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <p className="eyebrow">Selección Premium</p>
              <h2 className="mt-4 font-display text-4xl md:text-6xl text-navy">
                Propiedades <span className="italic-display">Destacadas</span>
              </h2>
            </div>
            <Link href="/web/propiedades" className="text-[11px] tracking-[0.28em] uppercase text-gold hover:text-navy inline-flex items-center gap-2">
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {featured.length > 0
              ? featured.map((p) => <PropertyCard key={p.id} p={p} />)
              : <p className="col-span-4 text-center text-sm text-navy/50 py-12">Próximamente — propiedades publicadas aparecerán aquí.</p>
            }
          </div>
        </div>
      </section>

      {/* OFF MARKET BANNER */}
      <section className="relative py-32 overflow-hidden">
        <img src="https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1800&q=80&auto=format&fit=crop" alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-navy/80" />
        <div className="container-luxe relative z-10 max-w-4xl text-center text-cream">
          <p className="eyebrow">Cartera Privada</p>
          <h2 className="mt-6 font-display text-5xl md:text-7xl leading-tight">
            1.800+ propiedades<br />que <span className="italic-display">no verá</span> en internet
          </h2>
          <p className="mt-8 text-cream/80 max-w-2xl mx-auto leading-relaxed">
            Nuestra cartera off market incluye residencias, villas y pisos premium en Santiago, Madrid, Costa Brava y otras ubicaciones exclusivas.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link href="/web/off-market" className="bg-gold text-navy px-8 py-4 text-[11px] tracking-[0.28em] uppercase hover:bg-cream transition-colors">Solicitar Acceso Privado</Link>
            <Link href="/web/contacto" className="border border-cream/40 text-cream px-8 py-4 text-[11px] tracking-[0.28em] uppercase hover:bg-cream hover:text-navy transition-colors">Hablar con Asesor</Link>
          </div>
        </div>
      </section>

      {/* TWO COUNTRIES */}
      <section className="container-luxe py-28">
        <div className="grid md:grid-cols-2 gap-8">
          {[
            { country: "España", cities: "Madrid · Pozuelo · Barcelona", coast: "Marbella · Costa Brava", img: "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=1400&q=80&auto=format&fit=crop" },
            { country: "Chile", cities: "Lo Barnechea · Vitacura · Las Condes", coast: "Zapallar · Cachagua · Puerto Varas", img: "https://images.unsplash.com/photo-1508193638397-1c4234db14d8?w=1400&q=80&auto=format&fit=crop" },
          ].map((c) => (
            <div key={c.country} className="relative aspect-[4/3] overflow-hidden group">
              <img src={c.img} alt={c.country} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-navy/85 via-navy/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-10 text-cream">
                <h3 className="font-display text-5xl md:text-6xl">{c.country}</h3>
                <p className="mt-3 text-sm tracking-[0.18em] uppercase text-cream/80">{c.cities}</p>
                <p className="italic-display text-xl mt-1 text-gold-soft">{c.coast}</p>
              </div>
            </div>
          ))}
        </div>
        <blockquote className="mt-20 text-center font-display italic text-4xl md:text-6xl text-navy leading-tight">
          &ldquo;Nos adaptamos a ti.<br />No al revés.&rdquo;
        </blockquote>
      </section>

      {/* INTERNATIONAL CLIENTS */}
      <section className="bg-navy text-cream py-28">
        <div className="container-luxe grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="eyebrow text-gold">Clientes Internacionales</p>
            <h2 className="mt-6 font-display text-4xl md:text-6xl leading-tight">
              Sabemos cómo <span className="italic-display text-gold-soft">vive en su país.</span>
            </h2>
            <p className="mt-8 text-cream/80 leading-relaxed">
              Trabajamos con clientes de más de diez países que llegan a España o Chile por estudios, trabajo, diplomacia o familia.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {["Estudiantes de Intercambio", "Diplomáticos", "Directivos & Ejecutivos", "Familias en Reubicación"].map((t) => (
                <span key={t} className="text-[11px] tracking-[0.2em] uppercase border border-cream/20 px-4 py-2">{t}</span>
              ))}
            </div>
          </div>

          <div>
            <p className="eyebrow text-gold">Países Principales</p>
            <div className="mt-6 grid grid-cols-2 gap-px bg-cream/10">
              {["México", "Colombia", "EE.UU.", "Alemania"].map((c) => (
                <div key={c} className="bg-navy py-8 text-center font-display text-3xl text-cream">{c}</div>
              ))}
            </div>
            <p className="mt-10 text-[11px] tracking-[0.28em] uppercase text-cream/60">También atendemos</p>
            <p className="mt-3 text-cream/80 font-display italic text-xl leading-relaxed">
              Italia · Rumanía · Turquía · Argentina · Reino Unido · Francia · Portugal · Suiza · Países Bajos · Bélgica · Austria · Suecia · Noruega · Dinamarca · Irlanda · Luxemburgo · Mónaco · Emiratos Árabes Unidos
            </p>
          </div>
        </div>

        <div className="container-luxe mt-24 grid grid-cols-2 md:grid-cols-4 gap-px bg-cream/10">
          {[
            { n: "7+", l: "Años Encontrando Hogares" },
            { n: "10+", l: "Países de Origen" },
            { n: "1.8K+", l: "Propiedades Off Market" },
            { n: "2", l: "Oficinas" },
          ].map((s) => (
            <div key={s.l} className="bg-navy py-12 px-6 text-center">
              <p className="font-display text-6xl text-gold">{s.n}</p>
              <p className="mt-3 text-[11px] tracking-[0.24em] uppercase text-cream/70">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* UNIVERSITIES MARQUEE */}
      <section className="py-24 bg-cream">
        <div className="container-luxe text-center">
          <p className="eyebrow">Confían en Nosotros</p>
          <h2 className="mt-6 font-display text-4xl md:text-5xl text-navy max-w-3xl mx-auto leading-tight">
            Recomendados en las principales <span className="italic-display">instituciones de Madrid</span>
          </h2>
        </div>
        <div className="mt-16 overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-cream to-transparent z-10" />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-cream to-transparent z-10" />
          <div className="flex w-max animate-marquee gap-px bg-stone-200/50">
            {[...institutions, ...institutions].map((institution, index) => (
              <div
                key={`${institution.domain}-${index}`}
                className="flex h-32 w-60 shrink-0 flex-col items-center justify-center border border-navy/5 bg-cream px-6"
              >
                <img
                  src={`https://img.logo.dev/${institution.domain}?token=${process.env.NEXT_PUBLIC_LOGO_DEV_KEY}&size=256&format=png`}
                  alt={`Logo de ${institution.name}`}
                  loading="lazy"
                  className="h-14 w-36 object-contain grayscale opacity-70 transition hover:grayscale-0 hover:opacity-100"
                />

                <span className="mt-3 text-center text-sm text-navy">
                  {institution.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* B2B */}
      <section className="bg-navy text-cream py-28">
        <div className="container-luxe grid lg:grid-cols-12 gap-16 items-center">
          <div className="lg:col-span-7">
            <p className="eyebrow text-gold">Para Empresas & Profesionales</p>
            <h2 className="mt-6 font-display text-4xl md:text-6xl leading-[1.05]">
              ¿Eres una empresa? <span className="italic-display text-gold">Colaboremos.</span>
            </h2>
            <p className="mt-8 text-cream/80 leading-relaxed max-w-2xl">
              Trabajamos junto a despachos de abogados, family offices, consultoras de movilidad internacional, agencias inmobiliarias y departamentos de RR.HH.
            </p>
            <div className="mt-10 grid sm:grid-cols-2 gap-x-10 gap-y-5">
              {[
                "Acceso a cartera off-market 1.800+",
                "Acuerdos de colaboración y co-broking",
                "Comisiones compartidas transparentes",
                "Atención multilingüe ES · EN · IT · PT",
                "Reubicación llave en mano para ejecutivos",
                "NDA y confidencialidad garantizada",
              ].map((t) => (
                <div key={t} className="flex items-start gap-3 text-cream/85">
                  <span className="mt-2 h-px w-6 bg-gold shrink-0" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <div className="mt-12 flex flex-wrap gap-4">
              <Link href="/web/contacto" className="text-[11px] tracking-[0.28em] uppercase bg-gold text-navy px-8 py-4 hover:bg-cream transition-colors">
                Hablemos de Colaboración
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="border border-cream/15 p-10">
              <p className="eyebrow text-gold">Colaboramos con</p>
              <ul className="mt-8 space-y-5 font-display text-2xl text-cream/90 leading-tight">
                <li>Despachos de Abogados<span className="block text-[11px] tracking-[0.22em] uppercase text-cream/50 mt-1">Inmigración · Patrimonio · Family Office</span></li>
                <li>Consultoras de Movilidad<span className="block text-[11px] tracking-[0.22em] uppercase text-cream/50 mt-1">Relocation & Global Mobility</span></li>
                <li>Agencias Inmobiliarias<span className="block text-[11px] tracking-[0.22em] uppercase text-cream/50 mt-1">Co-broking en España y Chile</span></li>
                <li>Departamentos de RR.HH.<span className="block text-[11px] tracking-[0.22em] uppercase text-cream/50 mt-1">Multinacionales · Embajadas · Diplomacia</span></li>
                <li>Wealth Managers & Banca Privada<span className="block text-[11px] tracking-[0.22em] uppercase text-cream/50 mt-1">Inversión inmobiliaria de alto patrimonio</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-luxe py-28 max-w-4xl">
        <div className="text-center">
          <p className="eyebrow">Preguntas Frecuentes</p>
          <h2 className="mt-6 font-display text-4xl md:text-6xl text-navy">
            Resolvemos sus <span className="italic-display">dudas</span>
          </h2>
        </div>
        <div className="mt-16 divide-y divide-stone-200">
          {faqs.map((f, i) => <Faq key={i} q={f.q} a={f.a} />)}
        </div>
        <div className="mt-12 text-center">
          <Link href="/web/contacto" className="text-[11px] tracking-[0.28em] uppercase text-gold hover:text-navy inline-flex items-center gap-2">
            ¿Más preguntas? Contáctenos <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* CLOSER */}
      <section className="bg-navy text-cream py-32 text-center">
        <div className="container-luxe max-w-3xl">
          <p className="eyebrow text-gold">Personal Shopper a su medida</p>
          <h2 className="mt-6 font-display text-4xl md:text-6xl leading-tight">
            Conectamos personas con <span className="italic-display text-gold-soft">espacios extraordinarios</span>
          </h2>
          <p className="mt-8 text-cream/80 leading-relaxed">
            Nuestros asesores en Santiago y Madrid le acompañan desde la primera consulta hasta la firma, con acceso a propiedades que no encontrará en ningún otro lugar.
          </p>
          <Link href="/web/contacto" className="mt-10 inline-block bg-gold text-navy px-10 py-4 text-[11px] tracking-[0.28em] uppercase hover:bg-cream transition-colors">
            Hablar con Nuestra Oficina
          </Link>
        </div>
      </section>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full py-6 flex items-center justify-between gap-6 text-left">
        <span className="font-display text-xl md:text-2xl text-navy">{q}</span>
        <span className="text-gold shrink-0">{open ? <Minus size={20} /> : <Plus size={20} />}</span>
      </button>
      {open && <p className="pb-6 text-gray-500 leading-relaxed pr-12">{a}</p>}
    </div>
  );
}
