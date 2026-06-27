import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/off-market")({
  head: () => ({
    meta: [
      { title: "Cartera Off Market — 1.800+ propiedades invisibles" },
      { name: "description", content: "Acceso privado a 1.800+ propiedades off market en Madrid, Santiago y otras ubicaciones exclusivas. Solo mediante solicitud." },
      { property: "og:title", content: "Cartera Off Market — Benjamín Cousiño" },
      { property: "og:description", content: "1.800+ propiedades invisibles. Acceso solo por solicitud privada." },
      { property: "og:image", content: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1600&q=80" },
    ],
  }),
  component: OffMarket,
});

function OffMarket() {
  const [sent, setSent] = useState(false);

  return (
    <div>
      {/* HERO */}
      <section className="relative min-h-[70vh] flex items-center overflow-hidden">
        <img src="https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1800&q=80&auto=format&fit=crop" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-navy/85" />
        <div className="container-luxe relative z-10 py-32 text-cream">
          <p className="eyebrow text-gold">Cartera Privada Off Market</p>
          <h1 className="mt-6 font-display text-5xl md:text-8xl leading-[1.02] max-w-5xl">
            1.800+ <span className="italic-display text-gold-soft">propiedades invisibles</span>
          </h1>
          <p className="mt-8 max-w-2xl text-cream/80 leading-relaxed">
            Residencias, villas y pisos en Madrid, Santiago y otras ubicaciones exclusivas que no encontrará en ningún portal. Solo accesibles mediante solicitud privada a nuestra oficina.
          </p>
        </div>
      </section>

      {/* WHY */}
      <section className="container-luxe py-24 grid lg:grid-cols-2 gap-16 items-start">
        <div>
          <p className="eyebrow">Por qué Off Market</p>
          <h2 className="mt-6 font-display text-4xl md:text-6xl text-navy leading-tight">
            El mercado que <span className="italic-display">no se anuncia</span>
          </h2>
          <p className="mt-8 text-navy/80 leading-relaxed">
            Muchos propietarios de inmuebles premium prefieren vender o alquilar con absoluta discreción. Sin anuncios, sin portales, sin visitas de curiosos. Solo compradores o arrendatarios calificados, presentados por intermediarios de confianza.
          </p>
          <p className="mt-4 text-navy/80 leading-relaxed">
            Tras más de 7 años en el sector, nuestra oficina ha construido una red que da acceso directo a este mercado invisible: más de 1.800 propiedades activas en Chile y España.
          </p>
          <div className="mt-12 grid grid-cols-2 gap-px bg-border">
            <div className="bg-cream py-10 px-6">
              <p className="font-display text-6xl text-gold">1.800+</p>
              <p className="mt-3 text-[11px] tracking-[0.24em] uppercase text-muted-foreground">Propiedades activas</p>
            </div>
            <div className="bg-cream py-10 px-6">
              <p className="font-display text-6xl text-gold">60%</p>
              <p className="mt-3 text-[11px] tracking-[0.24em] uppercase text-muted-foreground">Operaciones off market</p>
            </div>
          </div>
        </div>

        {/* FORM */}
        <div className="bg-cream-deep p-10 lg:p-14 border-t-2 border-gold">
          <p className="eyebrow">Solicitud de Acceso</p>
          <h3 className="mt-4 font-display text-3xl text-navy">Defina qué busca</h3>
          <p className="mt-3 text-sm text-muted-foreground">Complete su perfil y un asesor le presentará las oportunidades disponibles en nuestra cartera privada.</p>

          {sent ? (
            <div className="mt-8 border border-gold p-8 text-center">
              <p className="font-display text-2xl text-navy">Solicitud recibida</p>
              <p className="mt-3 text-sm text-muted-foreground">Un asesor de nuestra oficina revisará su perfil y le contactará en menos de 24 horas con las mejores opciones disponibles.</p>
            </div>
          ) : (
            <form className="mt-8 space-y-5" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
              <Field label="Nombre *"><input required className="w-full bg-cream border border-border px-4 py-3 focus:border-gold outline-none" /></Field>
              <Field label="Email *"><input required type="email" className="w-full bg-cream border border-border px-4 py-3 focus:border-gold outline-none" /></Field>
              <Field label="Teléfono"><input className="w-full bg-cream border border-border px-4 py-3 focus:border-gold outline-none" /></Field>
              <Field label="Operación">
                <select className="w-full bg-cream border border-border px-4 py-3 focus:border-gold outline-none">
                  <option>Seleccione</option><option>Compra</option><option>Alquiler larga duración</option><option>Alquiler vacacional</option>
                </select>
              </Field>
              <Field label="Presupuesto">
                <select className="w-full bg-cream border border-border px-4 py-3 focus:border-gold outline-none">
                  <option>Seleccione rango</option><option>Hasta 500.000 €</option><option>500.000 – 1.500.000 €</option><option>1.500.000 – 4.000.000 €</option><option>Más de 4.000.000 €</option>
                </select>
              </Field>
              <Field label="País de interés">
                <select className="w-full bg-cream border border-border px-4 py-3 focus:border-gold outline-none">
                  <option>Seleccione</option><option>España (Madrid / Costa Brava)</option><option>Chile (Santiago y alrededores)</option><option>Ambos</option>
                </select>
              </Field>
              <Field label="Descripción de su búsqueda"><textarea rows={4} className="w-full bg-cream border border-border px-4 py-3 focus:border-gold outline-none resize-none" /></Field>
              <label className="flex items-start gap-3 text-xs text-muted-foreground">
                <input type="checkbox" required className="mt-1 accent-[color:var(--gold)]" />
                Acepto la política de privacidad y el tratamiento confidencial de mis datos.
              </label>
              <button className="w-full bg-navy text-cream py-4 text-[11px] tracking-[0.28em] uppercase hover:bg-gold hover:text-navy transition-colors">
                Solicitar Acceso a Cartera Privada
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
