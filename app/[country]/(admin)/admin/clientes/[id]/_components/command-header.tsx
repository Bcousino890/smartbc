"use client";

// ============================================================================
// Cabecera compacta del cliente.
//
// Antes: una tarjeta de ~200px con avatar de 80px, tres insignias (dos de
// ellas constantes), un bloque de contacto y un botón que llevaba a la bandeja
// general. Ocupaba la primera pantalla entera sin decir qué hacer.
//
// Ahora cabe en un tercio de eso y responde a las cuatro preguntas con las que
// se abre una ficha: quién es, en qué punto está, de quién es y cuándo dio
// señales de vida por última vez. Todo lo que se pinta viene de la base; lo
// que no existe se calla en vez de rellenarse.
// ============================================================================

import Link from "next/link";
import { useTransition } from "react";
import { ArrowLeft, Mail, MapPin, Phone, Pencil, SlidersHorizontal } from "lucide-react";
import type { ClientStage } from "@/lib/client-command-center/types";
import type { LastActivity } from "@/lib/client-command-center/derive";
import type { AdvisorRef } from "@/lib/db/queries/client-command-center";
import type { StaffRef } from "@/lib/portal-links/types";
import type { AdminClient } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { cn } from "@/lib/utils";
import { assignClientAdvisor } from "../actions";
import { RelativeTime } from "./relative-time";
import { StageRail } from "./stage-rail";
import { Button, Pill } from "./ui";

export type ClientTagView = { id: string; name: string; category: string | null };

export function CommandHeader({
  client,
  country,
  stage,
  tags,
  advisor,
  staff,
  lastActivity,
  canEdit,
  onEditClient,
  onEditPreferences,
}: {
  client: AdminClient;
  country: Country;
  stage: ClientStage;
  tags: ClientTagView[];
  advisor: AdvisorRef | null;
  staff: StaffRef[];
  lastActivity: LastActivity;
  canEdit: boolean;
  onEditClient: () => void;
  onEditPreferences: () => void;
}) {
  const t = useT();
  const config = getCountryConfig(country);
  const [saving, startSave] = useTransition();

  const fullName = `${client.firstName} ${client.lastName}`.trim();

  return (
    <header className="border-b border-ink/10 bg-cream-50/60">
      <div className="mx-auto max-w-[1320px] px-4 pt-4 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`${config.prefix}/clientes`}
            className="inline-flex items-center gap-1.5 text-xs text-ink/55 transition hover:text-ink"
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            {t("clientes.ficha.back")}
          </Link>

          {canEdit && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={onEditPreferences}>
                <SlidersHorizontal size={12} strokeWidth={1.75} />
                <span className="hidden sm:inline">{t("cc.action.editPreferences")}</span>
                <span className="sm:hidden">{t("cc.action.preferencesShort")}</span>
              </Button>
              <Button size="sm" variant="primary" onClick={onEditClient}>
                <Pencil size={12} strokeWidth={1.75} />
                {t("cc.action.editClient")}
              </Button>
            </div>
          )}
        </div>

        {/* ── Identidad ── */}
        <div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-base font-bold text-cream-50">
              {client.avatarInitials}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-bold leading-tight text-ink">
                {fullName || client.email}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Pill tone="neutral">{t(`clientes.profile.${client.profileType}`)}</Pill>
                {tags.map((tag) => (
                  <Pill
                    key={tag.id}
                    tone={tag.category === "priority" ? "gold" : "neutral"}
                  >
                    {tag.name}
                  </Pill>
                ))}
              </div>
            </div>
          </div>

          {/* ── Contacto: enlaces que se pulsan, no texto decorativo ── */}
          <ul className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/60">
            <li className="flex min-w-0 items-center gap-1.5">
              <Mail size={12} strokeWidth={1.75} className="shrink-0 text-gold" />
              <a href={`mailto:${client.email}`} className="truncate hover:text-ink hover:underline">
                {client.email}
              </a>
            </li>
            {client.phone && (
              <li className="flex items-center gap-1.5">
                <Phone size={12} strokeWidth={1.75} className="shrink-0 text-gold" />
                <a href={`tel:${client.phone}`} className="hover:text-ink hover:underline">
                  {client.phone}
                </a>
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <MapPin size={12} strokeWidth={1.75} className="shrink-0 text-gold" />
              {t(`cc.country.${country}`)}
            </li>
          </ul>

          {/* ── De quién es este cliente ── */}
          <div className="ms-auto flex items-center gap-2">
            <span className="crm-label-sm text-ink/40">
              {t("cc.advisor.label")}
            </span>
            {canEdit ? (
              <select
                value={advisor?.id ?? ""}
                disabled={saving}
                onChange={(e) => {
                  const next = e.target.value || null;
                  startSave(async () => {
                    const r = await assignClientAdvisor(client.id, next);
                    if (!r.ok) alert(r.error);
                  });
                }}
                className={cn(
                  "crm-input max-w-[190px] truncate rounded-md border px-2 py-1 outline-none transition",
                  advisor
                    ? "border-ink/15 bg-white text-ink"
                    : "border-amber-300 bg-amber-50 text-amber-800",
                )}
              >
                <option value="">{t("cc.advisor.unassigned")}</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-medium text-ink">
                {advisor?.name ?? t("cc.advisor.unassigned")}
              </span>
            )}
          </div>
        </div>

        {/* ── Etapa y última señal ── */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-3">
          <div className="min-w-0 flex-1 sm:max-w-xl">
            <StageRail stage={stage} />
          </div>
          <p className="text-xs text-ink/45">
            {lastActivity ? (
              <>
                {t("cc.lastActivity.label")}{" "}
                <RelativeTime
                  at={lastActivity.at}
                  locale={config.locale}
                  className="font-medium text-ink/70"
                />{" "}
                <span className="text-ink/35">
                  · {t(`cc.lastActivity.by.${lastActivity.actor}`)}
                </span>
              </>
            ) : (
              t("cc.lastActivity.none")
            )}
          </p>
        </div>
      </div>
    </header>
  );
}
