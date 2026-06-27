import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import logoAsset from "@/assets/benjamin-cousino-logo.png.asset.json";

const nav = [
  { to: "/propiedades", label: "Propiedades" },
  { to: "/off-market", label: "Off Market" },
  { to: "/nosotros", label: "Nosotros" },
  { to: "/contacto", label: "Contacto" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onHome = pathname === "/";

  return (
    <header
      className={`sticky top-0 z-50 backdrop-blur-md transition-colors ${
        onHome ? "bg-cream/80" : "bg-cream/95"
      } border-b border-border/60`}
    >
      <div className="container-luxe flex items-center justify-between py-5">
        <Link to="/" className="flex items-center group" aria-label="Benjamín Cousiño Propiedades">
          <img
            src={logoAsset.url}
            alt="Benjamín Cousiño Propiedades"
            className="h-20 md:h-28 w-auto"
          />
        </Link>

        <nav className="hidden lg:flex items-center gap-10">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-[12px] tracking-[0.22em] uppercase text-navy/80 hover:text-gold transition-colors"
              activeProps={{ className: "text-gold" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-6">
          <div className="flex items-center gap-3 text-[11px] tracking-[0.2em] uppercase text-muted-foreground">
            <span>EUR</span><span className="text-gold">·</span>
            <span>CLP</span><span className="text-gold">·</span>
            <span>USD</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-3 text-[11px] tracking-[0.2em] uppercase text-muted-foreground">
            <span className="text-navy">ES</span><span className="text-gold">·</span>
            <span>EN</span>
          </div>
          <Link to="/contacto" className="text-[11px] tracking-[0.28em] uppercase text-navy border border-navy/30 px-5 py-2 hover:bg-navy hover:text-cream transition-colors">
            Acceder
          </Link>
        </div>

        <button onClick={() => setOpen(!open)} className="lg:hidden text-navy" aria-label="Menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border/60 bg-cream">
          <div className="container-luxe py-6 flex flex-col gap-4">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
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
