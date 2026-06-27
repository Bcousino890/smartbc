import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import type { Property } from "@/data/properties";

export function PropertyCard({ p, variant = "default" }: { p: Property; variant?: "default" | "compact" }) {
  return (
    <Link
      to="/propiedades/$id"
      params={{ id: p.id }}
      className="group block bg-card border border-border/60 hover:border-gold/50 transition-colors"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={p.cover}
          alt={p.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-[1400ms] group-hover:scale-105"
        />
        {p.badge && (
          <span className="absolute top-4 left-4 bg-cream/95 text-navy text-[10px] tracking-[0.28em] uppercase px-3 py-1.5">
            {p.badge}
          </span>
        )}
        <button className="absolute top-4 right-4 h-9 w-9 bg-cream/90 text-navy flex items-center justify-center hover:bg-gold hover:text-cream transition-colors" aria-label="Favorito">
          <Heart size={14} />
        </button>
        <span className="absolute bottom-4 left-4 text-[10px] tracking-[0.28em] uppercase text-cream bg-navy/70 px-3 py-1">
          {p.operation}
        </span>
      </div>
      <div className="p-6">
        <p className="text-[11px] tracking-[0.24em] uppercase text-gold">
          {p.zone} · {p.city}
        </p>
        <h3 className="font-display text-2xl text-navy mt-2 leading-tight">{p.title}</h3>
        <div className="flex items-end justify-between mt-4 pt-4 border-t border-border/60">
          <p className="font-display text-xl text-navy">{p.price}</p>
          {variant === "default" && (
            <p className="text-xs text-muted-foreground tracking-wider">
              {p.beds} hab · {p.baths} baños · {p.sqm} m²
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
