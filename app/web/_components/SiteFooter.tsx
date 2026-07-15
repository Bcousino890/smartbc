import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="bg-navy text-cream/90 mt-24">
      <div className="container-luxe py-20 grid gap-12 md:grid-cols-4">
        <div className="md:col-span-2 max-w-md">
          <img
            src="/logo.png"
            alt="Benjamín Cousiño Propiedades"
            className="h-8 w-auto brightness-0 invert mb-6"
          />

          <p className="mt-4 font-display italic text-2xl leading-snug text-cream/90">
            &ldquo;Nos adaptamos a ti.<br />No al revés.&rdquo;
          </p>
          <p className="mt-6 text-sm text-cream/60 leading-relaxed">
            Personal shopper inmobiliario en España y Chile. Acceso a una cartera privada de más de 1.800 propiedades off market en las ubicaciones más exclusivas.
          </p>
          <a href="mailto:contacto@bcousinorprop.com" className="mt-6 inline-block text-cream hover:text-gold transition-colors tracking-wide">
            contacto@bcousinorprop.com
          </a>
        </div>

        <div>
          <p className="eyebrow text-gold">Madrid · España</p>
          <p className="mt-4 font-display text-2xl">Calle Serrano 19</p>
          <p className="text-sm text-cream/70 mt-1">28001 Madrid — Barrio Salamanca</p>
          <a href="tel:+34694209763" className="block mt-4 text-cream hover:text-gold transition-colors">+34 694 209 763</a>
          <p className="text-xs text-cream/50 mt-2 tracking-wider">Lun–Vie 9:00–19:00 · Sáb 10:00–14:00</p>
        </div>

        <div>
          <p className="eyebrow text-gold">Vitacura · Chile</p>
          <p className="mt-4 font-display text-2xl">Av. Kennedy 7440</p>
          <p className="text-sm text-cream/70 mt-1">Oficina 701, Vitacura</p>
          <a href="tel:+56961791938" className="block mt-4 text-cream hover:text-gold transition-colors">+56 9 61791938</a>
          <p className="text-xs text-cream/50 mt-2 tracking-wider">Lun–Vie 9:00–18:30</p>
        </div>
      </div>

      <div className="border-t border-cream/10">
        <div className="container-luxe py-6 flex flex-col md:flex-row justify-between items-center gap-4 text-[11px] tracking-[0.22em] uppercase text-cream/50">
          <p>© {new Date().getFullYear()} Benjamín Cousiño Propiedades</p>
          <div className="flex gap-8">
            <Link href="/web/propiedades" className="hover:text-gold">Propiedades</Link>
            <Link href="/web/off-market" className="hover:text-gold">Off Market</Link>
            <Link href="/web/nosotros" className="hover:text-gold">Nosotros</Link>
            <Link href="/web/contacto" className="hover:text-gold">Contacto</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
