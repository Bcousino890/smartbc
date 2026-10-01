"use client";

// ============================================================================
// El encargo del cliente, desde la ficha.
//
// Es el MISMO formulario que "Nuevo cliente"
// (components/admin/clientes/encargo/encargo-form.tsx) y guarda con la misma
// función (`buildPreferencesPayload`). Si un campo se añade al encargo, sale
// en los dos sitios.
//
// El bloque de Chile solo se pinta si el cliente es chileno, y solo entonces
// se mandan esas columnas: guardar desde España no le borra a nadie lo que
// ya tenía puesto.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClientPreferencesFull } from "@/lib/db/queries/client-command-center";
import type { Country } from "@/lib/country-config";
import { EMPTY_BRIEF, type BriefInput, type BriefProfile } from "@/lib/clients/brief";
import { EncargoForm } from "@/components/admin/clientes/encargo/encargo-form";
import { useT } from "@/lib/i18n/provider";
import { saveClientPreferencesFull } from "../actions";
import { Button, Labeled, Modal, Select, TextInput, Toggle } from "./ui";

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
  profile: initialProfile,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  country: Country;
  prefs: ClientPreferencesFull | null;
  /** El perfil actual, o null si nadie lo eligió todavía. */
  profile: BriefProfile | null;
}) {
  const t = useT();
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [brief, setBrief] = useState<BriefInput>(prefs?.brief ?? { ...EMPTY_BRIEF });
  const [profile, setProfile] = useState<BriefProfile | null>(initialProfile);
  const [profileTouched, setProfileTouched] = useState(false);

  const [cl, setCl] = useState({
    regions: fromList(prefs?.preferred_regions ?? []),
    communes: fromList(prefs?.preferred_communes ?? []),
    minParkingSpaces: fromNum(prefs?.min_parking_spaces),
    minFloors: fromNum(prefs?.min_floors),
    minPriceUf: fromNum(prefs?.min_price_uf),
    maxPriceUf: fromNum(prefs?.max_price_uf),
    prefersCondominium: prefs?.prefers_condominium ?? false,
    requiresServiceBedroom: prefs?.requires_service_bedroom ?? false,
    currencyPreference: prefs?.currency_preference ?? "CLP",
  });
  const setC = <K extends keyof typeof cl>(k: K, v: (typeof cl)[K]) =>
    setCl((prev) => ({ ...prev, [k]: v }));

  const save = () => {
    setError(null);
    startSave(async () => {
      const r = await saveClientPreferencesFull({
        clientId,
        country,
        brief,
        // El perfil solo se reescribe si se tocó (o si cambiar de operación
        // obligó a cambiarlo): abrir y guardar no debe reetiquetar a nadie.
        profile: profileTouched ? profile : null,
        chile:
          country === "cl"
            ? {
                preferredRegions: toList(cl.regions),
                preferredCommunes: toList(cl.communes),
                requiresServiceBedroom: cl.requiresServiceBedroom,
                minParkingSpaces: toNum(cl.minParkingSpaces),
                prefersCondominium: cl.prefersCondominium,
                minFloors: toNum(cl.minFloors),
                currencyPreference: cl.currencyPreference || null,
                minPriceUf: toNum(cl.minPriceUf),
                maxPriceUf: toNum(cl.maxPriceUf),
              }
            : null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  const num = (label: string, k: keyof typeof cl) => (
    <Labeled label={label}>
      <TextInput
        value={String(cl[k] ?? "")}
        onChange={(e) => setC(k, e.target.value as never)}
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
      <div className="space-y-6">
        <EncargoForm
          value={brief}
          onChange={setBrief}
          profile={profile}
          onProfileChange={(p) => {
            setProfile(p);
            setProfileTouched(true);
          }}
          country={country}
          disabled={saving}
        />

        {country === "cl" && (
          <section className="space-y-3 border-t border-ink/8 pt-4">
            <h3 className="crm-label-sm text-ink/55">{t("cc.editPrefs.chile")}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Labeled label={t("cc.brief.regions")} className="sm:col-span-3">
                <TextInput
                  value={cl.regions}
                  onChange={(e) => setC("regions", e.target.value)}
                  placeholder={t("cc.editPrefs.commaHint")}
                />
              </Labeled>
              <Labeled label={t("cc.brief.communes")} className="sm:col-span-3">
                <TextInput
                  value={cl.communes}
                  onChange={(e) => setC("communes", e.target.value)}
                  placeholder={t("cc.editPrefs.commaHint")}
                />
              </Labeled>
              <Labeled label={t("cc.editPrefs.currency")}>
                <Select
                  value={cl.currencyPreference}
                  onChange={(e) => setC("currencyPreference", e.target.value)}
                >
                  <option value="CLP">CLP</option>
                  <option value="UF">UF</option>
                  <option value="USD">USD</option>
                </Select>
              </Labeled>
              {num(t("cc.editPrefs.minPriceUf"), "minPriceUf")}
              {num(t("cc.editPrefs.maxPriceUf"), "maxPriceUf")}
              {num(t("cc.brief.parking"), "minParkingSpaces")}
              {num(t("cc.brief.floors"), "minFloors")}
              <div className="flex items-end pb-1.5">
                <Toggle
                  checked={cl.prefersCondominium}
                  onChange={(v) => setC("prefersCondominium", v)}
                  label={t("cc.brief.condominium")}
                />
              </div>
              <div className="flex items-end pb-1.5">
                <Toggle
                  checked={cl.requiresServiceBedroom}
                  onChange={(v) => setC("requiresServiceBedroom", v)}
                  label={t("cc.brief.serviceBedroom")}
                />
              </div>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
