"use client";

// ============================================================================
// EL ENCARGO — un único formulario para "Nuevo cliente" y para "El encargo
// del cliente" en la ficha.
//
// Antes eran dos formularios que no preguntaban lo mismo (y un tercero en el
// panel lateral del listado). Ahora los dos diálogos pintan ESTE componente y
// guardan con el mismo `buildPreferencesPayload` (lib/clients/brief.ts), así
// que un campo nuevo aparece en los dos sitios a la vez.
//
// Lo que se pregunta depende de la operación: en venta no hay estudiantes,
// estancia, amueblado ni avales; en alquiler no hay hipoteca, obra nueva ni
// "acepta inquilino". Al cambiar de operación esos campos se ocultan y, al
// guardar, se borran — no se quedan escondidos influyendo en el match.
//
// Controlado: el estado vive en el diálogo que lo usa.
// ============================================================================

import { useState } from "react";
import { AlertTriangle, Check, Plus, Star, X } from "lucide-react";
import {
  briefGaps,
  CONDITION_PREF,
  EMPLOYMENT,
  FEATURES,
  FINANCING,
  FURNISHED,
  GUARANTEES,
  MORTGAGE_FINANCING,
  NEW_BUILD,
  ORIENTATIONS,
  profileForOperation,
  PROFILES_BY_OPERATION,
  PROPERTY_TYPES,
  PURCHASE_PURPOSE,
  STAY,
  URGENCY,
  type BriefInput,
  type BriefOperation,
  type BriefProfile,
  type Option,
} from "@/lib/clients/brief";
import { MADRID_ZONES, MADRID_ZONES_WITH_SUBZONES } from "@/lib/mock-properties";
import { Labeled, Select, TextArea, TextInput } from "@/components/admin/ui/primitives";
import { cn } from "@/lib/utils";

type Props = {
  value: BriefInput;
  onChange: (next: BriefInput) => void;
  profile: BriefProfile | null;
  onProfileChange: (p: BriefProfile) => void;
  /** "es" pinta las zonas de Madrid como chips; "cl" solo texto libre. */
  country: "es" | "cl";
  disabled?: boolean;
};

export function EncargoForm({ value: v, onChange, profile, onProfileChange, country, disabled }: Props) {
  const set = <K extends keyof BriefInput>(k: K, val: BriefInput[K]) => onChange({ ...v, [k]: val });
  const rent = v.operation === "rent";
  const money = rent ? "€/mes" : "€";
  const investor = v.purchasePurpose === "investment_rent" || v.purchasePurpose === "investment_flip";

  const setOperation = (op: BriefOperation) => {
    if (op === v.operation) return;
    onChange({ ...v, operation: op, stay: op === "rent" ? (v.stay ?? "long") : v.stay });
    onProfileChange(profileForOperation(profile, op));
  };

  return (
    <div className={cn("space-y-6", disabled && "pointer-events-none opacity-60")}>
      <Completeness brief={v} />

      {/* ── Qué busca ───────────────────────────────────── */}
      <Section title="Qué busca">
        <div className="grid gap-3 sm:grid-cols-2">
          <Group label="Operación">
            <Segmented
              value={v.operation}
              onChange={(k) => setOperation(k as BriefOperation)}
              options={[
                { key: "rent", label: "Alquiler" },
                { key: "sale", label: "Venta" },
              ]}
            />
          </Group>
          <Group label="Perfil">
            <Segmented
              value={profile ?? ""}
              onChange={(k) => onProfileChange(k as BriefProfile)}
              options={PROFILES_BY_OPERATION[v.operation]}
            />
          </Group>
        </div>

        <Group label="Tipo de vivienda (vacío = cualquiera)">
          <Chips
            options={PROPERTY_TYPES}
            selected={v.propertyTypes}
            onChange={(list) => set("propertyTypes", list)}
          />
        </Group>

        {rent && (
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Group label="Estancia">
              <Segmented
                value={v.stay ?? "long"}
                onChange={(k) => set("stay", k as "short" | "long")}
                options={STAY}
              />
            </Group>
            <Labeled label="Duración (meses)">
              <NumField value={v.stayMonths} onChange={(n) => set("stayMonths", n)} placeholder={v.stay === "short" ? "p. ej. 11" : "12+"} />
            </Labeled>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Urgencia">
            <OptionSelect options={URGENCY} value={v.urgency} onChange={(k) => set("urgency", k)} />
          </Labeled>
          <Labeled label={rent ? "Entrada desde" : "Necesita comprar antes de"}>
            <TextInput
              type="date"
              value={v.availableFrom ?? ""}
              onChange={(e) => set("availableFrom", e.target.value || null)}
            />
          </Labeled>
        </div>
      </Section>

      {/* ── Dónde ───────────────────────────────────────── */}
      <Section title="Dónde">
        <ZonePicker
          country={country}
          zones={v.zones}
          subzones={v.subzones}
          onChange={(zones, subzones) => onChange({ ...v, zones, subzones })}
        />
        <CheckRow
          checked={v.zonesFlexible}
          onChange={(c) => set("zonesFlexible", c)}
          label="Abierto a otras zonas"
          hint="Sin marcar, solo se le sugieren propiedades en estas zonas."
        />
      </Section>

      {/* ── Presupuesto y solvencia ─────────────────────── */}
      <Section title={rent ? "Presupuesto y solvencia" : "Presupuesto y financiación"}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Labeled label={`Desde (${money})`}>
            <NumField money value={v.minPrice} onChange={(n) => set("minPrice", n)} />
          </Labeled>
          <Labeled label={`Hasta (${money})`}>
            <NumField money value={v.maxPrice} onChange={(n) => set("maxPrice", n)} />
          </Labeled>
          <Labeled label="Puede estirarse">
            <Select
              value={v.maxPriceFlexPct ?? ""}
              onChange={(e) => set("maxPriceFlexPct", e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Nada</option>
              {[5, 10, 15, 20].map((p) => (
                <option key={p} value={p}>
                  Hasta un {p} % más
                </option>
              ))}
            </Select>
          </Labeled>
        </div>

        {!rent && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Labeled label="Finalidad">
              <OptionSelect options={PURCHASE_PURPOSE} value={v.purchasePurpose} onChange={(k) => set("purchasePurpose", k)} />
            </Labeled>
            <Labeled label="Financiación">
              <OptionSelect options={FINANCING} value={v.financing} onChange={(k) => set("financing", k)} />
            </Labeled>
            <Labeled label={v.financing && MORTGAGE_FINANCING.has(v.financing) ? "Ahorro aportado (€)" : "Ahorro / entrada (€)"}>
              <NumField money value={v.downPayment} onChange={(n) => set("downPayment", n)} />
            </Labeled>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Ingresos netos del hogar (€/mes)">
            <NumField money value={v.monthlyIncome} onChange={(n) => set("monthlyIncome", n)} />
          </Labeled>
          <Labeled label="Situación laboral">
            <OptionSelect options={EMPLOYMENT} value={v.employment} onChange={(k) => set("employment", k)} />
          </Labeled>
        </div>

        {rent && (
          <Group label="Garantías que puede aportar">
            <Chips options={GUARANTEES} selected={v.guarantees} onChange={(list) => set("guarantees", list)} />
          </Group>
        )}
      </Section>

      {/* ── La vivienda ─────────────────────────────────── */}
      <Section title="La vivienda">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Labeled label="Dorm. mín.">
            <NumField value={v.minBedrooms} onChange={(n) => set("minBedrooms", n)} />
          </Labeled>
          <Labeled label="Dorm. máx.">
            <NumField value={v.maxBedrooms} onChange={(n) => set("maxBedrooms", n)} />
          </Labeled>
          <Labeled label="Baños mín.">
            <NumField value={v.minBathrooms} onChange={(n) => set("minBathrooms", n)} />
          </Labeled>
          <Labeled label="m² mín.">
            <NumField value={v.minSquareMeters} onChange={(n) => set("minSquareMeters", n)} />
          </Labeled>
          <Labeled label="m² máx.">
            <NumField value={v.maxSquareMeters} onChange={(n) => set("maxSquareMeters", n)} />
          </Labeled>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Planta">
            <Select
              value={v.minFloor ?? ""}
              onChange={(e) => set("minFloor", e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">Indiferente</option>
              <option value={1}>Que no sea un bajo</option>
              <option value={2}>2ª o más</option>
              <option value={3}>3ª o más</option>
              <option value={4}>4ª o más</option>
              <option value={5}>5ª o más</option>
            </Select>
          </Labeled>
          <Group label="Orientación preferida">
            <Chips options={ORIENTATIONS} selected={v.orientations} onChange={(list) => set("orientations", list)} />
          </Group>
        </div>

        {rent ? (
          <Group label="Amueblado">
            <Segmented
              value={v.furnished ?? ""}
              onChange={(k) => set("furnished", k || null)}
              options={[{ key: "", label: "Indiferente" }, ...FURNISHED]}
            />
          </Group>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Labeled label="Estado">
              <OptionSelect options={CONDITION_PREF} value={v.conditionPref} onChange={(k) => set("conditionPref", k)} />
            </Labeled>
            <Labeled label="Obra nueva">
              <OptionSelect options={NEW_BUILD} value={v.newBuild} onChange={(k) => set("newBuild", k)} />
            </Labeled>
            <Labeled label="¿Acepta con inquilino?">
              <Select
                value={v.acceptsTenanted === null ? "" : v.acceptsTenanted ? "yes" : "no"}
                onChange={(e) =>
                  set("acceptsTenanted", e.target.value === "" ? null : e.target.value === "yes")
                }
              >
                <option value="">Indiferente</option>
                <option value="yes">Sí</option>
                <option value="no">No</option>
              </Select>
            </Labeled>
          </div>
        )}
      </Section>

      {/* ── Características ─────────────────────────────── */}
      <Section
        title="Características"
        hint="Toca una vez para «deseable» (suma en el match) y otra para «imprescindible» (descarta las fichas que digan lo contrario, p. ej. «sin ascensor»)."
      >
        <FeaturePicker
          mustHave={v.mustHave}
          niceToHave={v.niceToHave}
          onChange={(mustHave, niceToHave) => onChange({ ...v, mustHave, niceToHave })}
        />
      </Section>

      {/* ── Quién va a vivir ────────────────────────────── */}
      {!(!rent && investor) && (
        <Section title="Quién va a vivir">
          <div className={cn("grid grid-cols-2 gap-3", rent ? "sm:grid-cols-4" : "sm:grid-cols-2")}>
            <Labeled label="Personas en total">
              <NumField value={v.occupants} onChange={(n) => set("occupants", n)} />
            </Labeled>
            {rent && (
              <>
                <Labeled label="De ellas estudian">
                  <NumField value={v.students} onChange={(n) => set("students", n)} />
                </Labeled>
                <Labeled label="De ellas trabajan">
                  <NumField value={v.workers} onChange={(n) => set("workers", n)} />
                </Labeled>
              </>
            )}
            <Labeled label="Niños">
              <NumField value={v.children} onChange={(n) => set("children", n)} />
            </Labeled>
          </div>

          {rent && ((v.students ?? 0) > 0 || profile === "student") && (
            <Labeled label="Universidad / escuela">
              <TextInput
                value={v.universities ?? ""}
                onChange={(e) => set("universities", e.target.value || null)}
                placeholder="UAM, IE, CUNEF, Comillas…"
              />
            </Labeled>
          )}

          {rent && (
            <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
              <CheckRow checked={v.pets} onChange={(c) => set("pets", c)} label="Tiene mascotas" />
              {v.pets && (
                <TextInput
                  value={v.petDetails ?? ""}
                  onChange={(e) => set("petDetails", e.target.value || null)}
                  placeholder="Qué y cuántas: un perro mediano, dos gatos…"
                />
              )}
            </div>
          )}
        </Section>
      )}

      {/* ── Para no olvidar ─────────────────────────────── */}
      <Section title="Para no olvidar">
        <Labeled label="Lo que NO quiere">
          <TextArea
            rows={2}
            value={v.dealbreakers ?? ""}
            onChange={(e) => set("dealbreakers", e.target.value || null)}
            placeholder="Calles ruidosas, cocina abierta, más de 20 min al trabajo…"
          />
        </Labeled>
        <Labeled label="Disponibilidad para visitas">
          <TextInput
            value={v.viewingAvailability ?? ""}
            onChange={(e) => set("viewingAvailability", e.target.value || null)}
            placeholder="Tardes a partir de las 18 h, sábados por la mañana…"
          />
        </Labeled>
        <Labeled label="Notas internas">
          <TextArea
            rows={3}
            value={v.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
            placeholder="Lo que haga falta recordar de este cliente."
          />
        </Labeled>
      </Section>
    </div>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

/**
 * Como `Labeled`, pero sin `<label>`: un grupo de botones dentro de un
 * `<label>` hace que pulsar el título active el primer botón.
 */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="min-w-0">
      <span className="crm-label-sm mb-1 block text-ink/45">{label}</span>
      {children}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-ink/8 pt-4 first:border-t-0 first:pt-0">
      <div>
        <h3 className="crm-label-sm text-ink/55">{title}</h3>
        {hint && <p className="mt-1 text-xs text-ink/45">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Lo que falta para que el match no vaya a ciegas, y lo que se suele olvidar. */
function Completeness({ brief }: { brief: BriefInput }) {
  const gaps = briefGaps(brief);
  const essential = gaps.filter((g) => g.level === "essential");
  const recommended = gaps.filter((g) => g.level === "recommended");
  if (gaps.length === 0) {
    return (
      <p className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        <Check size={13} /> Encargo completo: el match tiene todo lo que necesita.
      </p>
    );
  }
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-xs",
        essential.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-ink/10 bg-cream-50 text-ink/65",
      )}
    >
      {essential.length > 0 && (
        <p className="flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            <strong>Sin esto las sugerencias salen a ciegas:</strong> {essential.map((g) => g.label).join(" · ")}
          </span>
        </p>
      )}
      {recommended.length > 0 && (
        <p className={cn(essential.length > 0 && "mt-1")}>
          Conviene preguntar: {recommended.map((g) => g.label).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (key: string) => void;
  options: Option[];
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-ink/12 bg-white p-1">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key || "_"}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={cn(
              "flex-1 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition",
              active ? "bg-ink text-cream-50 shadow-sm" : "text-ink/60 hover:bg-ink/5 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Chips({
  options,
  selected,
  onChange,
}: {
  options: Option[];
  selected: string[];
  onChange: (list: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = selected.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? selected.filter((k) => k !== o.key) : [...selected, o.key])}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition",
              active
                ? "border-ink bg-ink text-cream-50"
                : "border-ink/15 bg-white text-ink/65 hover:border-ink/35 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function OptionSelect({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Sin indicar</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/**
 * Un número o NADA. Vacío es "no lo sé", nunca un cero: un cero en
 * "dormitorios mínimos" sería un dato, y uno falso. El dinero se pinta con
 * separador de miles para que 450000 y 4500000 no se confundan.
 */
function NumField({
  value,
  onChange,
  money,
  placeholder,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  money?: boolean;
  placeholder?: string;
}) {
  const shown = value === null ? "" : money ? new Intl.NumberFormat("es-ES").format(value) : String(value);
  return (
    <TextInput
      inputMode="numeric"
      value={shown}
      placeholder={placeholder ?? "—"}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onChange(digits ? Number(digits) : null);
      }}
    />
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-ink/75">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 accent-[#8a6d3b]"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-ink/45">{hint}</span>}
      </span>
    </label>
  );
}

type FeatureState = "any" | "nice" | "must";

function FeaturePicker({
  mustHave,
  niceToHave,
  onChange,
}: {
  mustHave: string[];
  niceToHave: string[];
  onChange: (mustHave: string[], niceToHave: string[]) => void;
}) {
  const stateOf = (k: string): FeatureState =>
    mustHave.includes(k) ? "must" : niceToHave.includes(k) ? "nice" : "any";
  const cycle = (k: string) => {
    const without = (l: string[]) => l.filter((x) => x !== k);
    const s = stateOf(k);
    if (s === "any") onChange(without(mustHave), [...without(niceToHave), k]);
    else if (s === "nice") onChange([...without(mustHave), k], without(niceToHave));
    else onChange(without(mustHave), without(niceToHave));
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {FEATURES.map((f) => {
          const s = stateOf(f.key);
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => cycle(f.key)}
              title={s === "any" ? "Da igual" : s === "nice" ? "Deseable" : "Imprescindible"}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                s === "any" && "border-ink/15 bg-white text-ink/60 hover:border-ink/35 hover:text-ink",
                s === "nice" && "border-gold/50 bg-gold/15 text-ink",
                s === "must" && "border-ink bg-ink text-cream-50",
              )}
            >
              {s === "nice" && <Star size={11} strokeWidth={2} />}
              {s === "must" && <Star size={11} strokeWidth={2} className="fill-current" />}
              {f.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink/45">
        <span className="inline-flex items-center gap-1">
          <Star size={11} strokeWidth={2} /> Deseable
        </span>
        <span className="inline-flex items-center gap-1">
          <Star size={11} strokeWidth={2} className="fill-current" /> Imprescindible
        </span>
      </p>
    </div>
  );
}

/**
 * Zonas y barrios. En España, las zonas de Madrid como chips y, al marcar
 * una, sus barrios; "Otra zona" añade cualquier nombre (Pozuelo, La
 * Moraleja…). El match busca cada nombre en la zona Y en el barrio de la
 * ficha, porque hay barrios que en unas fichas vienen como zona y en otras
 * como subzona.
 */
function ZonePicker({
  country,
  zones,
  subzones,
  onChange,
}: {
  country: "es" | "cl";
  zones: string[];
  subzones: string[];
  onChange: (zones: string[], subzones: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const known: readonly string[] = country === "es" ? MADRID_ZONES : [];
  const extra = zones.filter((z) => !known.includes(z));

  const toggleZone = (zone: string) => {
    if (zones.includes(zone)) {
      const next = zones.filter((z) => z !== zone);
      // Un barrio se va con su zona, salvo que también cuelgue de otra que
      // sigue marcada (Plaza Mayor está en Centro y en Justicia).
      const keep = new Set(next.flatMap((z) => MADRID_ZONES_WITH_SUBZONES[z] ?? []));
      const own = new Set(MADRID_ZONES_WITH_SUBZONES[zone] ?? []);
      onChange(next, subzones.filter((s) => !own.has(s) || keep.has(s)));
    } else {
      onChange([...zones, zone], subzones);
    }
  };

  const addDraft = () => {
    const names = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !zones.some((z) => z.toLowerCase() === s.toLowerCase()));
    if (names.length) onChange([...zones, ...names], subzones);
    setDraft("");
  };

  return (
    <div className="space-y-3">
      {known.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {known.map((z) => {
            const active = zones.includes(z);
            return (
              <button
                key={z}
                type="button"
                aria-pressed={active}
                onClick={() => toggleZone(z)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition",
                  active
                    ? "border-ink bg-ink text-cream-50"
                    : "border-ink/15 bg-white text-ink/65 hover:border-ink/35 hover:text-ink",
                )}
              >
                {z}
              </button>
            );
          })}
        </div>
      )}

      {zones.some((z) => (MADRID_ZONES_WITH_SUBZONES[z] ?? []).length > 0) && (
        <div className="space-y-2 rounded-md border border-ink/8 bg-cream-50/60 p-3">
          <p className="text-xs text-ink/50">Barrios (opcional — sin marcar, vale toda la zona)</p>
          {zones.map((z) => {
            const subs = MADRID_ZONES_WITH_SUBZONES[z] ?? [];
            if (!subs.length) return null;
            return (
              <div key={z} className="flex flex-wrap items-center gap-1.5">
                <span className="me-1 text-xs font-medium text-ink/70">{z}</span>
                {subs.map((s) => {
                  const active = subzones.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        onChange(zones, active ? subzones.filter((x) => x !== s) : [...subzones, s])
                      }
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs transition",
                        active
                          ? "border-gold/60 bg-gold/20 text-ink"
                          : "border-ink/10 bg-white text-ink/55 hover:border-ink/25 hover:text-ink/80",
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {(extra.length > 0 || subzones.some((s) => !zones.some((z) => (MADRID_ZONES_WITH_SUBZONES[z] ?? []).includes(s)))) && (
        <div className="flex flex-wrap gap-1.5">
          {extra.map((z) => (
            <RemovableChip key={`z-${z}`} label={z} onRemove={() => onChange(zones.filter((x) => x !== z), subzones)} />
          ))}
          {subzones
            .filter((s) => !zones.some((z) => (MADRID_ZONES_WITH_SUBZONES[z] ?? []).includes(s)))
            .map((s) => (
              <RemovableChip
                key={`s-${s}`}
                label={s}
                onRemove={() => onChange(zones, subzones.filter((x) => x !== s))}
              />
            ))}
        </div>
      )}

      <div className="flex gap-2">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
          placeholder={country === "es" ? "Otra zona: Pozuelo, La Moraleja…" : "Zonas, separadas por comas"}
        />
        <button
          type="button"
          onClick={addDraft}
          disabled={!draft.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ink/15 bg-white px-3 text-xs text-ink/70 transition hover:border-gold/50 hover:text-ink disabled:opacity-40"
        >
          <Plus size={12} /> Añadir
        </button>
      </div>
    </div>
  );
}

function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-ink bg-ink py-1 pe-1.5 ps-2.5 text-xs text-cream-50">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Quitar ${label}`} className="rounded-full p-0.5 hover:bg-white/15">
        <X size={11} />
      </button>
    </span>
  );
}
