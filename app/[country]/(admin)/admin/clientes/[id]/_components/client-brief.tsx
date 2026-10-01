"use client";

// ============================================================================
// CLIENT BRIEF — el encargo, en un vistazo.
//
// Se pinta lo que hay, y solo lo que hay: cada campo vacío se cae en vez de
// ocupar sitio con un guion. Y solo lo que APLICA a la operación: en venta no
// salen estudiantes ni estancia, en alquiler no sale la hipoteca. Las
// etiquetas y opciones vienen del mismo catálogo que el formulario y el match
// (lib/clients/brief.ts), para que la ficha no pueda decir otra cosa que lo
// que se guardó.
//
// Arriba, lo que falta: sin zona, presupuesto o dormitorios las sugerencias
// salen a ciegas, y eso tiene que verse antes de llamar al cliente, no
// después.
// ============================================================================

import { AlertTriangle, Pencil, Star } from "lucide-react";
import type { ClientPreferencesFull } from "@/lib/db/queries/client-command-center";
import {
  briefGaps,
  CONDITION_PREF,
  EMPLOYMENT,
  FEATURE_LABEL,
  FINANCING,
  FURNISHED,
  GUARANTEES,
  labelOf,
  NEW_BUILD,
  PROPERTY_TYPES,
  PURCHASE_PURPOSE,
  URGENCY,
  type FeatureKey,
} from "@/lib/clients/brief";
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

  const b = prefs.brief;
  const rent = b.operation === "rent";
  const money = (v: number) => config.formatPrice(v, null, rent ? "rent" : "sale");
  const plainMoney = (v: number) => config.formatPrice(v, null, "sale");

  const price = (min: number | null, max: number | null) => {
    if (min === null && max === null) return null;
    if (min === null) return `hasta ${money(max as number)}`;
    if (max === null) return `desde ${money(min)}`;
    return `${plainMoney(min)} – ${money(max)}`;
  };

  const range = (min: number | null, max: number | null, suffix = "") => {
    if (min === null && max === null) return null;
    if (max === null) return `${min}+${suffix}`;
    if (min === null) return `≤ ${max}${suffix}`;
    return min === max ? `${min}${suffix}` : `${min} – ${max}${suffix}`;
  };

  const list = (arr: string[]) => (arr.length ? arr.join(" · ") : null);
  const labels = (options: { key: string; label: string }[], keys: string[]) =>
    list(keys.map((k) => labelOf(options, k) ?? k));
  const yesNo = (v: boolean | null) => (v === null ? null : v ? t("cc.yes") : t("cc.no"));

  // Solo entran los campos con valor: un brief con doce guiones no es un brief.
  const fields: Array<[string, React.ReactNode]> = [];
  const add = (label: string, value: React.ReactNode) => {
    if (value !== null && value !== undefined && value !== "") fields.push([label, value]);
  };

  add(
    t("clientes.ficha.preferences.operation"),
    rent
      ? [
          t("filters.operation.rent"),
          b.stay === "short" ? "Temporada" : b.stay === "long" ? "Larga" : null,
          b.stayMonths ? `${b.stayMonths} meses` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : [t("filters.operation.sale"), labelOf(PURCHASE_PURPOSE, b.purchasePurpose)].filter(Boolean).join(" · "),
  );
  add("Tipo", labels(PROPERTY_TYPES, b.propertyTypes));
  add(
    t("cc.brief.zones"),
    b.zones.length || b.subzones.length
      ? [list(b.zones), b.subzones.length ? `barrios: ${b.subzones.join(", ")}` : null, b.zonesFlexible ? "abierto a otras" : null]
          .filter(Boolean)
          .join(" · ")
      : null,
  );
  add(
    t("clientes.ficha.preferences.budget"),
    price(b.minPrice, b.maxPrice) &&
      `${price(b.minPrice, b.maxPrice)}${b.maxPriceFlexPct ? ` (+${b.maxPriceFlexPct} %)` : ""}`,
  );
  add(t("cc.brief.bedrooms"), range(b.minBedrooms, b.maxBedrooms));
  add(t("cc.brief.bathrooms"), b.minBathrooms ? `${b.minBathrooms}+` : null);
  add(t("cc.brief.area"), range(b.minSquareMeters, b.maxSquareMeters, " m²"));
  add("Planta", b.minFloor === null ? null : b.minFloor === 1 ? "No bajo" : `${b.minFloor}ª o más`);
  add(t("cc.brief.orientations"), list(b.orientations));
  add("Urgencia", labelOf(URGENCY, b.urgency));
  add(
    rent ? t("cc.brief.availableFrom") : "Comprar antes de",
    b.availableFrom ? formatDate(b.availableFrom, config.locale) : null,
  );

  if (rent) {
    add("Amueblado", labelOf(FURNISHED, b.furnished));
    add(
      t("clientes.ficha.preferences.occupants"),
      b.occupants
        ? [
            b.occupants,
            b.students ? tn("cc.brief.students", b.students, { n: b.students }) : null,
            b.workers ? tn("cc.brief.workers", b.workers, { n: b.workers }) : null,
            b.children ? `${b.children} ${b.children === 1 ? "niño" : "niños"}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
    );
    add(t("clientes.ficha.preferences.pets"), b.pets ? (b.petDetails ? `Sí · ${b.petDetails}` : t("cc.yes")) : null);
    add(t("cc.brief.universities"), b.universities);
    add("Garantías", labels(GUARANTEES, b.guarantees));
  } else {
    add("Financiación", labelOf(FINANCING, b.financing));
    add("Ahorro aportado", b.downPayment !== null ? plainMoney(b.downPayment) : null);
    add("Estado", labelOf(CONDITION_PREF, b.conditionPref));
    add("Obra nueva", labelOf(NEW_BUILD, b.newBuild));
    add("Acepta inquilino", yesNo(b.acceptsTenanted));
    add(
      t("clientes.ficha.preferences.occupants"),
      b.occupants
        ? [b.occupants, b.children ? `${b.children} ${b.children === 1 ? "niño" : "niños"}` : null].filter(Boolean).join(" · ")
        : null,
    );
  }
  add("Ingresos", b.monthlyIncome !== null ? `${plainMoney(b.monthlyIncome)}/mes` : null);
  add("Situación laboral", labelOf(EMPLOYMENT, b.employment));

  if (country === "cl") {
    const uf = (v: number | null) =>
      v === null ? "—" : `${new Intl.NumberFormat(config.locale).format(v)} UF`;
    add(
      t("cc.brief.budgetUf"),
      prefs.min_price_uf === null && prefs.max_price_uf === null
        ? null
        : `${uf(prefs.min_price_uf)} – ${uf(prefs.max_price_uf)}`,
    );
    add(t("cc.brief.regions"), list(prefs.preferred_regions));
    add(t("cc.brief.communes"), list(prefs.preferred_communes));
    add(t("cc.brief.sectors"), list(prefs.preferred_sectors));
    add(t("cc.brief.parking"), prefs.min_parking_spaces ? `${prefs.min_parking_spaces}+` : null);
    add(t("cc.brief.condominium"), yesNo(prefs.prefers_condominium));
    add(t("cc.brief.serviceBedroom"), yesNo(prefs.requires_service_bedroom));
    add(t("cc.brief.floors"), prefs.min_floors ? `${prefs.min_floors}+` : null);
  }

  const gaps = briefGaps(b);
  const essential = gaps.filter((g) => g.level === "essential");
  const recommended = gaps.filter((g) => g.level === "recommended");

  return (
    <Panel title={t("cc.brief.title")} action={edit}>
      {(essential.length > 0 || recommended.length > 0) && (
        <div
          className={
            essential.length
              ? "mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              : "mb-4 rounded-md border border-ink/8 bg-cream-50 px-3 py-2 text-xs text-ink/60"
          }
        >
          {essential.length > 0 && (
            <p className="flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>
                <strong>Sin esto las sugerencias salen a ciegas:</strong>{" "}
                {essential.map((g) => g.label).join(" · ")}
              </span>
            </p>
          )}
          {recommended.length > 0 && (
            <p className={essential.length ? "mt-1" : undefined}>
              Falta preguntar: {recommended.map((g) => g.label).join(" · ")}
            </p>
          )}
        </div>
      )}

      {fields.length === 0 ? (
        <Empty>{t("cc.brief.empty")}</Empty>
      ) : (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-3">
          {fields.map(([label, value]) => (
            <Field key={label} label={label} value={value} />
          ))}
        </dl>
      )}

      {(b.mustHave.length > 0 || b.niceToHave.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-ink/8 pt-3">
          {b.mustHave.map((k) => (
            <span
              key={`m-${k}`}
              className="inline-flex items-center gap-1 rounded-full border border-ink bg-ink px-2 py-0.5 text-xs text-cream-50"
              title="Imprescindible"
            >
              <Star size={10} className="fill-current" />
              {FEATURE_LABEL[k as FeatureKey] ?? k}
            </span>
          ))}
          {b.niceToHave.map((k) => (
            <span
              key={`n-${k}`}
              className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-gold/15 px-2 py-0.5 text-xs text-ink"
              title="Deseable"
            >
              <Star size={10} />
              {FEATURE_LABEL[k as FeatureKey] ?? k}
            </span>
          ))}
        </div>
      )}

      {[
        ["Lo que NO quiere", b.dealbreakers],
        ["Disponibilidad para visitas", b.viewingAvailability],
        [t("clientes.ficha.notes.title"), b.notes],
      ]
        .filter(([, v]) => v)
        .map(([label, value]) => (
          <div key={label} className="mt-4 border-t border-ink/8 pt-3">
            <p className="crm-label-sm text-ink/40">{label}</p>
            <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-ink/70">{value}</p>
          </div>
        ))}

      {prefs.updated_at && (
        <p className="mt-3 text-xs text-ink/35">
          {t("cc.brief.updated", { date: formatDate(prefs.updated_at, config.locale) })}
        </p>
      )}
    </Panel>
  );
}
