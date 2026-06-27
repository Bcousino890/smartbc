import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/nosotros")({
  head: () => ({
    meta: [
      { title: "Nosotros — Personal Shopper a su medida. Dos países." },
      { name: "description", content: "Más de 7 años acompañando a ejecutivos, diplomáticos y familias internacionales en su reubicación a España y Chile." },
      { property: "og:title", content: "Nosotros — Benjamín Cousiño Propiedades" },
      { property: "og:description", content: "Personal shopper inmobiliario en Madrid y Santiago desde 2018." },
      { property: "og:image", content: "https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=1600&q=80" },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div>
      {/* HERO */}
      <section className="container-luxe pt-20 pb-16">
        <p className="eyebrow">Quiénes Somos</p>
        <h1 className="mt-6 font-display text-5xl md:text-8xl leading-[1.02] text-navy max-w-5xl">
          Personal Shopper <span className="italic-display">a su medida.</span><br />
          Dos países.
        </h1>
        <p className="mt-10 max-w-2xl text-base text-navy/80 leading-relaxed">
          Más de 7 años acompañando a ejecutivos, diplomáticos y estudiantes internacionales en su reubicación a Chile y España. Sin idiomas ajenos, sin culturas desconocidas.
        </p>
      </section>

      <section className="container-luxe grid lg:grid-cols-2 gap-16 items-start py-16">
        <div className="aspect-[4/5] overflow-hidden bg-muted">
          <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80&auto=format&fit=crop" alt="Residencia de lujo" className="h-full w-full object-cover" loading="lazy" />
        </div>
        <div>
          <p className="eyebrow">Nuestra Historia</p>
          <h2 className="mt-6 font-display text-4xl md:text-5xl text-navy leading-tight">
            Más de 7 años <span className="italic-display">encontrando hogares.</span>
          </h2>
          <p className="mt-8 text-navy/80 leading-relaxed">
            Fundada en Santiago en 2018, Benjamín Cousiño Propiedades nació para acompañar a quienes llegan a Chile o España desde cualquier parte del mundo. Sabemos cómo vive en su país — y queremos que viva igual o mejor.
          </p>
          <p className="mt-4 text-navy/80 leading-relaxed">
            En 2025 abrimos nuestra primera oficina en Europa, en <strong className="text-navy">Calle Serrano 19, Madrid</strong> — en el corazón de lo que se conoce como <em className="italic-display text-gold">La Milla de Oro</em>. La calle Serrano y su entorno (Barrio Salamanca) concentran las boutiques de lujo internacional, los mejores restaurantes y las residencias más cotizadas de la capital española.
          </p>
          <div className="mt-10 border-l-2 border-gold pl-6 py-2">
            <p className="text-[11px] tracking-[0.28em] uppercase text-gold">¿Por qué La Milla de Oro?</p>
            <p className="mt-3 text-navy/80 leading-relaxed">
              Serrano · Ortega y Gasset · Lagasca · Jorge Juan. Es el barrio más exclusivo y mejor conectado de Madrid. Si en Santiago conoce Vitacura o El Golf, en Madrid esto es su equivalente directo.
            </p>
          </div>
        </div>
      </section>

      {/* APPROACH */}
      <section className="bg-navy text-cream py-28">
        <div className="container-luxe">
          <p className="eyebrow text-gold">Nuestro Enfoque</p>
          <h2 className="mt-6 font-display text-4xl md:text-6xl leading-tight">
            Empresa. <span className="italic-display text-gold-soft">No portal.</span>
          </h2>
          <p className="mt-6 max-w-2xl text-cream/80 leading-relaxed">
            No somos una plataforma de anuncios. Somos un equipo que trabaja activamente, en modo 1 a 1, para encontrar la propiedad exacta que cada cliente necesita.
          </p>
          <ul className="mt-16 grid md:grid-cols-2 gap-x-12 gap-y-6">
            {[
              "Atención 1 a 1 — un único asesor durante todo el proceso",
              "Gestionamos con cualquier inmobiliaria — no solo las nuestras",
              "Discreción absoluta en cada operación",
              "Solo residencial premium — sin comerciales",
              "Sin honorarios hasta cerrar la operación",
            ].map((t) => (
              <li key={t} className="flex items-start gap-4 border-t border-cream/15 pt-6">
                <span className="text-gold font-display text-xl">→</span>
                <span className="text-cream/90 leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 1-1 */}
      <section className="container-luxe py-28">
        <p className="eyebrow">Nuestra Forma de Trabajar</p>
        <h2 className="mt-6 font-display text-4xl md:text-6xl text-navy">
          Atención <span className="italic-display">1 a 1</span>
        </h2>
        <p className="mt-6 max-w-2xl text-navy/80 leading-relaxed">
          Usted no habla con un call center ni con un chatbot. Desde el primer contacto tiene asignado un único asesor que conoce su caso, su presupuesto y sus preferencias. Le responde directamente — no pasa de mano en mano.
        </p>
        <div className="mt-16 grid md:grid-cols-3 gap-px bg-border">
          {[
            { n: "01", t: "Un asesor, todo el proceso", d: "Desde la primera llamada hasta la firma ante notario. Sin intermediarios internos ni cambios de interlocutor." },
            { n: "02", t: "Disponible cuando lo necesite", d: "Coordinamos con el huso horario de Chile y España. Videollamadas, WhatsApp, email — como prefiera." },
            { n: "03", t: "Su idioma, su cultura", d: "Hablamos su idioma — literalmente y culturalmente. Nos adaptamos a sus ritmos, referencias y expectativas." },
          ].map((s) => (
            <div key={s.n} className="bg-cream p-10">
              <p className="font-display text-5xl text-gold">{s.n}</p>
              <h3 className="mt-6 font-display text-2xl text-navy">{s.t}</h3>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* OFFICES */}
      <section className="bg-cream-deep py-28">
        <div className="container-luxe">
          <p className="eyebrow">Dónde Estamos</p>
          <h2 className="mt-6 font-display text-4xl md:text-6xl text-navy">Nuestras Oficinas</h2>
          <div className="mt-14 grid md:grid-cols-2 gap-px bg-border">
            {[
              { country: "España · Desde 2025", city: "Madrid", addr: "Calle Serrano 19", line2: "28001 Madrid — Barrio Salamanca", phone: "+34 694 209 763", hours: "Lun–Vie 9:00–19:00 · Sáb 10:00–14:00" },
              { country: "Chile · Desde 2018", city: "Vitacura", addr: "Av. Kennedy 7440, Oficina 701", line2: "Vitacura, Santiago", phone: "+56 9 61791938", hours: "Lun–Vie 9:00–18:30" },
            ].map((o) => (
              <div key={o.city} className="bg-cream p-12">
                <p className="eyebrow">{o.country}</p>
                <h3 className="mt-4 font-display text-5xl text-navy">{o.city}</h3>
                <p className="mt-6 text-navy">{o.addr}</p>
                <p className="text-sm text-muted-foreground">{o.line2}</p>
                <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="block mt-6 font-display text-2xl text-navy hover:text-gold">{o.phone}</a>
                <p className="mt-2 text-[11px] tracking-[0.22em] uppercase text-muted-foreground">{o.hours}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
