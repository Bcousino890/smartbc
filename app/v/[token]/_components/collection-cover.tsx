"use client";

// ============================================================================
// Portada.
//
// Es lo único oscuro de toda la colección, y a propósito: la transición de la
// portada en tinta al cuerpo en marfil ES el gesto de abrir el libro. El
// research del sector coincide en que el oscuro señala contención y
// exclusividad; usarlo solo aquí evita que la publicación entera se vuelva
// pesada de leer.
//
// Una sola fotografía fija, nunca un carrusel: los carrusels rinden peor y
// castigan el LCP en móvil, que es donde el cliente va a abrir esto.
// ============================================================================

import Image from "next/image";
import type { PublicViewingCollection } from "@/lib/viewing-collections/public-contract";
import { Ornament } from "./editorial";

/** Cifras en palabra: más editorial que un dígito suelto. */
const WORDS = [
  "ninguna",
  "una",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
];

function residenceCount(n: number): string {
  const word = WORDS[n] ?? String(n);
  return `${word} ${n === 1 ? "residencia" : "residencias"}`;
}

export function CollectionCover({
  collection,
  onBegin,
}: {
  collection: PublicViewingCollection;
  onBegin: () => void;
}) {
  // La portada toma la fotografía de la primera residencia disponible.
  const cover =
    collection.stops.find((s) => s.availability !== "unavailable" && s.coverPhotoUrl)
      ?.coverPhotoUrl ??
    collection.stops.find((s) => s.coverPhotoUrl)?.coverPhotoUrl ??
    null;

  return (
    <header className="relative flex min-h-[100svh] flex-col overflow-hidden bg-ink text-cream-50">
      {/* Fotografía */}
      {cover && (
        <div className="absolute inset-0">
          <div className="vc-kenburns h-full w-full">
            {/* next/image no gestiona el proxy /p/, y aquí interesa el control
                total del encuadre: <img> con priority manual. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              aria-hidden
              fetchPriority="high"
              className="h-full w-full object-cover"
            />
          </div>
          {/* Doble velo: uno vertical para el texto, otro plano para el contraste
              general. Sin esto el titular no alcanza el contraste AA sobre
              fotografías claras. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-ink/85 via-ink/65 to-ink/92"
          />
          <div aria-hidden className="absolute inset-0 bg-ink/25" />
        </div>
      )}

      {/* Marca */}
      <div className="relative z-10 flex justify-center px-6 pt-9 md:pt-12">
        <div className="vc-cover-in flex flex-col items-center">
          <Image
            src="/logo.png"
            alt="Benjamín Cousiño Propiedades"
            width={150}
            height={Math.round(150 * (519 / 3282))}
            priority
            className="h-auto w-[128px] select-none brightness-0 invert md:w-[150px]"
          />
          <span className="mt-3 font-display text-[9.5px] font-medium uppercase vc-tracked text-cream-50/55 md:text-[10.5px]">
            Private Client Services
          </span>
        </div>
      </div>

      {/* Cuerpo de la portada */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-10 text-center sm:py-14 md:py-20">
        <p className="vc-cover-in vc-cover-in-d1 font-display text-[10.5px] font-medium uppercase vc-tracked text-cream-50/70 md:text-[12px]">
          Madrid
        </p>

        <h1 className="vc-cover-in vc-cover-in-d1 mt-5 max-w-[16ch] font-serif text-[38px] font-normal vc-tight text-cream-50 sm:text-[52px] md:text-[68px] lg:text-[78px]">
          Private Viewing
          <br />
          Collection
        </h1>

        <Ornament tone="cream" className="vc-cover-in vc-cover-in-d2 mt-6 sm:mt-8 md:mt-10" />

        <p className="vc-cover-in vc-cover-in-d2 mt-6 font-display sm:mt-8 text-[9.5px] font-medium uppercase vc-tracked text-cream-50/55 md:text-[10.5px]">
          Preparada para
        </p>
        <p className="vc-cover-in vc-cover-in-d2 mt-3 font-serif text-[27px] italic text-cream-50 md:text-[34px]">
          {collection.clientFirstName}
        </p>

        <div className="vc-cover-in vc-cover-in-d3 mt-8 flex flex-col items-center gap-2.5 sm:mt-11 md:mt-14">
          {collection.dateLabel && (
            <p className="font-display text-[11px] font-medium uppercase vc-tracked-sm text-cream-50/85 md:text-[12.5px]">
              {collection.dateLabel}
            </p>
          )}
          <p className="font-sans text-[12px] text-cream-50/55 md:text-[13px]">
            {collection.windowLabel ? `${collection.windowLabel} · ` : ""}
            {residenceCount(collection.stopCount)}
          </p>
        </div>
      </div>

      {/* Invitación a continuar */}
      <div className="relative z-10 flex shrink-0 justify-center px-6 pb-8 md:pb-14">
        <button
          type="button"
          onClick={onBegin}
          className="vc-cover-in vc-cover-in-d4 vc-focus group flex flex-col items-center gap-3 text-cream-50/60 transition-colors duration-500 hover:text-cream-50"
        >
          <span className="font-display text-[9.5px] font-medium uppercase vc-tracked md:text-[10px]">
            Comenzar
          </span>
          <span
            aria-hidden
            className="block h-6 w-px bg-cream-50/30 transition-all duration-700 group-hover:h-9 sm:h-9 sm:group-hover:h-12 md:h-12 md:group-hover:h-16"
          />
        </button>
      </div>
    </header>
  );
}
