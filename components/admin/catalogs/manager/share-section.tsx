"use client";

import { FileDown, Languages } from "lucide-react";
import { LANGUAGE_NAMES_ES } from "@/lib/catalogs/translation-labels";
import type { CatalogLanguage } from "@/lib/catalogs/i18n";
import { AUTO_NOTE, LanguageOptions, NativeMark } from "./languages-section";
import type { ContactRaw } from "@/lib/catalogs/manager-state";
import type { CatalogAdView } from "@/lib/catalogs/types";
import { AdsPanel, type AdActions } from "../ads-panel";
import { ContactFields } from "../contact-fields";
import { MeasurePanel, type HomeMeasure } from "../measure-panel";
import { SharePanel, type ShareActions, type ShareView } from "../share-panel";
import { ClientLinksPanel } from "../client-links-panel";
import type { ClientLinkActions } from "@/lib/catalogs/feedback-rules";
import { ConflictNote } from "./conflict-note";
import type { FormDraft } from "./use-form-draft";
import st from "../studio/studio.module.css";

// Compartir (BCP-01 E2, plan §3.10): contacto que ve el cliente, el enlace
// (crear, duración, copiar, renovar, revocar; igual que antes), «Asignar a
// cliente» con los enlaces personales (0218), los anuncios
// de origen como organización interna (plegados; nunca llegan al lector) y,
// con ?medir=1, el panel de medición.
// Rediseño 2026-10-23 (D7): arriba las dos formas de compartir, distintas a
// simple vista («Para un cliente · enlace personal» y «Enlace general», con
// su idioma); debajo, los ajustes comunes (contacto, PDF, anuncios).

export function ShareSection({
  catalogId,
  archived,
  pending,
  contactForm,
  onSaveContact,
  shareNotice,
  share,
  shareActions,
  clientLinkActions,
  onShareChange,
  ads,
  adActions,
  measureMode,
  measure,
  pdf,
  language,
}: {
  catalogId: string;
  archived: boolean;
  pending: boolean;
  contactForm: FormDraft<ContactRaw>;
  onSaveContact: (e: React.FormEvent) => void;
  shareNotice: string | null;
  share: ShareView | null;
  shareActions?: ShareActions;
  clientLinkActions?: ClientLinkActions;
  onShareChange: (s: ShareView | null) => void;
  ads: CatalogAdView[];
  adActions: AdActions;
  measureMode: boolean;
  measure: HomeMeasure;
  /** PDF del catálogo (descarga de lo guardado). */
  pdf?: { busy: boolean; message: { kind: "ok" | "error"; text: string } | null; onDownload: () => void; unsaved: boolean };
  /** Idioma del catálogo, junto a «Compartir» (se aplica al momento; 0228). */
  language?: { value: CatalogLanguage; busy: boolean; message: { kind: "ok" | "error"; text: string } | null; onChange: (lang: CatalogLanguage) => void };
}) {
  const { name, phone, role } = contactForm.value;
  const msg = (m: { kind: "ok" | "error"; text: string }, testId: string) => (
    <p role={m.kind === "error" ? "alert" : "status"} className={`rounded-md px-3 py-2 text-sm ${m.kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`} data-testid={testId}>
      {m.text}
    </p>
  );
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium text-ink">Comparte esta selección</h2>
        <p className="mt-0.5 text-sm text-ink/65">Elige cómo la recibirá el cliente: un enlace personal para cada cliente o el enlace general.</p>
      </div>
      {shareNotice ? (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="share-notice">
          {shareNotice}
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="min-w-0">{clientLinkActions ? <ClientLinksPanel catalogId={catalogId} archived={archived} actions={clientLinkActions} /> : null}</div>
        <div className="min-w-0 space-y-4">
          {shareActions ? <SharePanel catalogId={catalogId} share={share} archived={archived} actions={shareActions} onChange={onShareChange} /> : null}
          {language ? (
            <section className={`${st.panel} space-y-2 p-4`} aria-labelledby="share-lang-title" data-testid="share-language" data-check-overflow="idioma">
              <h3 id="share-lang-title" className="crm-label-sm flex items-center gap-1.5 text-ink">
                <Languages className="h-4 w-4" aria-hidden="true" /> Idioma del enlace general
              </h3>
              <label className="block text-sm text-ink/70">
                <span className="sr-only">Idioma del catálogo</span>
                <select
                  value={language.value}
                  disabled={language.busy}
                  onChange={(e) => language.onChange(e.target.value as CatalogLanguage)}
                  className={`${st.input} w-full text-sm`}
                  data-testid="share-lang-select"
                >
                  <LanguageOptions />
                </select>
              </label>
              {language.value !== "es" ? (
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink/65">
                  El cliente verá el catálogo en {LANGUAGE_NAMES_ES[language.value]}. <NativeMark lang={language.value} />
                </p>
              ) : null}
              <p className="text-xs text-ink/60">{AUTO_NOTE} Los enlaces personales pueden tener su propio idioma (pestaña «Idiomas»).</p>
              {language.message ? msg(language.message, "share-lang-message") : null}
            </section>
          ) : null}
        </div>
      </div>

      <section className={`${st.panel} divide-y divide-gold/10`} aria-label="Ajustes para compartir">
        <form onSubmit={onSaveContact} className="space-y-3 p-4" data-testid="contact-form">
          {contactForm.conflict ? (
            <ConflictNote
              saved={[contactForm.conflict.raw.name, contactForm.conflict.raw.phone].filter(Boolean).join(" · ")}
              onDiscard={contactForm.discard}
              onKeep={contactForm.keepMine}
            />
          ) : null}
          <ContactFields
            idPrefix="cm"
            name={name}
            phone={phone}
            role={role}
            onName={(v) => contactForm.set({ ...contactForm.value, name: v })}
            onPhone={(v) => contactForm.set({ ...contactForm.value, phone: v })}
            onRole={(v) => contactForm.set({ ...contactForm.value, role: v })}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className={`${st.btnPrimary} text-sm`}>
              Guardar contacto
            </button>
            {contactForm.edited ? (
              <span className="text-xs font-medium text-amber-800" data-testid="contact-unsaved">
                Cambios sin guardar
              </span>
            ) : null}
          </div>
        </form>
        {pdf ? (
          <section className="space-y-3 p-4" aria-labelledby="pdf-title" data-testid="pdf-section" data-check-overflow="pdf">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-64">
                <h3 id="pdf-title" className="crm-label-sm flex items-center gap-1.5 text-ink">
                  <FileDown className="h-4 w-4" aria-hidden="true" /> PDF del catálogo
                </h3>
                <p className="mt-0.5 text-sm text-ink/65">
                  Una copia en A4 con lo guardado ahora mismo, para enviarla o imprimirla. No se actualiza sola y no lleva el enlace.
                  {archived || !share || share.expired ? " Se puede descargar aunque el catálogo esté archivado o no tenga enlace." : ""}
                </p>
              </div>
              <button type="button" onClick={pdf.onDownload} disabled={pdf.busy} aria-busy={pdf.busy} className={`${st.btn} text-sm`} data-testid="pdf-download">
                <FileDown className="h-4 w-4" aria-hidden="true" /> {pdf.busy ? "Preparando el PDF…" : "Descargar PDF"}
              </button>
            </div>
            {pdf.unsaved ? (
              <p className="text-xs font-medium text-amber-800" data-testid="pdf-unsaved">
                Tienes cambios sin guardar: el PDF sale con lo último guardado.
              </p>
            ) : null}
            {pdf.message ? msg(pdf.message, "pdf-message") : null}
          </section>
        ) : null}
        <details className="p-4" data-testid="internal-ads">
          <summary className="cursor-pointer text-sm text-ink/70">Organización interna · anuncios de origen</summary>
          <div className="mt-3">
            <AdsPanel catalogId={catalogId} ads={ads} actions={adActions} />
          </div>
        </details>
      </section>
      {measureMode ? <MeasurePanel measure={measure} hasShare={!!share && !share.expired} /> : null}
    </div>
  );
}
