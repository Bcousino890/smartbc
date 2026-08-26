"use client";

// ============================================================================
// SOLICITUD — expediente del cliente.
//
// `property_applications` y sus documentos existían en la base y tenían su
// propia pantalla, pero la ficha del cliente no los mencionaba: desde aquí no
// se podía saber que la persona ya había entregado la nómina.
//
// Esto NO reimplementa el revisor de documentos —ese trabajo vive en
// /admin/solicitudes-documentacion y se enlaza—; solo trae a la ficha lo que
// hace falta para saber por dónde va el expediente.
// ============================================================================

import { useState } from "react";
import { ChevronDown, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import type { ClientApplication } from "@/lib/db/queries/client-command-center";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { useTn } from "./plural";
import { cn } from "@/lib/utils";
import { formatDate } from "./format";
import { Empty, Panel, Pill, type Tone } from "./ui";

const APP_TONE: Record<string, Tone> = {
  draft: "neutral",
  pending_review: "warning",
  approved: "positive",
  rejected: "critical",
  completed: "info",
};

const DOC_TONE: Record<string, Tone> = {
  pending: "warning",
  verified: "positive",
  rejected: "critical",
  needs_correction: "warning",
};

export function ApplicationsBlock({
  applications,
  country,
}: {
  applications: ClientApplication[];
  country: Country;
}) {
  const t = useT();
  const config = getCountryConfig(country);

  if (applications.length === 0) {
    return (
      <Panel title={t("cc.applications.title")}>
        <Empty>{t("cc.applications.empty")}</Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {applications.map((app) => (
        <ApplicationCard key={app.id} app={app} locale={config.locale} prefix={config.prefix} />
      ))}
    </div>
  );
}

function ApplicationCard({
  app,
  locale,
  prefix,
}: {
  app: ClientApplication;
  locale: string;
  prefix: string;
}) {
  const t = useT();
  const tn = useTn();
  const [open, setOpen] = useState(app.documentsPending > 0);

  const verified = app.documents.filter((d) => d.status === "verified").length;

  return (
    <Panel
      id={app.id}
      title={
        <span className="flex items-center gap-2">
          {t(`cc.applications.operation.${app.operation}`)}
          <Pill tone={APP_TONE[app.status] ?? "neutral"}>
            {t(`cc.applications.status.${app.status}`)}
          </Pill>
        </span>
      }
      action={
        <Link
          href={`${prefix}/solicitudes-documentacion`}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink/55 transition hover:text-ink"
        >
          {t("cc.applications.review")}
          <ExternalLink size={11} strokeWidth={1.75} />
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
        <div className="col-span-2 min-w-0">
          <dt className="crm-label-sm text-ink/40">
            {t("cc.applications.property")}
          </dt>
          <dd className="mt-0.5 truncate text-sm font-medium text-ink">
            {app.property?.slug && app.property.title ? (
              <Link
                href={`${prefix}/propiedades/${app.property.slug}`}
                className="hover:underline"
              >
                {app.property.title}
              </Link>
            ) : (
              (app.property?.title ?? "—")
            )}
          </dd>
        </div>
        <div>
          <dt className="crm-label-sm text-ink/40">
            {t("cc.applications.submitted")}
          </dt>
          <dd className="mt-0.5 text-sm text-ink">
            {app.submittedAt ? formatDate(app.submittedAt, locale) : "—"}
          </dd>
        </div>
        <div>
          <dt className="crm-label-sm text-ink/40">
            {t("cc.applications.moveIn")}
          </dt>
          <dd className="mt-0.5 text-sm text-ink">
            {app.moveInDate ? formatDate(app.moveInDate, locale) : "—"}
          </dd>
        </div>
      </dl>

      {app.reviewNotes && (
        <p className="mt-3 border-s-2 border-gold/30 ps-2.5 text-xs italic leading-relaxed text-ink/60">
          {app.reviewNotes}
        </p>
      )}

      {/* ── Documentos ── */}
      <div className="mt-4 border-t border-ink/8 pt-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 crm-label-sm text-ink/55">
            <FileText size={12} strokeWidth={1.75} className="text-gold" />
            {t("cc.applications.documents")}
            <span className="tabular-nums text-ink/40">
              {verified}/{app.documents.length}
            </span>
            {app.documentsPending > 0 && (
              <Pill tone="warning">
                {tn("cc.applications.pending", app.documentsPending)}
              </Pill>
            )}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className={cn("shrink-0 text-ink/35 transition-transform", open && "rotate-180")}
          />
        </button>

        {open &&
          (app.documents.length === 0 ? (
            <p className="mt-2.5 text-xs text-ink/40">
              {t("cc.applications.noDocuments")}
            </p>
          ) : (
            <ul className="mt-2.5 space-y-1">
              {app.documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded border border-ink/8 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs text-ink">
                      {d.documentTypeName ?? d.fileName}
                    </p>
                    <p className="truncate text-xs text-ink/40">
                      {formatDate(d.createdAt, locale)}
                      {d.documentTypeName ? ` · ${d.fileName}` : ""}
                    </p>
                  </div>
                  <Pill tone={DOC_TONE[d.status] ?? "neutral"}>
                    {t(`cc.applications.doc.${d.status}`)}
                  </Pill>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </Panel>
  );
}
