"use client";

import {
  Bath,
  BedDouble,
  Car,
  Check,
  ChevronDown,
  Compass,
  Eye,
  Heart,
  Home,
  Info,
  Mail,
  MapPin,
  MessageSquare,
  MoreVertical,
  Pencil,
  Phone,
  RotateCcw,
  Save,
  Star,
  Trees,
} from "lucide-react";
import { useState, useTransition } from "react";
import { saveClientPreferencesChile } from "@/app/(admin)/admin/clientes/actions";
import { useT } from "@/lib/i18n/provider";
import type { AdminClient } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  LocationMultiselect,
  CHILE_REGIONS,
  COMMUNES_BY_REGION,
  SECTORS_BY_COMMUNE,
} from "./location-multiselect";

type FeedbackKind = "idle" | "saved" | "error";

const ARCHITECTURAL_TYPES = [
  { value: "mediterranea", label: "Mediterránea" },
  { value: "chilena", label: "Chilena" },
  { value: "inglesa", label: "Inglesa" },
  { value: "moderna", label: "Moderna" },
  { value: "neoclasica", label: "Neoclásica" },
  { value: "colonial", label: "Colonial" },
  { value: "contemporanea", label: "Contemporánea" },
];

const ORIENTATIONS = [
  { value: "norte", label: "Norte" },
  { value: "sur", label: "Sur" },
  { value: "oriente", label: "Oriente" },
  { value: "poniente", label: "Poniente" },
  { value: "nororiente", label: "Nor-Oriente" },
  { value: "norponiente", label: "Nor-Poniente" },
  { value: "suroriente", label: "Sur-Oriente" },
  { value: "surponiente", label: "Sur-Poniente" },
];

type ChileFiltersState = {
  operation: "alquiler" | "venta";
  preferredRegions: string[];
  preferredCommunes: string[];
  preferredSectors: string[];
  budgetMin: number;
  budgetMax: number;
  minPriceUf: number;
  maxPriceUf: number;
  currencyPreference: "CLP" | "UF";
  minBedrooms: number;
  minBathrooms: number;
  minSquareMeters: number;
  requiresServiceBedroom: boolean | undefined;
  preferredArchitecturalTypes: string[];
  minParkingSpaces: number;
  prefersCondominium: boolean | undefined;
  preferredOrientations: string[];
  minFloors: number;
};

function snapshotFromClient(client: AdminClient): ChileFiltersState {
  return {
    operation: (client.operation as "alquiler" | "venta") || "venta",
    preferredRegions: [],
    preferredCommunes: [],
    preferredSectors: [],
    budgetMin: client.budgetMin || 0,
    budgetMax: client.budgetMax || 0,
    minPriceUf: 0,
    maxPriceUf: 0,
    currencyPreference: "CLP",
    minBedrooms: 0,
    minBathrooms: 0,
    minSquareMeters: 0,
    requiresServiceBedroom: undefined,
    preferredArchitecturalTypes: [],
    minParkingSpaces: 0,
    prefersCondominium: undefined,
    preferredOrientations: [],
    minFloors: 0,
  };
}

const AVATAR_COLORS = [
  "bg-gold/20 text-amber-800",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-orange-100 text-orange-700",
];

function getAvatarColor(name: string): string {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export function ClientDetailPanelCL({
  client,
}: {
  client: AdminClient | undefined;
}) {
  if (!client) {
    return (
      <aside className="flex flex-col items-center justify-center rounded-2xl border border-gold/15 bg-cream-50/85 p-8 text-center shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
        <p className="crm-section-title text-ink">Selecciona un cliente</p>
        <p className="mt-2 max-w-xs text-sm text-ink/60">
          Haz clic en un cliente para ver y editar sus preferencias de búsqueda.
        </p>
      </aside>
    );
  }

  return <ClientDetailPanelCLInner client={client} />;
}

function ClientDetailPanelCLInner({ client }: { client: AdminClient }) {
  const initial = snapshotFromClient(client);
  const [state, setState] = useState<ChileFiltersState>(initial);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<FeedbackKind>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const patch = <K extends keyof ChileFiltersState>(key: K, value: ChileFiltersState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const handleSave = () => {
    setFeedback("idle");
    setErrorMsg(null);
    startTransition(async () => {
      const result = await saveClientPreferencesChile({
        clientId: client.id,
        operation: state.operation,
        preferredRegions: state.preferredRegions,
        preferredCommunes: state.preferredCommunes,
        preferredSectors: state.preferredSectors,
        budgetMin: state.budgetMin || undefined,
        budgetMax: state.budgetMax || undefined,
        minPriceUf: state.minPriceUf || undefined,
        maxPriceUf: state.maxPriceUf || undefined,
        currencyPreference: state.currencyPreference,
        minBedrooms: state.minBedrooms || undefined,
        minBathrooms: state.minBathrooms || undefined,
        minSquareMeters: state.minSquareMeters || undefined,
        requiresServiceBedroom: state.requiresServiceBedroom,
        preferredArchitecturalTypes: state.preferredArchitecturalTypes,
        minParkingSpaces: state.minParkingSpaces || undefined,
        prefersCondominium: state.prefersCondominium,
        preferredOrientations: state.preferredOrientations,
        minFloors: state.minFloors || undefined,
      });
      if (result.ok) {
        setFeedback("saved");
        setTimeout(() => setFeedback("idle"), 2500);
      } else {
        setFeedback("error");
        setErrorMsg(result.error);
      }
    });
  };

  const handleReset = () => {
    setState(initial);
    setFeedback("idle");
    setErrorMsg(null);
  };

  const fullName = `${client.firstName} ${client.lastName}`.trim();
  const avatarColor = getAvatarColor(fullName || client.email);
  const isActive = client.status === "active";

  return (
    <aside className="flex flex-col rounded-2xl border border-gold/15 bg-cream-50/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
      {/* Header cliente */}
      <div className="flex items-start justify-between gap-3 p-5 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold", avatarColor)}>
            {client.avatarInitials}
          </span>
          <div className="min-w-0">
            <h2 className="truncate crm-section-title text-ink">
              {client.firstName} {client.lastName}
            </h2>
            <span className={cn(
              "mt-1 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium",
              isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-ink/15 bg-ink/5 text-ink/55",
            )}>
              {isActive ? "Activo" : "Inactivo"}
            </span>
          </div>
        </div>
        <button type="button" aria-label="Más opciones" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/45 transition hover:bg-white/60 hover:text-ink">
          <MoreVertical size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* Contacto */}
      <ul className="flex flex-col gap-2 border-t border-gold/15 px-5 py-3 text-xs text-ink/70">
        <li className="flex items-center gap-1.5 truncate">
          <Mail size={13} strokeWidth={1.75} className="text-gold" />
          <span className="truncate">{client.email}</span>
        </li>
        {client.phone && (
          <li className="flex items-center gap-1.5">
            <Phone size={13} strokeWidth={1.75} className="text-gold" />
            <span>{client.phone}</span>
          </li>
        )}
        {client.location && (
          <li className="flex items-center gap-1.5">
            <MapPin size={13} strokeWidth={1.75} className="text-gold" />
            <span>{client.location}</span>
          </li>
        )}
      </ul>

      {/* Actividad */}
      <div className="border-t border-gold/15 px-5 py-3">
        <p className="crm-label-sm text-ink/55">Actividad</p>
        <ul className="mt-3 grid grid-cols-4 gap-2">
          {[
            { icon: <Eye size={14} strokeWidth={1.75} />, value: client.activity.propertiesViewed, label: "Vistas" },
            { icon: <Heart size={14} strokeWidth={1.75} />, value: client.activity.favorites, label: "Favoritas" },
            { icon: <MessageSquare size={14} strokeWidth={1.75} />, value: client.activity.messages, label: "Mensajes" },
            { icon: <Star size={14} strokeWidth={1.75} />, value: client.activity.visitsRequested, label: "Visitas" },
          ].map(({ icon, value, label }) => (
            <li key={label} className="flex flex-col items-center gap-1 rounded-xl border border-gold/10 bg-white/55 py-2.5 text-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/15 text-gold">{icon}</span>
              <span className="text-base font-bold text-ink">{value}</span>
              <span className="text-xs leading-tight text-ink/55">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Preferencias de búsqueda Chile */}
      <div className="flex flex-col gap-4 border-t border-gold/15 p-5">
        <p className="crm-label-sm text-ink/55">Preferencias de búsqueda</p>

        {/* Operación */}
        <FilterRow label="Operación">
          <div className="flex gap-1 rounded-lg border border-ink/10 bg-white/70 p-1">
            {(["alquiler", "venta"] as const).map((op) => (
              <button key={op} type="button" onClick={() => patch("operation", op)}
                className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition",
                  state.operation === op ? "bg-ink text-cream-50 shadow-sm" : "text-ink/65 hover:text-ink")}>
                {op === "alquiler" ? "Arriendo" : "Venta"}
              </button>
            ))}
          </div>
        </FilterRow>

        {/* Presupuesto */}
        <FilterRow label="Moneda">
          <div className="flex gap-1 rounded-lg border border-ink/10 bg-white/70 p-1">
            {(["CLP", "UF"] as const).map((cur) => (
              <button key={cur} type="button" onClick={() => patch("currencyPreference", cur)}
                className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
                  state.currencyPreference === cur ? "bg-ink text-cream-50 shadow-sm" : "text-ink/65 hover:text-ink")}>
                {cur}
              </button>
            ))}
          </div>
        </FilterRow>

        {state.currencyPreference === "CLP" ? (
          <FilterRow label="Presupuesto CLP">
            <div className="grid grid-cols-2 gap-2">
              <PriceField value={state.budgetMin} onChange={(v) => patch("budgetMin", v)} placeholder="Mín $" prefix="$" />
              <PriceField value={state.budgetMax} onChange={(v) => patch("budgetMax", v)} placeholder="Máx $" prefix="$" />
            </div>
          </FilterRow>
        ) : (
          <FilterRow label="Presupuesto UF">
            <div className="grid grid-cols-2 gap-2">
              <PriceField value={state.minPriceUf} onChange={(v) => patch("minPriceUf", v)} placeholder="Mín UF" prefix="UF" step={0.01} />
              <PriceField value={state.maxPriceUf} onChange={(v) => patch("maxPriceUf", v)} placeholder="Máx UF" prefix="UF" step={0.01} />
            </div>
          </FilterRow>
        )}

        {/* Ubicación en cascada */}
        <div className="rounded-xl border border-gold/15 bg-white/40 p-3">
          <p className="mb-3 text-xs font-medium text-ink/55">Ubicación preferida (Chile)</p>

          <div className="space-y-3">
            {/* Regiones */}
            <LocationMultiselect
              label="Regiones"
              placeholder="Selecciona regiones…"
              options={CHILE_REGIONS.map((r) => r.name)}
              selected={state.preferredRegions}
              onChange={(v) => {
                patch("preferredRegions", v);
                // Limpiar comunas y sectores si ya no corresponden
                const validCodes = CHILE_REGIONS.filter((r) => v.includes(r.name)).map((r) => r.code);
                const validCommunes = Object.entries(COMMUNES_BY_REGION)
                  .filter(([code]) => validCodes.includes(code))
                  .flatMap(([, communes]) => communes);
                const filteredCommunes = state.preferredCommunes.filter((c) => validCommunes.includes(c));
                patch("preferredCommunes", filteredCommunes);
                patch("preferredSectors", []);
              }}
            />

            {/* Comunas — filtradas por regiones seleccionadas */}
            {(() => {
              const selectedCodes = CHILE_REGIONS.filter((r) => state.preferredRegions.includes(r.name)).map((r) => r.code);
              const availableCommunes = selectedCodes.length > 0
                ? selectedCodes.flatMap((code) => COMMUNES_BY_REGION[code] || []).sort()
                : Object.values(COMMUNES_BY_REGION).flat().sort();
              return (
                <LocationMultiselect
                  label="Comunas"
                  placeholder={selectedCodes.length === 0 ? "Selecciona una región primero…" : "Selecciona comunas…"}
                  options={availableCommunes}
                  selected={state.preferredCommunes}
                  onChange={(v) => {
                    patch("preferredCommunes", v);
                    // Limpiar sectores que ya no correspondan
                    const validSectors = v.flatMap((c) => SECTORS_BY_COMMUNE[c] || []);
                    patch("preferredSectors", state.preferredSectors.filter((s) => validSectors.includes(s)));
                  }}
                />
              );
            })()}

            {/* Sectores — filtrados por comunas seleccionadas */}
            {(() => {
              const availableSectors = state.preferredCommunes.length > 0
                ? state.preferredCommunes.flatMap((c) => SECTORS_BY_COMMUNE[c] || []).sort()
                : [];
              return availableSectors.length > 0 ? (
                <LocationMultiselect
                  label="Sectores / Barrios"
                  placeholder="Selecciona sectores…"
                  options={availableSectors}
                  selected={state.preferredSectors}
                  onChange={(v) => patch("preferredSectors", v)}
                />
              ) : null;
            })()}
          </div>
        </div>

        {/* Especificaciones básicas */}
        <div className="grid grid-cols-3 gap-3">
          <NumberInputField
            label="Dorms. mín."
            value={state.minBedrooms}
            onChange={(v) => patch("minBedrooms", v)}
            icon={<BedDouble size={13} strokeWidth={1.75} />}
          />
          <NumberInputField
            label="Baños mín."
            value={state.minBathrooms}
            onChange={(v) => patch("minBathrooms", v)}
            icon={<Bath size={13} strokeWidth={1.75} />}
          />
          <NumberInputField
            label="m² mín."
            value={state.minSquareMeters}
            onChange={(v) => patch("minSquareMeters", v)}
            icon={<Home size={13} strokeWidth={1.75} />}
          />
        </div>

        {/* Especificaciones arquitectónicas */}
        <div className="rounded-xl border border-gold/15 bg-white/40 p-3">
          <p className="mb-3 text-xs font-medium text-ink/55">Características arquitectónicas</p>

          <div className="space-y-3">
            {/* Dormitorio de servicio */}
            <FilterRow label="Dorm. servicio">
              <ThreeToggle
                value={state.requiresServiceBedroom}
                onChange={(v) => patch("requiresServiceBedroom", v)}
              />
            </FilterRow>

            {/* Condominio */}
            <FilterRow label="Condominio">
              <ThreeToggle
                value={state.prefersCondominium}
                onChange={(v) => patch("prefersCondominium", v)}
              />
            </FilterRow>

            {/* Estacionamientos */}
            <FilterRow label="Estac. mín.">
              <NumberInputField
                label=""
                value={state.minParkingSpaces}
                onChange={(v) => patch("minParkingSpaces", v)}
                icon={<Car size={13} strokeWidth={1.75} />}
                compact
              />
            </FilterRow>

            {/* Pisos mínimos */}
            <FilterRow label="Pisos mín.">
              <NumberInputField
                label=""
                value={state.minFloors}
                onChange={(v) => patch("minFloors", v)}
                icon={<Trees size={13} strokeWidth={1.75} />}
                compact
              />
            </FilterRow>
          </div>
        </div>

        {/* Tipos arquitectónicos */}
        <div>
          <p className="mb-2 text-xs font-medium text-ink/55">Tipo de propiedad</p>
          <div className="flex flex-wrap gap-1.5">
            {ARCHITECTURAL_TYPES.map(({ value, label }) => {
              const active = state.preferredArchitecturalTypes.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    patch("preferredArchitecturalTypes",
                      active
                        ? state.preferredArchitecturalTypes.filter((t) => t !== value)
                        : [...state.preferredArchitecturalTypes, value]
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    active
                      ? "border-gold/40 bg-gold/15 text-gold-dark"
                      : "border-ink/10 bg-white/70 text-ink/65 hover:border-gold/20 hover:text-ink",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Orientación */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink/55">
            <Compass size={13} strokeWidth={1.75} className="text-gold" />
            Orientación preferida
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ORIENTATIONS.map(({ value, label }) => {
              const active = state.preferredOrientations.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    patch("preferredOrientations",
                      active
                        ? state.preferredOrientations.filter((o) => o !== value)
                        : [...state.preferredOrientations, value]
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    active
                      ? "border-gold/40 bg-gold/15 text-gold-dark"
                      : "border-ink/10 bg-white/70 text-ink/65 hover:border-gold/20 hover:text-ink",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Nota */}
        <p className="flex items-start gap-2 rounded-lg border border-gold/30 bg-cream-100/60 p-2.5 text-xs leading-snug text-ink/70">
          <Info size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-gold" />
          <span>Los filtros configurados determinan qué propiedades se sugieren a este cliente en su portal.</span>
        </p>
      </div>

      {/* Notas internas */}
      <div className="border-t border-gold/15 p-5 pt-4">
        <header className="flex items-center justify-between">
          <p className="crm-label-sm text-ink/55">Notas internas</p>
          <button type="button" aria-label="Editar notas" className="flex h-7 w-7 items-center justify-center rounded-md text-ink/45 transition hover:bg-white/60 hover:text-ink">
            <Pencil size={13} strokeWidth={1.75} />
          </button>
        </header>
        <div className="mt-3 rounded-xl border border-gold/15 bg-white/55 p-3">
          {client.internalNotes.length === 0 ? (
            <p className="text-xs text-ink/55">Sin notas aún.</p>
          ) : (
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink/75">
              {client.internalNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
          <p className={cn("mt-3 flex items-center gap-1.5 text-xs font-semibold",
            client.priority === "high" ? "text-amber-700" : "text-ink/55")}>
            <Star size={13} strokeWidth={1.75} className={cn(client.priority === "high" ? "fill-amber-500 text-amber-500" : "text-ink/40")} />
            {client.priority === "high" ? "Prioridad alta" : "Prioridad normal"}
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="border-t border-gold/15 p-5 pt-4">
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={handleReset} disabled={isPending}
            className="flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-white/80 px-4 py-2.5 text-sm font-medium text-ink transition hover:border-gold/55 hover:bg-white disabled:opacity-50">
            <RotateCcw size={14} strokeWidth={1.75} className="text-gold" />
            <span>Restablecer</span>
          </button>
          <button type="button" onClick={handleSave} disabled={isPending}
            className="flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50">
            <Save size={14} strokeWidth={1.75} className="text-gold" />
            <span>{isPending ? "Guardando…" : "Guardar filtros"}</span>
          </button>
        </div>
        {feedback === "saved" && (
          <p className="mt-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-700">
            <Check size={13} strokeWidth={2} /> Preferencias guardadas
          </p>
        )}
        {feedback === "error" && (
          <p className="mt-2.5 text-center text-xs font-medium text-red-600">
            Error al guardar{errorMsg ? ` · ${errorMsg}` : ""}
          </p>
        )}
      </div>
    </aside>
  );
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      {children}
    </div>
  );
}

function PriceField({
  value,
  onChange,
  placeholder,
  prefix,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder: string;
  prefix: string;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/70 px-2.5 py-2 text-xs focus-within:border-gold/55">
      <span className="shrink-0 text-ink/45">{prefix}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-transparent outline-none [appearance:textfield] placeholder:text-ink/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  );
}

function NumberInputField({
  label,
  value,
  onChange,
  icon,
  compact = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "flex flex-col gap-1"}>
      {label && <span className="text-xs font-medium text-ink/55">{label}</span>}
      <div className="flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/70 px-2.5 py-2 text-xs focus-within:border-gold/55">
        {icon && <span className="text-gold">{icon}</span>}
        <input
          type="number"
          min={0}
          value={value || ""}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="w-full bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    </div>
  );
}

function ThreeToggle({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  const options = [
    { v: true, label: "Sí" },
    { v: undefined, label: "—" },
    { v: false, label: "No" },
  ];
  return (
    <div className="flex gap-1 rounded-lg border border-ink/10 bg-white/70 p-1">
      {options.map(({ v, label }) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "flex-1 rounded-md py-1.5 text-xs font-medium transition",
            value === v ? "bg-ink text-cream-50 shadow-sm" : "text-ink/65 hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

