"use client";

import { useState } from "react";

export default function Contacto() {
  const [sent, setSent] = useState(false);

  return (
    <div>
      <section className="container-luxe pt-20 pb-16">
        <p className="eyebrow">Hablemos</p>
        <h1 className="mt-6 font-display text-5xl md:text-8xl text-navy leading-[1.02]">
          Cuéntenos <span className="italic-display">qué busca</span>
        </h1>
        <p className="mt-10 max-w-2xl text-navy/80 leading-relaxed">
          Un asesor de nuestra oficina en Santiago o Madrid le presentará las mejores oportunidades, incluyendo nuestra cartera off market exclusiva de 1.800+ propiedades.
        </p>
      </section>

      <section className="container-luxe pb-28 grid lg:grid-cols-[1fr_360px] gap-16 items-start">
        <div className="bg-white border border-stone-200 p-10 lg:p-14">
          {sent ? (
            <div className="text-center py-16">
              <p className="eyebrow">Recibido</p>
              <h3 className="mt-4 font-display text-4xl text-navy">¡Mensaje enviado!</h3>
              <p className="mt-4 text-gray-500">Nos pondremos en contacto en menos de 24 horas con información personalizada.</p>
            </div>
          ) : (
            <>
              <h2 className="font-display text-3xl text-navy">Envíenos un mensaje</h2>
              <form className="mt-10 space-y-6" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
                <div className="grid sm:grid-cols-2 gap-6">
                  <F label="Nombre completo *"><input required className="w-full border-b border-stone-200 bg-transparent py-3 focus:border-gold outline-none" /></F>
                  <F label="Email *"><input required type="email" className="w-full border-b border-stone-200 bg-transparent py-3 focus:border-gold outline-none" /></F>
                  <F label="Teléfono"><input className="w-full border-b border-stone-200 bg-transparent py-3 focus:border-gold outline-none" /></F>
                  <F label="País de interés">
                    <select className="w-full border-b border-stone-200 bg-transparent py-3 focus:border-gold outline-none">
                      <option>España (Madrid)</option><option>Chile (Santiago)</option><option>Ambos</option>
                    </select>
                  </F>
                </div>
                <F label="Asunto">
                  <select className="w-full border-b border-stone-200 bg-transparent py-3 focus:border-gold outline-none">
                    <option>Consulta sobre una propiedad publicada</option>
                    <option>Acceso a cartera off market</option>
                    <option>Quiero vender / alquilar mi propiedad</option>
                    <option>Solicitar valoración</option>
                    <option>Otros</option>
                  </select>
                </F>
                <F label="Mensaje *"><textarea required rows={5} className="w-full border-b border-stone-200 bg-transparent py-3 focus:border-gold outline-none resize-none" /></F>
                <label className="flex items-start gap-3 text-xs text-gray-400">
                  <input type="checkbox" required className="mt-1" style={{ accentColor: "#c9a96e" }} />
                  Acepto la política de privacidad y el tratamiento confidencial de mis datos.
                </label>
                <div className="flex items-center justify-between gap-4 pt-4">
                  <p className="text-[11px] tracking-[0.24em] uppercase text-gold">Respuesta &lt; 24h</p>
                  <button className="bg-navy text-cream px-10 py-4 text-[11px] tracking-[0.28em] uppercase hover:bg-gold hover:text-navy transition-colors">Enviar Mensaje</button>
                </div>
              </form>
            </>
          )}
        </div>

        <aside className="space-y-8">
          <div>
            <p className="eyebrow">Email Directo</p>
            <a href="mailto:contacto@bcousinorprop.com" className="mt-3 block font-display text-2xl text-navy hover:text-gold transition-colors break-all">
              contacto@bcousinorprop.com
            </a>
          </div>
          <div>
            <p className="eyebrow">Nuestras Oficinas</p>
          </div>

          {[
            { city: "Madrid, España", addr: "Calle Serrano 19, 28001", phone: "+34 694 209 763", hours: "Lun–Vie 9:00–19:00 · Sáb 10:00–14:00" },
            { city: "Vitacura, Chile", addr: "Av. Kennedy 7440, Oficina 701 · Vitacura", phone: "+56 9 61791938", hours: "Lun–Vie 9:00–18:30" },
          ].map((o) => (
            <div key={o.city} className="border-l-2 border-gold pl-5">
              <p className="font-display text-2xl text-navy">{o.city}</p>
              <p className="text-sm text-gray-500 mt-2">{o.addr}</p>
              <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="block mt-3 text-navy hover:text-gold font-medium">{o.phone}</a>
              <p className="mt-1 text-[11px] tracking-[0.2em] uppercase text-gray-400">{o.hours}</p>
            </div>
          ))}

          <div className="border border-gold/40 p-6 bg-cream-deep mt-12">
            <p className="eyebrow">¿Busca algo específico?</p>
            <p className="mt-3 text-sm text-navy/80 leading-relaxed">
              Si busca propiedades off market, use el formulario dedicado para un acceso más rápido a nuestra cartera privada.
            </p>
            <a href="/web/off-market" className="mt-4 inline-flex items-center gap-2 text-[11px] tracking-[0.24em] uppercase text-gold hover:text-navy">
              Solicitar Cartera Off Market →
            </a>
          </div>
        </aside>
      </section>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] tracking-[0.22em] uppercase text-gray-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
