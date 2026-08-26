"use client";

// ============================================================================
// Editar el encargo — las 34 columnas, desde la ficha.
//
// Antes esto solo existía en el panel lateral del LISTADO, con seis campos y
// sin una sola de las columnas chilenas. Un agente que abría la ficha de su
// cliente no podía tocar sus preferencias sin volver atrás.
//
// El bloque de Chile solo se pinta si el cliente es chileno, pero lo que ya
// esté guardado NO se borra al guardar desde España: la acción manda los
// campos tal y como llegaron. Cambiar a alguien de país no debe vaciarle en
// silencio la mitad del encargo.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClientPreferencesFull } from "@/lib/db/queries/client-command-center";
import type { Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { saveClientPreferencesFull } from "../actions";
import { Button, Labeled, Modal, Select, TextArea, TextInput, Toggle } from "./ui";

/** "" → null. Un campo vacío es "no lo sé", no un cero. */
const toNum = (v: string): number | null => {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const fromNum = (v: number | null | undefined): string =>
  v === null || v === undefined ? "" : String(v);

const fromList = (v: string[]): string => v.join(", ");
const toList = (v: string): string[] =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function EditPreferencesDialog({
  open,
  onClose,
  clientId,
  country,
  prefs,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  country: Country;
  prefs: ClientPreferencesFull | null;
}) {
  const t = useT();
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState({
    operation: (prefs?.operation === "sale" ? "sale" : "rent") as "rent" | "sale",
    stay: (prefs?.stay === "short" ? "short" : "long") as "short" | "long",
    zones: fromList(prefs?.zones ?? []),
    minPrice: fromNum(prefs?.min_price),
    maxPrice: fromNum(prefs?.max_price),
    minBedrooms: fromNum(prefs?.min_bedrooms),
    minBathrooms: fromNum(prefs?.min_bathrooms),
    minSquareMeters: fromNum(prefs?.min_square_meters),
    maxSquareMeters: fromNum(prefs?.max_square_meters),
    availableFrom: prefs?.available_from ?? "",
    occupants: fromNum(prefs?.occupants),
    students: fromNum(prefs?.students),
    workers: fromNum(prefs?.workers),
    pets: prefs?.pets ?? false,
    universities: prefs?.universities ?? "",
    notes: prefs?.notes ?? "",
    // Chile
    regions: fromList(prefs?.preferred_regions ?? []),
    communes: fromList(prefs?.preferred_communes ?? []),
    minParkingSpaces: fromNum(prefs?.min_parking_spaces),
    minFloors: fromNum(prefs?.min_floors),
    minPriceUf: fromNum(prefs?.min_price_uf),
    maxPriceUf: fromNum(prefs?.max_price_uf),
    prefersCondominium: prefs?.prefers_condominium ?? false,
    requiresServiceBedroom: prefs?.requires_service_bedroom ?? false,
    currencyPreference: prefs?.currency_preference ?? (country === "cl" ? "CLP" : "EUR"),
  });

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const save = () => {
    setError(null);
    startSave(async () => {
      const r = await saveClientPreferencesFull({
        clientId,
        country,
        operation: f.operation,
        stay: f.stay,
        zones: toList(f.zones),
        minPrice: toNum(f.minPrice),
        maxPrice: toNum(f.maxPrice),
        minBedrooms: toNum(f.minBedrooms),
        minBathrooms: toNum(f.minBathrooms),
        minSquareMeters: toNum(f.minSquareMeters),
        maxSquareMeters: toNum(f.maxSquareMeters),
        availableFrom: f.availableFrom || null,
        occupants: toNum(f.occupants),
        students: toNum(f.students),
        workers: toNum(f.workers),
        pets: f.pets,
        universities: f.universities || null,
        notes: f.notes || null,
        preferredRegions: toList(f.regions),
        preferredCommunes: toList(f.communes),
        requiresServiceBedroom: f.requiresServiceBedroom,
        minParkingSpaces: toNum(f.minParkingSpaces),
        prefersCondominium: f.prefersCondominium,
        minFloors: toNum(f.minFloors),
        currencyPreference: f.currencyPreference || null,
        minPriceUf: toNum(f.minPriceUf),
        maxPriceUf: toNum(f.maxPriceUf),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  const Num = ({
    label,
    k,
  }: {
    label: string;
    k: keyof typeof f;
  }) => (
    <Labeled label={label}>
      <TextInput
        value={String(f[k] ?? "")}
        onChange={(e) => set(k, e.target.value as never)}
        inputMode="numeric"
      />
    </Labeled>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t("cc.editPrefs.title")}
      footer={
        <>
          {error && <p className="me-auto text-xs text-rose-600">{error}</p>}
          <Button onClick={onClose} disabled={saving}>
            {t("cc.cancel")}
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? t("cc.saving") : t("cc.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Section title={t("cc.editPrefs.what")}>
          <Labeled label={t("clientes.ficha.preferences.operation")}>
            <Select
              value={f.operation}
              onChange={(e) => set("operation", e.target.value as "rent" | "sale")}
            >
              <option value="rent">{t("filters.operation.rent")}</option>
              <option value="sale">{t("filters.operation.sale")}</option>
            </Select>
          </Labeled>
          <Labeled label={t("clientes.ficha.preferences.stay")}>
            <Select
              value={f.stay}
              onChange={(e) => set("stay", e.target.value as "short" | "long")}
            >
              <option value="long">{t("card.stay.long")}</option>
              <option value="short">{t("card.stay.short")}</option>
            </Select>
          </Labeled>
          <Labeled label={t("cc.brief.availableFrom")}>
            <TextInput
              type="date"
              value={f.availableFrom}
              onChange={(e) => set("availableFrom", e.target.value)}
            />
          </Labeled>
        </Section>

        <Section title={t("cc.editPrefs.budget")}>
          <Num label={t("cc.editPrefs.minPrice")} k="minPrice" />
          <Num label={t("cc.editPrefs.maxPrice")} k="maxPrice" />
          {country === "cl" && (
            <Labeled label={t("cc.editPrefs.currency")}>
              <Select
                value={f.currencyPreference}
                onChange={(e) => set("currencyPreference", e.target.value)}
              >
                <option value="CLP">CLP</option>
                <option value="UF">UF</option>
                <option value="USD">USD</option>
              </Select>
            </Labeled>
          )}
        </Section>

        <Section title={t("cc.editPrefs.home")}>
          <Num label={t("cc.editPrefs.minBedrooms")} k="minBedrooms" />
          <Num label={t("cc.editPrefs.minBathrooms")} k="minBathrooms" />
          <Num label={t("cc.editPrefs.minArea")} k="minSquareMeters" />
          <Num label={t("cc.editPrefs.maxArea")} k="maxSquareMeters" />
        </Section>

        <Section title={t("cc.editPrefs.where")} full>
          <Labeled label={t("cc.brief.zones")} className="sm:col-span-3">
            <TextInput
              value={f.zones}
              onChange={(e) => set("zones", e.target.value)}
              placeholder={t("cc.editPrefs.commaHint")}
            />
          </Labeled>
        </Section>

        <Section title={t("cc.editPrefs.who")}>
          <Num label={t("clientes.ficha.preferences.occupants")} k="occupants" />
          <Num label={t("cc.editPrefs.students")} k="students" />
          <Num label={t("cc.editPrefs.workers")} k="workers" />
          <div className="flex items-end pb-1.5">
            <Toggle
              checked={f.pets}
              onChange={(v) => set("pets", v)}
              label={t("clientes.ficha.preferences.pets")}
            />
          </div>
          <Labeled label={t("cc.brief.universities")} className="sm:col-span-2">
            <TextInput
              value={f.universities}
              onChange={(e) => set("universities", e.target.value)}
            />
          </Labeled>
        </Section>

        {country === "cl" && (
          <Section title={t("cc.editPrefs.chile")} full>
            <Labeled label={t("cc.brief.regions")} className="sm:col-span-3">
              <TextInput
                value={f.regions}
                onChange={(e) => set("regions", e.target.value)}
                placeholder={t("cc.editPrefs.commaHint")}
              />
            </Labeled>
            <Labeled label={t("cc.brief.communes")} className="sm:col-span-3">
              <TextInput
                value={f.communes}
                onChange={(e) => set("communes", e.target.value)}
                placeholder={t("cc.editPrefs.commaHint")}
              />
            </Labeled>
            <Num label={t("cc.editPrefs.minPriceUf")} k="minPriceUf" />
            <Num label={t("cc.editPrefs.maxPriceUf")} k="maxPriceUf" />
            <Num label={t("cc.brief.parking")} k="minParkingSpaces" />
            <Num label={t("cc.brief.floors")} k="minFloors" />
            <div className="flex items-end pb-1.5">
              <Toggle
                checked={f.prefersCondominium}
                onChange={(v) => set("prefersCondominium", v)}
                label={t("cc.brief.condominium")}
              />
            </div>
            <div className="flex items-end pb-1.5">
              <Toggle
                checked={f.requiresServiceBedroom}
                onChange={(v) => set("requiresServiceBedroom", v)}
                label={t("cc.brief.serviceBedroom")}
              />
            </div>
          </Section>
        )}

        <Section title={t("clientes.ficha.notes.title")} full>
          <div className="sm:col-span-3">
            <TextArea
              rows={3}
              value={f.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder={t("cc.editPrefs.notesHint")}
            />
          </div>
        </Section>
      </div>
    </Modal>
  );
}

function Section({
  title,
  children,
  full,
}: {
  title: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <section>
      <h3 className="mb-2 crm-label-sm text-ink/40">
        {title}
      </h3>
      <div
        className={
          full
            ? "grid grid-cols-1 gap-3 sm:grid-cols-3"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3"
        }
      >
        {children}
      </div>
    </section>
  );
}
