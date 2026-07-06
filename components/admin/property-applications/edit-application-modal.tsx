"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Home, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApplicationCountry, ApplicationOperation } from "@/lib/property-applications/types";

type PropertyResult = {
  id: string;
  title: string;
  address: string | null;
  bc_reference: string | null;
  price: number | null;
  operation: string | null;
};

type Props = {
  applicationId: string;
  country: ApplicationCountry;
  operation: ApplicationOperation;
  propertyId: string | null;
  propertyTitle: string | null;
  propertyReference: string | null;
  moveInDate: string | null;
  purchaseDate: string | null;
  hasDocuments: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

function Toggle({
  value,
  onChange,
  disabled,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <div className={cn("flex gap-1 rounded-lg border border-ink/10 bg-white/70 p-1", disabled && "opacity-50")}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition",
            value === opt.value ? "bg-ink text-cream-50 shadow-sm" : "text-ink/65 hover:text-ink",
            disabled && "cursor-not-allowed"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function EditApplicationModal({
  applicationId,
  country: initialCountry,
  operation: initialOperation,
  propertyId,
  propertyTitle,
  propertyReference,
  moveInDate,
  purchaseDate,
  hasDocuments,
  onClose,
  onUpdated,
}: Props) {
  const [country, setCountry] = useState<ApplicationCountry>(initialCountry);
  const [operation, setOperation] = useState<ApplicationOperation>(initialOperation);
  const [selectedProperty, setSelectedProperty] = useState<PropertyResult | null>(
    propertyId ? { id: propertyId, title: propertyTitle ?? "—", address: null, bc_reference: propertyReference, price: null, operation: null } : null
  );
  const [propertyQuery, setPropertyQuery] = useState("");
  const [propertyResults, setPropertyResults] = useState<PropertyResult[]>([]);
  const [propertyLoading, setPropertyLoading] = useState(false);
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);
  const [moveIn, setMoveIn] = useState(moveInDate ?? "");
  const [purchase, setPurchase] = useState(purchaseDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propertySearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cerrar con Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (propertySearchTimeout.current) clearTimeout(propertySearchTimeout.current);
    if (!propertyQuery.trim()) {
      setPropertyResults([]);
      return;
    }
    propertySearchTimeout.current = setTimeout(async () => {
      setPropertyLoading(true);
      try {
        const res = await fetch(`/api/admin/properties/search?q=${encodeURIComponent(propertyQuery)}`);
        const json = await res.json();
        setPropertyResults(json.data ?? []);
        setShowPropertyDropdown(true);
      } finally {
        setPropertyLoading(false);
      }
    }, 300);
  }, [propertyQuery]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/property-applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          country,
          operation,
          property_id: selectedProperty?.id ?? null,
          move_in_date: operation === "rent" ? (moveIn || null) : null,
          purchase_date: operation === "sale" ? (purchase || null) : null,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Error al guardar los cambios");
        return;
      }
      onUpdated();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-cream-50 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <h2 className="font-serif text-lg text-ink">Editar solicitud</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink/40 transition hover:bg-ink/5 hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {hasDocuments && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>
                Ya hay documentos subidos, así que el país y la operación no se pueden cambiar
                (los tipos de documento dependen de esa combinación). Solo puedes editar la
                propiedad y las fechas.
              </span>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-ink/60">País</label>
            <Toggle
              value={country}
              onChange={(v) => setCountry(v as ApplicationCountry)}
              disabled={hasDocuments}
              options={[
                { value: "ES", label: "🇪🇸 España" },
                { value: "CL", label: "🇨🇱 Chile" },
              ]}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-ink/60">Tipo de operación</label>
            <Toggle
              value={operation}
              onChange={(v) => setOperation(v as ApplicationOperation)}
              disabled={hasDocuments}
              options={[
                { value: "rent", label: "Alquiler" },
                { value: "sale", label: "Compra" },
              ]}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-ink/60">Propiedad</label>
            {selectedProperty ? (
              <div className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-4 py-2.5">
                <Home size={14} className="shrink-0 text-ink/40" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm text-ink">{selectedProperty.title}</p>
                    {selectedProperty.bc_reference && (
                      <span className="shrink-0 rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[10px] text-ink/60">
                        {selectedProperty.bc_reference}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedProperty(null)} className="ml-auto text-ink/30 hover:text-ink">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, cód. referencia o dirección..."
                  value={propertyQuery}
                  onChange={(e) => { setPropertyQuery(e.target.value); setShowPropertyDropdown(true); }}
                  onFocus={() => propertyResults.length > 0 && setShowPropertyDropdown(true)}
                  className="w-full rounded-xl border border-ink/15 bg-white/80 py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-1 focus:ring-gold"
                />
                {propertyLoading && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink/30" />
                )}
                {showPropertyDropdown && propertyResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-44 overflow-y-auto rounded-xl border border-ink/10 bg-white shadow-lg">
                    {propertyResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedProperty(p); setPropertyQuery(""); setShowPropertyDropdown(false); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-cream-50/80"
                      >
                        <Home size={13} className="shrink-0 text-ink/40" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm text-ink">{p.title}</p>
                            {p.bc_reference && (
                              <span className="shrink-0 rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[10px] text-ink/60">
                                {p.bc_reference}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {operation === "rent" ? (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-ink/60">Fecha de mudanza</label>
              <input
                type="date"
                value={moveIn}
                onChange={(e) => setMoveIn(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-ink/60">Fecha de compra</label>
              <input
                type="date"
                value={purchase}
                onChange={(e) => setPurchase(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded-xl border border-ink/15 px-4 py-2 text-sm text-ink/60 transition hover:text-ink"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-ink px-5 py-2 text-sm text-cream-50 transition hover:bg-ink/80 disabled:opacity-40"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Guardar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
