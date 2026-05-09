"use client";

import {
  Building2,
  Languages,
  Mail,
  Pencil,
  Phone,
  Sparkles,
  Tag,
} from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { PageFooter } from "@/components/ui/page-footer";
import { formatPrice } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { mockProfile } from "@/lib/mock-profile";
import type { ClientProfile } from "@/lib/types";

const LANG_LABELS: Record<ClientProfile["preferredLanguage"], string> = {
  es: "Español",
  en: "English",
  fr: "Français",
  de: "Deutsch",
};

export default function PerfilPage() {
  const t = useT();
  const profile = mockProfile;
  const initials = `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase();

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-10 md:px-8">
      <SectionHeader titleKey="perfil.title" subtitleKey="perfil.subtitle" />

      <div className="mt-8 flex flex-col gap-5">
        <PersonalSection profile={profile} initials={initials} />
        <PreferencesSection profile={profile} />
        <ShopperSection profile={profile} />
      </div>

      <PageFooter textKey="login.footer" />
    </div>
  );
}

function PersonalSection({
  profile,
  initials,
}: {
  profile: ClientProfile;
  initials: string;
}) {
  const t = useT();
  return (
    <section className="rounded-2xl border border-gold/20 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.30)] backdrop-blur-sm md:p-6">
      <header className="flex items-center justify-between">
        <h2 className="font-serif text-2xl font-medium text-ink">
          {t("perfil.personal.title")}
        </h2>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-gold/30 bg-white/60 px-3 py-1.5 text-[12px] font-medium text-ink/70 transition hover:bg-white/85 hover:text-ink"
        >
          <Pencil size={13} strokeWidth={1.75} />
          <span>{t("perfil.personal.edit")}</span>
        </button>
      </header>

      <div className="mt-5 grid grid-cols-1 items-center gap-5 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-cream-100 font-serif text-xl font-medium text-ink">
            {initials}
          </span>
          <div className="text-center">
            <p className="font-serif text-lg font-medium text-ink">
              {profile.firstName} {profile.lastName}
            </p>
            <p className="text-[11px] text-ink/55">
              {t("perfil.personal.memberSince")}: {profile.memberSince}
            </p>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DetailRow
            icon={<Mail size={15} strokeWidth={1.75} />}
            label={t("perfil.personal.email")}
            value={profile.email}
          />
          <DetailRow
            icon={<Phone size={15} strokeWidth={1.75} />}
            label={t("perfil.personal.phone")}
            value={profile.phone}
          />
          <DetailRow
            icon={<Languages size={15} strokeWidth={1.75} />}
            label={t("perfil.personal.language")}
            value={LANG_LABELS[profile.preferredLanguage]}
          />
        </ul>
      </div>
    </section>
  );
}

function PreferencesSection({ profile }: { profile: ClientProfile }) {
  const t = useT();
  const p = profile.preferences;

  return (
    <section className="rounded-2xl border border-gold/20 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.30)] backdrop-blur-sm md:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-medium text-ink">
            {t("perfil.preferences.title")}
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            {t("perfil.preferences.subtitle")}
          </p>
        </div>
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 rounded-lg border border-gold/30 bg-white/60 px-3 py-1.5 text-[12px] font-medium text-ink/70 transition hover:bg-white/85 hover:text-ink"
        >
          <Pencil size={13} strokeWidth={1.75} />
          <span>{t("perfil.preferences.edit")}</span>
        </button>
      </header>

      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {p.bedrooms !== undefined && (
          <DetailRow
            icon={<Building2 size={15} strokeWidth={1.75} />}
            label={t("perfil.preferences.bedrooms")}
            value={`${p.bedrooms}+`}
          />
        )}
        {p.budgetMin !== undefined && p.budgetMax !== undefined && (
          <DetailRow
            icon={<Sparkles size={15} strokeWidth={1.75} />}
            label={t("perfil.preferences.budget")}
            value={t("perfil.preferences.budget.range", {
              min: formatPrice(p.budgetMin),
              max: formatPrice(p.budgetMax),
            })}
          />
        )}
        {p.stayType && (
          <DetailRow
            label={t("perfil.preferences.stay")}
            value={t(
              `filters.stay.${p.stayType === "corta" ? "short" : "long"}`,
            )}
          />
        )}
        {p.operation && (
          <DetailRow
            label={t("perfil.preferences.operation")}
            value={t(
              `filters.operation.${p.operation === "alquiler" ? "rent" : "sale"}`,
            )}
          />
        )}
        {p.preferredZones.length > 0 && (
          <li className="rounded-xl border border-gold/15 bg-white/60 p-3 sm:col-span-2 lg:col-span-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink/55">
              {t("perfil.preferences.zones")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.preferredZones.map((zone) => (
                <span
                  key={zone}
                  className="rounded-md bg-cream-100/80 px-2.5 py-1 text-xs font-medium text-ink/75"
                >
                  {zone}
                </span>
              ))}
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}

function ShopperSection({ profile }: { profile: ClientProfile }) {
  const t = useT();
  return (
    <section className="rounded-2xl border border-gold/30 bg-cream-100/60 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.30)] backdrop-blur-sm md:p-6">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/50 text-gold">
          <Tag size={18} strokeWidth={1.5} />
        </span>
        <div>
          <h2 className="font-serif text-xl font-medium text-ink">
            {t("perfil.shopper.title")}
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            {t("perfil.shopper.subtitle")}
          </p>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {profile.shopperTagKeys.map((key) => (
          <span
            key={key}
            className="rounded-full border border-gold/40 bg-white/80 px-3 py-1.5 text-xs font-medium text-ink"
          >
            {t(key)}
          </span>
        ))}
      </div>
    </section>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-gold/15 bg-white/60 p-3">
      {icon && (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink/55">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium text-ink">{value}</p>
      </div>
    </li>
  );
}
