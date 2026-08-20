"use client";

// ============================================================================
// CLIENT BRIEF — el encargo, en un vistazo.
//
// La tarjeta anterior pintaba SEIS de las treinta y cuatro columnas de
// `client_preferences`, y las mismas seis para los dos países: un cliente
// chileno no veía ni una de sus preferencias reales (regiones, comunas, UF,
// estacionamientos, condominio…).
//
// Aquí se pinta lo que hay, y solo lo que hay: cada campo vacío se cae en vez
// de ocupar sitio con un guion. Los campos chilenos aparecen únicamente si el
// cliente es de Chile Y tienen valor.
// ============================================================================

import { Pencil } from "lucide-react";
import type { ClientPreferencesFull } from "@/lib/db/queries/client-command-center";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { useTn } from "./plural";
import { formatDate } from "./format";
import { Button, Empty, Field, Panel } from "./ui";

export function ClientBrief({
  prefs,
  country,
  canEdit,
  onEdit,
}: {
  prefs: ClientPreferencesFull | null;
  country: Country;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const t = useT();
  const tn = useTn();
  const config = getCountryConfig(country);

  const edit = canEdit ? (
    <Button size="sm" variant="ghost" onClick={onEdit}>
      <Pencil size={11} strokeWidth={1.75} />
      {t("cc.action.edit")}
    </Button>
  ) : null;

  if (!prefs) {
    return (
      <Panel title={t("cc.brief.title")} action={edit}>
        <Empty
          action={
            canEdit ? (
              <Button size="sm" variant="primary" onClick={onEdit}>
                {t("cc.brief.define")}
              </Button>
            ) : null
          }
        >
          {t("cc.brief.empty")}
        </Empty>
      </Panel>
    );
  }

  const price = (min: number | null, max: number | null, uf?: boolean) => {
    if (min === null && max === null) return null;
    const fmt = (v: number | null) =>
      v === null
        ? "—"
        : uf
          ? `${new Intl.NumberFormat(config.locale).format(v)} UF`
          : config.formatPrice(v, null, prefs.operation === "rent" ? "rent" : "sale");
    return `${fmt(min)} – ${fmt(max)}`;
  };

  const range = (min: number | null, max: number | null, suffix = "") => {
    if (min === null && max === null) return null;
    if (max === null) return `${min}+${suffix}`;
    if (min === null) return `≤ ${max}${suffix}`;
    return min === max ? `${min}${suffix}` : `${min} – ${max}${suffix}`;
  };

  const list = (arr: string[]) => (arr.length ? arr.join(" · ") : null);

  const yesNo = (v: boolean | null) =>
    v === null ? null : v ? t("cc.yes") : t("cc.no");

  // Solo entran los campos con valor: un brief con doce guiones no es un brief.
  const fields: Array<[string, React.ReactNode]> = [];
  const add = (label: string, value: React.ReactNode) => {
    if (value !== null && value !== undefined && value !== "") fields.push([label, value]);
  };

  add(
    t("clientes.ficha.preferences.operation"),
    prefs.operation
      ? t(`filters.operation.${prefs.operation === "rent" ? "rent" : "sale"}`)
      : null,
  );
  add(
    t("clientes.ficha.preferences.stay"),
    prefs.stay ? t(`card.stay.${prefs.stay === "short" ? "short" : "long"}`) : null,
  );
  add(t("clientes.ficha.preferences.budget"), price(prefs.min_price, prefs.max_price));
  add(t("cc.brief.zones"), list(prefs.zones));
  add(t("cc.brief.bedrooms"), range(prefs.min_bedrooms, prefs.max_bedrooms));
  add(t("cc.brief.bathrooms"), prefs.min_bathrooms ? `${prefs.min_bathrooms}+` : null);
  add(
    t("cc.brief.area"),
    range(prefs.min_square_meters, prefs.max_square_meters, " m²"),
  );
  add(
    t("cc.brief.availableFrom"),
    prefs.available_from ? formatDate(prefs.available_from, config.locale) : null,
  );
  add(
    t("clientes.ficha.preferences.occupants"),
    prefs.occupants
      ? [
          prefs.occupants,
          prefs.students ? tn("cc.brief.students", prefs.students, { n: prefs.students }) : null,
          prefs.workers ? tn("cc.brief.workers", prefs.workers, { n: prefs.workers }) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
  );
  add(t("clientes.ficha.preferences.pets"), yesNo(prefs.pets));
  add(t("cc.brief.universities"), prefs.universities);

  if (country === "cl") {
    add(t("cc.brief.budgetUf"), price(prefs.min_price_uf, prefs.max_price_uf, true));
    add(t("cc.brief.regions"), list(prefs.preferred_regions));
    add(t("cc.brief.communes"), list(prefs.preferred_communes));
    add(t("cc.brief.sectors"), list(prefs.preferred_sectors));
    add(t("cc.brief.parking"), prefs.min_parking_spaces ? `${prefs.min_parking_spaces}+` : null);
    add(t("cc.brief.condominium"), yesNo(prefs.prefers_condominium));
    add(t("cc.brief.serviceBedroom"), yesNo(prefs.requires_service_bedroom));
    add(t("cc.brief.floors"), prefs.min_floors ? `${prefs.min_floors}+` : null);
    add(t("cc.brief.orientations"), list(prefs.preferred_orientations));
  }

  return (
    <Panel title={t("cc.brief.title")} action={edit}>
      {fields.length === 0 ? (
        <Empty>{t("cc.brief.empty")}</Empty>
      ) : (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-3">
          {fields.map(([label, value]) => (
            <Field key={label} label={label} value={value} />
          ))}
        </dl>
      )}

      {prefs.notes && (
        <div className="mt-4 border-t border-ink/8 pt-3">
          <p className="crm-label-sm text-ink/40">
            {t("clientes.ficha.notes.title")}
          </p>
          <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-ink/70">
            {prefs.notes}
          </p>
        </div>
      )}

      {prefs.updated_at && (
        <p className="mt-3 text-xs text-ink/35">
          {t("cc.brief.updated", { date: formatDate(prefs.updated_at, config.locale) })}
        </p>
      )}
    </Panel>
  );
}
