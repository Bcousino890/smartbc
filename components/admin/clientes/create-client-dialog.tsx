"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  PawPrint,
  Users,
  Star,
} from "lucide-react";
import { createNewClient } from "@/app/(admin)/admin/clientes/actions";
import { MADRID_ZONES, MADRID_ZONES_WITH_SUBZONES } from "@/lib/mock-properties";
import type { Operation, StayType, ClientProfileType } from "@/lib/types";
import { cn } from "@/lib/utils";

// ─── Local design primitives (match client-detail-panel.tsx) ─────────────────

function Toggle({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-ink/10 bg-white/70 p-1">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition",
              active ? "bg-ink text-cream-50 shadow-sm" : "text-ink/65 hover:text-ink",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-3">
      <span className="text-[11px] font-medium text-ink/60">{label}</span>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  icon,
  suffix,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  icon?: React.ReactNode;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white/70 px-3 py-1.5 text-[12px] text-ink focus-within:border-gold/55">
      {icon && <span className="text-gold">{icon}</span>}
      <input
        type="number"
        min={min}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="w-full bg-transparent py-0.5 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-60"
      />
      {suffix && <span className="shrink-0 text-ink/50">{suffix}</span>}
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileType: ClientProfileType;
  sector: string;
  operation: Operation;
  stayType: StayType;
  preferredZones: string[];
  selectedSubzones: Record<string, string[]>;
  budgetMin: number;
  budgetMax: number;
  universities: string;
  occupants: number;
  students: number;
  workers: number;
  pets: boolean;
  notes: string;
};

const initialState: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  profileType: "worker",
  sector: "Madrid",
  operation: "alquiler",
  stayType: "larga",
  preferredZones: [],
  selectedSubzones: {},
  budgetMin: 500,
  budgetMax: 2000,
  universities: "",
  occupants: 1,
  students: 0,
  workers: 0,
  pets: false,
  notes: "",
};

const inputCls =
  "w-full rounded-lg border border-ink/15 bg-white/70 px-3 py-2 text-sm placeholder:text-ink/35 focus:border-gold/55 focus:outline-none disabled:bg-ink/5 disabled:text-ink/35";

// ─── Dialog ──────────────────────────────────────────────────────────────────

export function CreateClientDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  const handleSubmit = () => {
    setError(null);
    setSuccess(null);

    if (!form.firstName.trim()) { setError("Nombre es requerido"); return; }
    if (!form.lastName.trim()) { setError("Apellido es requerido"); return; }
    if (!form.email.trim()) { setError("Email es requerido"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError("Email inválido"); return; }
    if (form.preferredZones.length === 0) { setError("Selecciona al menos una zona"); return; }
    if (form.budgetMin < 0 || form.budgetMax < 0) { setError("Presupuesto debe ser mayor a 0"); return; }

    startTransition(async () => {
      const result = await createNewClient({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        profileType: form.profileType,
        sector: form.sector,
        operation: form.operation,
        stayType: form.stayType,
        preferredZones: form.preferredZones,
        selectedSubzones: form.selectedSubzones,
        budgetMin: form.budgetMin,
        budgetMax: form.budgetMax,
        universities: form.universities || undefined,
        occupants: form.occupants,
        students: form.students,
        workers: form.workers,
        pets: form.pets,
        notes: form.notes || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess(`Cliente ${form.firstName} ${form.lastName} creado`);
      setForm(initialState);
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(null);
      }, 1500);
    });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
      >
        <Plus size={16} />
        Nuevo cliente
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 backdrop-blur-sm p-4 pt-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-gold/15 bg-cream-50/97 p-7 shadow-2xl">
        {/* Header */}
        <div className="mb-5">
          <h2 className="font-serif text-xl font-semibold text-ink">Nuevo cliente</h2>
          <p className="mt-1 text-xs text-ink/55">Crea un nuevo cliente con sus preferencias de búsqueda</p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            <p className="text-xs text-emerald-700">{success}</p>
          </div>
        )}

        <div className="space-y-5">
          {/* ── Datos personales ─────────────────────────────── */}
          <section>
            <SectionLabel>Datos personales</SectionLabel>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Nombre *</FieldLabel>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(e) => patch("firstName", e.target.value)}
                  className={inputCls}
                  disabled={isPending}
                  placeholder="Juan"
                />
              </div>
              <div>
                <FieldLabel>Apellido *</FieldLabel>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => patch("lastName", e.target.value)}
                  className={inputCls}
                  disabled={isPending}
                  placeholder="García"
                />
              </div>
            </div>
            <div className="mt-3">
              <FieldLabel>Email *</FieldLabel>
              <input
                type="email"
                value={form.email}
                onChange={(e) => patch("email", e.target.value)}
                className={inputCls}
                disabled={isPending}
                placeholder="juan@example.com"
              />
            </div>
            <div className="mt-3">
              <FieldLabel>Teléfono</FieldLabel>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => patch("phone", e.target.value)}
                className={inputCls}
                disabled={isPending}
                placeholder="+34 600 000 000"
              />
            </div>
          </section>

          {/* ── Perfil ───────────────────────────────────────── */}
          <section className="border-t border-gold/15 pt-4">
            <SectionLabel>Perfil</SectionLabel>
            <div className="mt-3 space-y-3">
              <FilterRow label="Tipo">
                <Toggle
                  value={form.profileType}
                  onChange={(v) => patch("profileType", v as ClientProfileType)}
                  options={[
                    { value: "student", label: "Estudiante" },
                    { value: "worker", label: "Trabajador" },
                    { value: "company", label: "Empresa" },
                  ]}
                  disabled={isPending}
                />
              </FilterRow>
              <FilterRow label="Sector">
                <select
                  value={form.sector}
                  onChange={(e) => patch("sector", e.target.value)}
                  disabled={isPending}
                  className="w-full appearance-none rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-[12px] text-ink focus:border-gold/55 focus:outline-none disabled:opacity-60"
                >
                  <option value="Madrid">Madrid</option>
                </select>
              </FilterRow>
            </div>
          </section>

          {/* ── Preferencias ─────────────────────────────────── */}
          <section className="border-t border-gold/15 pt-4">
            <SectionLabel>Preferencias de búsqueda</SectionLabel>
            <div className="mt-3 space-y-3">
              <FilterRow label="Operación">
                <Toggle
                  value={form.operation}
                  onChange={(v) => patch("operation", v as Operation)}
                  options={[
                    { value: "alquiler", label: "Alquiler" },
                    { value: "venta", label: "Venta" },
                  ]}
                  disabled={isPending}
                />
              </FilterRow>
              <FilterRow label="Estancia">
                <Toggle
                  value={form.stayType}
                  onChange={(v) => patch("stayType", v as StayType)}
                  options={[
                    { value: "corta", label: "Corta" },
                    { value: "larga", label: "Larga" },
                  ]}
                  disabled={isPending}
                />
              </FilterRow>
              <FilterRow label="Mascotas">
                <Toggle
                  value={form.pets ? "yes" : "no"}
                  onChange={(v) => patch("pets", v === "yes")}
                  options={[
                    { value: "yes", label: "Sí", icon: <PawPrint size={12} strokeWidth={1.75} /> },
                    { value: "no", label: "No" },
                  ]}
                  disabled={isPending}
                />
              </FilterRow>
              <FilterRow label="Presupuesto">
                <div className="grid grid-cols-2 gap-2">
                  <NumberInput
                    value={form.budgetMin}
                    onChange={(v) => patch("budgetMin", v)}
                    min={0}
                    suffix="€ mín"
                    disabled={isPending}
                  />
                  <NumberInput
                    value={form.budgetMax}
                    onChange={(v) => patch("budgetMax", v)}
                    min={0}
                    suffix="€ máx"
                    disabled={isPending}
                  />
                </div>
              </FilterRow>
              <FilterRow label="Ocupantes">
                <NumberInput
                  value={form.occupants}
                  onChange={(v) => patch("occupants", v)}
                  min={1}
                  icon={<Users size={13} strokeWidth={1.75} />}
                  suffix="personas"
                  disabled={isPending}
                />
              </FilterRow>
              <FilterRow label="Estudiantes">
                <NumberInput
                  value={form.students}
                  onChange={(v) => patch("students", v)}
                  min={0}
                  disabled={isPending}
                />
              </FilterRow>
              <FilterRow label="Trabajadores">
                <NumberInput
                  value={form.workers}
                  onChange={(v) => patch("workers", v)}
                  min={0}
                  disabled={isPending}
                />
              </FilterRow>
              <FilterRow label="Universidad">
                <input
                  type="text"
                  value={form.universities}
                  onChange={(e) => patch("universities", e.target.value)}
                  className="w-full rounded-lg border border-ink/10 bg-white/70 px-3 py-1.5 text-[12px] placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
                  disabled={isPending}
                  placeholder="Ej: UAM, IE, CUNEF"
                />
              </FilterRow>
            </div>
          </section>

          {/* ── Zonas ────────────────────────────────────────── */}
          <section className="border-t border-gold/15 pt-4">
            <SectionLabel>Zonas preferidas *</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              {MADRID_ZONES.map((zone) => {
                const active = form.preferredZones.includes(zone);
                return (
                  <button
                    key={zone}
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      if (active) {
                        const { [zone]: _, ...rest } = form.selectedSubzones;
                        setForm((s) => ({
                          ...s,
                          preferredZones: s.preferredZones.filter((z) => z !== zone),
                          selectedSubzones: rest,
                        }));
                      } else {
                        setForm((s) => ({
                          ...s,
                          preferredZones: [...s.preferredZones, zone],
                          selectedSubzones: { ...s.selectedSubzones, [zone]: [] },
                        }));
                      }
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[12px] font-medium transition",
                      active
                        ? "border-ink bg-ink text-cream-50"
                        : "border-ink/15 bg-white/70 text-ink/70 hover:border-ink/30 hover:text-ink",
                      isPending && "cursor-not-allowed opacity-60",
                    )}
                  >
                    {zone}
                  </button>
                );
              })}
            </div>

            {/* Subzonas */}
            {form.preferredZones.length > 0 && (
              <div className="mt-4 space-y-4 rounded-xl border border-gold/15 bg-white/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/50">Subzonas (opcional)</p>
                {form.preferredZones.map((zone) => {
                  const subs = MADRID_ZONES_WITH_SUBZONES[zone] ?? [];
                  if (!subs.length) return null;
                  return (
                    <div key={zone}>
                      <p className="mb-2 text-[12px] font-semibold text-ink/80">{zone}</p>
                      <div className="flex flex-wrap gap-2">
                        {subs.map((sub) => {
                          const subActive = (form.selectedSubzones[zone] ?? []).includes(sub);
                          return (
                            <button
                              key={sub}
                              type="button"
                              disabled={isPending}
                              onClick={() => {
                                const current = form.selectedSubzones[zone] ?? [];
                                patch("selectedSubzones", {
                                  ...form.selectedSubzones,
                                  [zone]: subActive
                                    ? current.filter((s) => s !== sub)
                                    : [...current, sub],
                                });
                              }}
                              className={cn(
                                "rounded-full border px-2.5 py-0.5 text-[11px] transition",
                                subActive
                                  ? "border-gold/50 bg-gold/15 text-ink"
                                  : "border-ink/10 bg-white text-ink/60 hover:border-ink/20 hover:text-ink/80",
                                isPending && "cursor-not-allowed opacity-60",
                              )}
                            >
                              {sub}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Notas internas ───────────────────────────────── */}
          <section className="border-t border-gold/15 pt-4">
            <header className="flex items-center gap-1.5">
              <Star size={13} strokeWidth={1.75} className="text-gold" />
              <SectionLabel>Notas internas</SectionLabel>
            </header>
            <textarea
              value={form.notes}
              onChange={(e) => patch("notes", e.target.value)}
              disabled={isPending}
              rows={3}
              placeholder="Observaciones del equipo sobre este cliente…"
              className="mt-3 w-full rounded-xl border border-ink/10 bg-white/70 px-3 py-2.5 text-sm placeholder:text-ink/35 focus:border-gold/55 focus:outline-none disabled:opacity-60 resize-none"
            />
          </section>
        </div>

        {/* ── Botones ──────────────────────────────────────── */}
        <div className="mt-6 flex justify-end gap-3 border-t border-gold/15 pt-5">
          <button
            onClick={() => {
              setIsOpen(false);
              setForm(initialState);
              setError(null);
              setSuccess(null);
            }}
            disabled={isPending}
            className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
          >
            {isPending && <Loader2 size={15} className="animate-spin" />}
            Crear cliente
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
      {children}
    </p>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-medium text-ink/65">
      {children}
    </label>
  );
}
