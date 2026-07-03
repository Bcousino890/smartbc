"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";
import { createNewClient } from "@/app/(admin)/admin/clientes/actions";
import type { Operation, ClientProfileType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LocationMultiselect, CHILE_REGIONS, COMMUNES_BY_REGION, SECTORS_BY_COMMUNE } from "./location-multiselect";
import { MapPolygonSelector } from "./map-polygon-selector";

interface PolygonData {
  id: string;
  name: string;
  coordinates: number[][][];
  description?: string;
}

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileType: ClientProfileType;
  operation: Operation;
  preferredRegions: string[];
  preferredCommunes: string[];
  preferredSectors: string[];
  budgetMin: number;
  budgetMax: number;
  currencyPreference: "CLP" | "UF";
  minBedrooms: number;
  minBathrooms: number;
  minSquareMeters: number;
  requiresServiceBedroom: boolean | undefined;
  minParkingSpaces: number;
  prefersCondominium: boolean | undefined;
  preferredArchitecturalTypes: string[];
  preferredOrientations: string[];
  minFloors: number;
  notes: string;
  interestPolygons: PolygonData[];
};

export function CreateClientDialogCL() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<"idle" | "success" | "error" | "validating">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    profileType: "worker",
    operation: "alquiler",
    preferredRegions: [],
    preferredCommunes: [],
    preferredSectors: [],
    budgetMin: 0,
    budgetMax: 0,
    currencyPreference: "CLP",
    minBedrooms: 0,
    minBathrooms: 0,
    minSquareMeters: 0,
    requiresServiceBedroom: undefined,
    minParkingSpaces: 0,
    prefersCondominium: undefined,
    preferredArchitecturalTypes: [],
    preferredOrientations: [],
    minFloors: 0,
    notes: "",
    interestPolygons: [],
  });

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  const handleCreate = () => {
    setFeedback("validating");
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setFeedback("error");
      setErrorMsg("Nombre, apellido y email son requeridos");
      return;
    }

    setFeedback("idle");
    setErrorMsg(null);
    startTransition(async () => {
      const result = await createNewClient({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        profileType: form.profileType,
        operation: form.operation,
        stayType: "larga",
        sector: "Chile",
        preferredZones: form.preferredRegions,
        selectedSubzones: {
          Chile: [...form.preferredCommunes, ...form.preferredSectors],
        },
        budgetMin: form.budgetMin,
        budgetMax: form.budgetMax,
        minBedrooms: form.minBedrooms,
        minBathrooms: form.minBathrooms,
        minSquareMeters: form.minSquareMeters,
        requiresServiceBedroom: form.requiresServiceBedroom,
        minParkingSpaces: form.minParkingSpaces,
        prefersCondominium: form.prefersCondominium,
        preferredArchitecturalTypes: form.preferredArchitecturalTypes,
        preferredOrientations: form.preferredOrientations,
        minFloors: form.minFloors,
        occupants: 0,
        students: 0,
        workers: 0,
        pets: false,
        notes: form.notes,
        interestPolygons: form.interestPolygons,
      });

      if (result.ok) {
        setFeedback("success");
        setTimeout(() => {
          setOpen(false);
          setForm({
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            profileType: "worker",
            operation: "alquiler",
            preferredRegions: [],
            preferredCommunes: [],
            preferredSectors: [],
            budgetMin: 0,
            budgetMax: 0,
            currencyPreference: "CLP",
            minBedrooms: 0,
            minBathrooms: 0,
            minSquareMeters: 0,
            requiresServiceBedroom: undefined,
            minParkingSpaces: 0,
            prefersCondominium: undefined,
            preferredArchitecturalTypes: [],
            preferredOrientations: [],
            minFloors: 0,
            notes: "",
            interestPolygons: [],
          });
          setFeedback("idle");
        }, 2000);
      } else {
        setFeedback("error");
        setErrorMsg(result.error);
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink-soft"
      >
        <Plus size={16} strokeWidth={2} />
        <span>Nuevo cliente</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-cream-50/95 shadow-2xl backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gold/15 px-6 py-4">
              <h2 className="font-serif text-xl font-semibold text-ink">Nuevo cliente Chile</h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/45 transition hover:bg-white/60 hover:text-ink"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-5 p-6">
              {/* Datos personales */}
              <section>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/55">
                  Datos personales
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Nombre"
                      value={form.firstName}
                      onChange={(e) => patch("firstName", e.target.value)}
                      className="rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-sm focus:border-gold/55 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Apellido"
                      value={form.lastName}
                      onChange={(e) => patch("lastName", e.target.value)}
                      className="rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-sm focus:border-gold/55 focus:outline-none"
                    />
                  </div>
                  <input
                    type="email"
                    placeholder="Email"
                    value={form.email}
                    onChange={(e) => patch("email", e.target.value)}
                    className="w-full rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-sm focus:border-gold/55 focus:outline-none"
                  />
                  <input
                    type="tel"
                    placeholder="+56 9 XXXX XXXX"
                    value={form.phone}
                    onChange={(e) => patch("phone", e.target.value)}
                    className="w-full rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-sm focus:border-gold/55 focus:outline-none"
                  />
                </div>
              </section>

              {/* Perfil */}
              <section>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/55">
                  Perfil
                </p>
                <div className="flex gap-1 rounded-lg border border-ink/10 bg-white/70 p-1">
                  {(["student", "worker", "company"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => patch("profileType", type)}
                      className={cn(
                        "flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium capitalize transition",
                        form.profileType === type
                          ? "bg-ink text-cream-50 shadow-sm"
                          : "text-ink/65 hover:text-ink",
                      )}
                    >
                      {type === "student" ? "Estudiante" : type === "worker" ? "Trabajador" : "Empresa"}
                    </button>
                  ))}
                </div>
              </section>

              {/* Preferencias búsqueda */}
              <section>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/55">
                  Preferencias de búsqueda
                </p>
                <div className="space-y-3">
                  {/* Operación */}
                  <div className="grid grid-cols-[90px_1fr] items-center gap-3">
                    <span className="text-[11px] font-medium text-ink/60">Operación</span>
                    <div className="flex gap-1 rounded-lg border border-ink/10 bg-white/70 p-1">
                      {(["alquiler", "venta"] as const).map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => patch("operation", op)}
                          className={cn(
                            "flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium capitalize transition",
                            form.operation === op
                              ? "bg-ink text-cream-50 shadow-sm"
                              : "text-ink/65 hover:text-ink",
                          )}
                        >
                          {op === "alquiler" ? "Arriendo" : "Venta"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Moneda */}
                  <div className="grid grid-cols-[90px_1fr] items-center gap-3">
                    <span className="text-[11px] font-medium text-ink/60">Moneda</span>
                    <div className="flex gap-1 rounded-lg border border-ink/10 bg-white/70 p-1">
                      {(["CLP", "UF"] as const).map((cur) => (
                        <button
                          key={cur}
                          type="button"
                          onClick={() => patch("currencyPreference", cur)}
                          className={cn(
                            "flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition",
                            form.currencyPreference === cur
                              ? "bg-ink text-cream-50 shadow-sm"
                              : "text-ink/65 hover:text-ink",
                          )}
                        >
                          {cur}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Presupuesto */}
                  <div className="grid grid-cols-[90px_1fr] items-center gap-3">
                    <span className="text-[11px] font-medium text-ink/60">Presupuesto</span>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder={form.currencyPreference === "CLP" ? "Mín $" : "Mín UF"}
                        value={form.budgetMin || ""}
                        onChange={(e) => patch("budgetMin", parseInt(e.target.value) || 0)}
                        className="rounded-lg border border-ink/10 bg-white/70 px-2.5 py-2 text-[12px] focus:border-gold/55 focus:outline-none"
                      />
                      <input
                        type="number"
                        placeholder={form.currencyPreference === "CLP" ? "Máx $" : "Máx UF"}
                        value={form.budgetMax || ""}
                        onChange={(e) => patch("budgetMax", parseInt(e.target.value) || 0)}
                        className="rounded-lg border border-ink/10 bg-white/70 px-2.5 py-2 text-[12px] focus:border-gold/55 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Ubicación en cascada */}
                  <div className="rounded-xl border border-gold/15 bg-white/40 p-3 space-y-3">
                    <p className="text-[11px] font-medium text-ink/55">Ubicación (Chile)</p>

                    <LocationMultiselect
                      label="Regiones"
                      placeholder="Selecciona regiones…"
                      options={CHILE_REGIONS.map((r) => r.name)}
                      selected={form.preferredRegions}
                      onChange={(v) => {
                        patch("preferredRegions", v);
                        const validCodes = CHILE_REGIONS.filter((r) => v.includes(r.name)).map((r) => r.code);
                        const validCommunes = Object.entries(COMMUNES_BY_REGION)
                          .filter(([code]) => validCodes.includes(code))
                          .flatMap(([, communes]) => communes);
                        const filtered = form.preferredCommunes.filter((c) => validCommunes.includes(c));
                        patch("preferredCommunes", filtered);
                        patch("preferredSectors", []);
                      }}
                    />

                    {(() => {
                      const selectedCodes = CHILE_REGIONS.filter((r) => form.preferredRegions.includes(r.name)).map((r) => r.code);
                      const availableCommunes = selectedCodes.length > 0
                        ? selectedCodes.flatMap((code) => COMMUNES_BY_REGION[code] || []).sort()
                        : Object.values(COMMUNES_BY_REGION).flat().sort();
                      return (
                        <LocationMultiselect
                          label="Comunas"
                          placeholder={selectedCodes.length === 0 ? "Selecciona una región primero…" : "Selecciona comunas…"}
                          options={availableCommunes}
                          selected={form.preferredCommunes}
                          onChange={(v) => {
                            patch("preferredCommunes", v);
                            const validSectors = v.flatMap((c) => SECTORS_BY_COMMUNE[c] || []);
                            patch("preferredSectors", form.preferredSectors.filter((s) => validSectors.includes(s)));
                          }}
                        />
                      );
                    })()}

                    {(() => {
                      const availableSectors = form.preferredCommunes.length > 0
                        ? form.preferredCommunes.flatMap((c) => SECTORS_BY_COMMUNE[c] || []).sort()
                        : [];
                      return availableSectors.length > 0 ? (
                        <LocationMultiselect
                          label="Sectores"
                          placeholder="Selecciona sectores…"
                          options={availableSectors}
                          selected={form.preferredSectors}
                          onChange={(v) => patch("preferredSectors", v)}
                        />
                      ) : null;
                    })()}
                  </div>

                  {/* Especificaciones básicas */}
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="Dorms mín"
                      value={form.minBedrooms || ""}
                      onChange={(e) => patch("minBedrooms", parseInt(e.target.value) || 0)}
                      className="rounded-lg border border-ink/10 bg-white/70 px-2.5 py-2 text-[12px] focus:border-gold/55 focus:outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="Baños mín"
                      value={form.minBathrooms || ""}
                      onChange={(e) => patch("minBathrooms", parseInt(e.target.value) || 0)}
                      className="rounded-lg border border-ink/10 bg-white/70 px-2.5 py-2 text-[12px] focus:border-gold/55 focus:outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="m² mín"
                      value={form.minSquareMeters || ""}
                      onChange={(e) => patch("minSquareMeters", parseInt(e.target.value) || 0)}
                      className="rounded-lg border border-ink/10 bg-white/70 px-2.5 py-2 text-[12px] focus:border-gold/55 focus:outline-none"
                    />
                  </div>
                </div>
              </section>

              {/* Características arquitectónicas */}
              <section>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/55">
                  Características arquitectónicas
                </p>
                <div className="space-y-3">
                  {/* Dorm servicio y Condominio */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1.5 text-[10px] font-medium text-ink/60">Dorm. servicio</p>
                      <div className="flex gap-1 rounded-lg border border-ink/10 bg-white/70 p-1">
                        {([undefined, true, false] as const).map((val) => (
                          <button
                            key={String(val)}
                            type="button"
                            onClick={() => patch("requiresServiceBedroom", val)}
                            className={cn(
                              "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition",
                              form.requiresServiceBedroom === val
                                ? "bg-ink text-cream-50 shadow-sm"
                                : "text-ink/65 hover:text-ink",
                            )}
                          >
                            {val === undefined ? "—" : val ? "Sí" : "No"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[10px] font-medium text-ink/60">Condominio</p>
                      <div className="flex gap-1 rounded-lg border border-ink/10 bg-white/70 p-1">
                        {([undefined, true, false] as const).map((val) => (
                          <button
                            key={String(val)}
                            type="button"
                            onClick={() => patch("prefersCondominium", val)}
                            className={cn(
                              "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition",
                              form.prefersCondominium === val
                                ? "bg-ink text-cream-50 shadow-sm"
                                : "text-ink/65 hover:text-ink",
                            )}
                          >
                            {val === undefined ? "—" : val ? "Sí" : "No"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Estacionamientos y pisos */}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="Estac. mín"
                      value={form.minParkingSpaces || ""}
                      onChange={(e) => patch("minParkingSpaces", parseInt(e.target.value) || 0)}
                      className="rounded-lg border border-ink/10 bg-white/70 px-2.5 py-2 text-[12px] focus:border-gold/55 focus:outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="Pisos mín"
                      value={form.minFloors || ""}
                      onChange={(e) => patch("minFloors", parseInt(e.target.value) || 0)}
                      className="rounded-lg border border-ink/10 bg-white/70 px-2.5 py-2 text-[12px] focus:border-gold/55 focus:outline-none"
                    />
                  </div>

                  {/* Tipo de propiedad */}
                  <div>
                    <p className="mb-1.5 text-[10px] font-medium text-ink/60">Tipo de propiedad</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(["Mediterránea", "Chilena", "Inglesa", "Moderna", "Neoclásica", "Colonial", "Contemporánea"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            const updated = form.preferredArchitecturalTypes.includes(type)
                              ? form.preferredArchitecturalTypes.filter((t) => t !== type)
                              : [...form.preferredArchitecturalTypes, type];
                            patch("preferredArchitecturalTypes", updated);
                          }}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                            form.preferredArchitecturalTypes.includes(type)
                              ? "bg-ink text-cream-50 shadow-sm"
                              : "border border-ink/20 text-ink/70 hover:border-ink/40 hover:text-ink",
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Orientación */}
                  <div>
                    <p className="mb-1.5 text-[10px] font-medium text-ink/60">Orientación preferida</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(["Norte", "Sur", "Oriente", "Poniente", "Nor-Oriente", "Nor-Poniente", "Sur-Oriente", "Sur-Poniente"] as const).map((ori) => (
                        <button
                          key={ori}
                          type="button"
                          onClick={() => {
                            const updated = form.preferredOrientations.includes(ori)
                              ? form.preferredOrientations.filter((o) => o !== ori)
                              : [...form.preferredOrientations, ori];
                            patch("preferredOrientations", updated);
                          }}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                            form.preferredOrientations.includes(ori)
                              ? "bg-ink text-cream-50 shadow-sm"
                              : "border border-ink/20 text-ink/70 hover:border-ink/40 hover:text-ink",
                          )}
                        >
                          {ori}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notas */}
                  <textarea
                    placeholder="Notas internas (observaciones especiales)…"
                    value={form.notes}
                    onChange={(e) => patch("notes", e.target.value)}
                    className="w-full rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-[12px] focus:border-gold/55 focus:outline-none resize-none"
                    rows={2}
                  />

                  {/* Selector de polígonos */}
                  <MapPolygonSelector
                    selectedPolygons={form.interestPolygons}
                    onChange={(polygons) => patch("interestPolygons", polygons)}
                  />
                </div>
              </section>

              {/* Errores y estado */}
              {feedback === "error" && errorMsg && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
                  <AlertCircle size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-red-600" />
                  <p className="text-[13px] text-red-700">{errorMsg}</p>
                </div>
              )}

              {feedback === "success" && (
                <div className="flex items-center gap-2 justify-center rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <CheckCircle2 size={16} strokeWidth={2} className="text-emerald-600" />
                  <p className="text-[13px] font-medium text-emerald-700">Cliente creado exitosamente</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gold/15 px-6 py-4">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="rounded-lg border border-gold/30 bg-white/80 px-4 py-2 text-[13px] font-medium text-ink transition hover:border-gold/55 hover:bg-white disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending || feedback === "success"}
                className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
              >
                {isPending && <Loader2 size={14} className="animate-spin" />}
                <span>{isPending ? "Creando..." : "Crear cliente"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
