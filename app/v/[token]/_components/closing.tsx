"use client";

// ============================================================================
// Cierre de la publicación: el advisor y el colofón.
//
// El colofón es la contraportada de un libro, no un footer web: sin menús, sin
// enlaces legales, sin columnas. Marca, dedicatoria, lugar y fecha.
// ============================================================================

import Image from "next/image";
import type { PublicAgentContact } from "@/lib/viewing-collections/public-contract";
import type { CollectionDictionary } from "@/lib/viewing-collections/i18n";
import { Label, Ornament, Reveal } from "./editorial";

export function AdvisorBlock({
  agent,
  dict,
}: {
  agent: PublicAgentContact;
  dict: CollectionDictionary;
}) {
  const initials = agent.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <section
      aria-labelledby="advisor-title"
      className="mx-auto max-w-5xl px-6 py-20 md:px-10 md:py-28"
    >
      <Reveal className="text-center">
        <Label tone="gold">{dict.atYourService}</Label>
        <h2
          id="advisor-title"
          className="mt-4 font-serif text-[28px] font-normal vc-tight text-ink md:text-[38px]"
        >
          {dict.yourAdvisor}
        </h2>
        <Ornament className="mt-7" />
      </Reveal>

      <Reveal delay={1} className="mt-11 flex flex-col items-center md:mt-14">
        <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-ink font-serif text-[22px] text-cream-50 md:h-24 md:w-24 md:text-[26px]">
          {agent.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agent.avatarUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </span>

        <p className="mt-6 font-serif text-[23px] text-ink md:text-[27px]">
          {agent.displayName}
        </p>
        <p className="mt-2 font-display text-[9.5px] font-medium uppercase vc-tracked text-ink/40 md:text-[10px]">
          Benjamín Cousiño · Private Client Services
        </p>

        <div className="mt-9 flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:gap-3">
          {agent.whatsappUrl && (
            <a
              href={agent.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="vc-focus border border-ink bg-ink px-7 py-3.5 text-center font-display text-[10.5px] font-medium uppercase vc-tracked text-cream-50 transition-colors duration-500 hover:bg-ink-soft"
            >
              WhatsApp
            </a>
          )}
          {agent.phone && (
            <a
              href={`tel:${agent.phone.replace(/\s/g, "")}`}
              className="vc-focus border border-ink/25 px-7 py-3.5 text-center font-display text-[10.5px] font-medium uppercase vc-tracked text-ink transition-colors duration-500 hover:border-ink"
            >
              {agent.phone}
            </a>
          )}
          {agent.email && (
            <a
              href={`mailto:${agent.email}`}
              className="vc-focus border border-ink/25 px-7 py-3.5 text-center font-display text-[10.5px] font-medium uppercase vc-tracked text-ink transition-colors duration-500 hover:border-ink"
            >
              {dict.write}
            </a>
          )}
        </div>
      </Reveal>
    </section>
  );
}

export function Colophon({
  clientFirstName,
  dateLabel,
  expiresAtLabel,
  dict,
}: {
  clientFirstName: string;
  dateLabel: string;
  expiresAtLabel: string;
  dict: CollectionDictionary;
}) {
  return (
    <footer className="bg-ink text-cream-50">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center md:py-28">
        <Reveal>
          <Image
            src="/logo.png"
            alt="Benjamín Cousiño Propiedades"
            width={130}
            height={Math.round(130 * (519 / 3282))}
            loading="lazy"
            className="mx-auto h-auto w-[112px] select-none brightness-0 invert md:w-[130px]"
          />
          <p className="mt-3 font-display text-[9px] font-medium uppercase vc-tracked text-cream-50/50 md:text-[10px]">
            Private Client Services
          </p>

          <Ornament tone="cream" className="mt-10" />

          <p className="mt-10 font-serif text-[19px] italic leading-relaxed text-cream-50/90 md:text-[22px]">
            {dict.preparedExclusively(clientFirstName)}
          </p>

          {dateLabel && (
            <p className="mt-5 font-display text-[10px] font-medium uppercase vc-tracked-sm text-cream-50/45 md:text-[10.5px]">
              Madrid · {dateLabel}
            </p>
          )}

          {/* Discreción, no advertencia legal: se menciona la vigencia una sola
              vez y en el tono del resto de la publicación. */}
          <p className="mt-14 font-sans text-[11px] leading-relaxed text-cream-50/30">
            {dict.validUntil(expiresAtLabel)}
          </p>
        </Reveal>
      </div>
    </footer>
  );
}
