"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import Image from "next/image";

const nav = [
  { href: "/web/propiedades", label: "Propiedades" },
  { href: "/web/off-market", label: "Off Market" },
  { href: "/web/nosotros", label: "Nosotros" },
  { href: "/web/contacto", label: "Contacto" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const onHome = pathname === "/web" || pathname === "/web/";

  return (
    <header
      className={`sticky top-0 z-50 backdrop-blur-md transition-colors ${
        onHome ? "bg-cream/80" : "bg-cream/95"
      } border-b border-stone-200/60`}
    >
      <div className="container-luxe flex items-center justify-between py-5">
        <Link href="/web" className="flex items-center py-1" aria-label="Benjamín Cousiño Propiedades">
          <div className="flex flex-col leading-none">
            <span className="font-display text-xs tracking-[0.06em] text-navy font-bold">BENJAMIN</span>
            <span className="font-display text-xs tracking-[0.06em] text-navy font-bold">COUSIÑO</span>
            <span className="text-[6px] tracking-[0.08em] uppercase text-navy/50 font-sans mt-0.5">Propiedades</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-10">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`text-[12px] tracking-[0.22em] uppercase transition-colors ${
                pathname.startsWith(n.href) ? "text-gold" : "text-navy/80 hover:text-gold"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-6">
          <div className="flex items-center gap-3 text-[11px] tracking-[0.2em] uppercase text-gray-400">
            <span>EUR</span><span className="text-gold">·</span>
            <span>CLP</span><span className="text-gold">·</span>
            <span>USD</span>
          </div>
          <div className="h-4 w-px bg-stone-200" />
          <div className="flex items-center gap-3 text-[11px] tracking-[0.2em] uppercase text-gray-400">
            <span className="text-navy">ES</span><span className="text-gold">·</span>
            <span>EN</span>
          </div>
          <Link href="/web/contacto" className="text-[11px] tracking-[0.28em] uppercase text-navy border border-navy/30 px-5 py-2 hover:bg-navy hover:text-cream transition-colors">
            Acceder
          </Link>
        </div>

        <button onClick={() => setOpen(!open)} className="lg:hidden text-navy" aria-label="Menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-stone-200/60 bg-cream">
          <div className="container-luxe py-6 flex flex-col gap-4">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="text-sm tracking-[0.2em] uppercase text-navy py-2"
              >
                {n.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
