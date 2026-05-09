"use client";

import { PLACEHOLDER_GRADIENTS } from "@/lib/constants";
import { useT } from "@/lib/i18n/provider";
import type { Property, PropertyBadge } from "@/lib/types";
import { cn } from "@/lib/utils";

const BADGE_KEYS: Record<PropertyBadge, string> = {
  exclusiva: "card.badge.exclusive",
  destacada: "card.badge.featured",
  premium: "card.badge.premium",
};

export function PropertyGallery({ property }: { property: Property }) {
  const t = useT();
  const photos = property.photos ?? [];
  const main = photos[0];
  const thumbs = photos.slice(1, 4);
  const thumbCount = 3;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.55fr_1fr]">
      <Tile
        photo={main}
        gradient={PLACEHOLDER_GRADIENTS[0]}
        className="aspect-[4/3] md:aspect-auto md:h-[520px]"
      >
        {property.badge && (
          <span className="absolute left-4 top-4 rounded-md bg-cream-50/95 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-gold-dark shadow-sm">
            {t(BADGE_KEYS[property.badge])}
          </span>
        )}
      </Tile>

      <div className="grid grid-cols-3 gap-3 md:grid-cols-1">
        {Array.from({ length: thumbCount }).map((_, i) => (
          <Tile
            key={i}
            photo={thumbs[i]}
            gradient={PLACEHOLDER_GRADIENTS[(i + 1) % PLACEHOLDER_GRADIENTS.length]}
            className="aspect-[4/3] md:aspect-auto md:h-[167px]"
          />
        ))}
      </div>
    </div>
  );
}

function Tile({
  photo,
  gradient,
  className,
  children,
}: {
  photo?: string;
  gradient: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border border-gold/20 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.40)]",
        className,
      )}
    >
      {photo ? (
        // Real photos go through next/image when added; for now we just use the gradient.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ backgroundImage: gradient }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_30%,rgba(255,235,190,0.55),transparent_60%)]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(40,28,10,0.35),transparent_60%)]"
          />
        </>
      )}
      {children}
    </div>
  );
}
