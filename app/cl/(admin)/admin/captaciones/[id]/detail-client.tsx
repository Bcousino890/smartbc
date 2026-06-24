"use client";

import {
  ArrowLeft, Phone, MapPin, Check, Image, Clock,
  MessageSquare, Navigation, ExternalLink, Loader2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Captacion } from "../actions";

type Photo = { id: string; url: string; position: number };
type Log = {
  id: string;
  created_at: string;
  attempt_type: "call" | "visit" | "message" | "whatsapp";
  result: string;
  notes: string | null;
  owner_phone: string | null;
  owner_name: string | null;
  profiles?: { full_name: string | null };
};

type DetailClientProps = {
  captacion: Captacion;
  userRole: string;
  photos: Photo[];
  logs: Log[];
};

const ATTEMPT_TYPE_LABELS: Record<string, string> = {
  call: "Llamada",
  visit: "Visita",
  message: "Mensaje",
  whatsapp: "WhatsApp",
};
const RESULT_LABELS: Record<string, string> = {
  answered: "Respondió",
  no_answer: "No respondió",
  interested: "Interesado",
  not_interested: "No interesado",
  call_back: "Llamar después",
  wrong_number: "Número incorrecto",
  busy: "Ocupado",
};

function formatPrice(price: number | null, currency: string): string | null {
  if (!price) return null;
  if (currency === "uf") return `UF ${price.toLocaleString("es-CL")}`;
  return `$${(price / 1_000_000).toFixed(1)}M`;
}

export function CaptacionDetailClient({
  captacion,
  userRole,
  photos,
  logs,
}: DetailClientProps) {
  const isCaptadora = userRole === "captadora";
  const [tab, setTab] = useState<"info" | "photos" | "logs">("info");
  const [updatingData, setUpdatingData] = useState(false);
  const [loggingAttempt, setLoggingAttempt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    owner_phone: captacion.owner_phone || "",
    owner_name: captacion.owner_name || "",
    owner_contact: captacion.owner_contact || "",
    address_real: captacion.address_real || "",
    owner_confirmed: captacion.owner_confirmed || false,
    notes: captacion.notes || "",
  });
  const [logForm, setLogForm] = useState({
    attempt_type: "call" as "call" | "visit" | "message" | "whatsapp",
    result: "answered" as string,
    notes: "",
    phone: "",
    name: "",
  });
  const [error, setError] = useState("");
  const [currentPhoto, setCurrentPhoto] = useState(0);

  async function handleUpdate() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacion.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al actualizar");
        return;
      }
      setUpdatingData(false);
      window.location.reload();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogAttempt() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacion.id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attempt_type: logForm.attempt_type,
          result: logForm.result,
          notes: logForm.notes,
          owner_phone: logForm.phone || undefined,
          owner_name: logForm.name || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al registrar intento");
        return;
      }
      setLogForm({ attempt_type: "call", result: "answered", notes: "", phone: "", name: "" });
      setLoggingAttempt(false);
      window.location.reload();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  const allPhotos = photos.length > 0 ? photos : (captacion.cover_photo_url ? [{ id: "0", url: captacion.cover_photo_url, position: 0 }] : []);

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
      <Link
        href="/cl/admin/captaciones"
        className="flex items-center gap-2 text-sm font-medium text-gold hover:text-gold-dark mb-6"
      >
        <ArrowLeft size={16} />
        Volver a captaciones
      </Link>

      {/* Encabezado con foto */}
      <div className="rounded-2xl border border-gold/15 bg-white/70 overflow-hidden mb-6">
        {allPhotos.length > 0 && (
          <div className="relative h-56 bg-ink/5">
            <img
              src={allPhotos[currentPhoto]?.url}
              alt={captacion.title || ""}
              className="h-full w-full object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            {allPhotos.length > 1 && (
              <div className="absolute bottom-3 right-3 flex gap-1">
                {allPhotos.slice(0, 8).map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setCurrentPhoto(i)}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === currentPhoto ? "w-4 bg-white" : "w-1.5 bg-white/50"
                    )}
                  />
                ))}
              </div>
            )}
            {allPhotos.length > 1 && (
              <button
                onClick={() => setCurrentPhoto((prev) => (prev + 1) % allPhotos.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
              >
                →
              </button>
            )}
            <a
              href={captacion.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-white hover:bg-black/70"
            >
              <ExternalLink size={11} />
              Ver original
            </a>
          </div>
        )}

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-ink leading-snug">{captacion.title || "Sin título"}</h1>
              {!captacion.cover_photo_url && (
                <a
                  href={captacion.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs text-gold hover:underline"
                >
                  <ExternalLink size={11} />
                  {captacion.source_url.slice(0, 60)}...
                </a>
              )}
            </div>
            <span className={cn(
              "flex-shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
              captacion.status === "pending" && "bg-amber-100 text-amber-700",
              captacion.status === "completed" && "bg-emerald-100 text-emerald-700",
              captacion.status === "converted_to_property" && "bg-blue-100 text-blue-700",
              captacion.status === "rejected" && "bg-red-100 text-red-700",
            )}>
              {captacion.status === "pending" && "Pendiente"}
              {captacion.status === "completed" && "Completada"}
              {captacion.status === "converted_to_property" && "Convertida"}
              {captacion.status === "rejected" && "Rechazada"}
            </span>
          </div>

          {/* Stats grid */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {captacion.price && (
              <div className="rounded-lg bg-ink/4 px-3 py-2">
                <p className="text-[10px] text-ink/50 uppercase tracking-wide">Precio</p>
                <p className="mt-0.5 text-base font-bold text-ink">
                  {formatPrice(captacion.price, captacion.currency || "clp")}
                </p>
              </div>
            )}
            {captacion.bedrooms && (
              <div className="rounded-lg bg-ink/4 px-3 py-2">
                <p className="text-[10px] text-ink/50 uppercase tracking-wide">Dormitorios</p>
                <p className="mt-0.5 text-base font-bold text-ink">{captacion.bedrooms}</p>
              </div>
            )}
            {captacion.bathrooms && (
              <div className="rounded-lg bg-ink/4 px-3 py-2">
                <p className="text-[10px] text-ink/50 uppercase tracking-wide">Baños</p>
                <p className="mt-0.5 text-base font-bold text-ink">{captacion.bathrooms}</p>
              </div>
            )}
            {captacion.square_meters && (
              <div className="rounded-lg bg-ink/4 px-3 py-2">
                <p className="text-[10px] text-ink/50 uppercase tracking-wide">Superficie</p>
                <p className="mt-0.5 text-base font-bold text-ink">{captacion.square_meters} m²</p>
              </div>
            )}
          </div>

          {/* Location */}
          {(captacion.commune || captacion.region) && (
            <div className="mt-3 flex items-center gap-1.5 text-sm text-ink/60">
              <MapPin size={14} />
              <span>{[captacion.commune, captacion.region].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {captacion.address_scraped && (
            <p className="mt-1 text-xs text-ink/45">{captacion.address_scraped}</p>
          )}

          {/* GPS link */}
          {captacion.latitude && captacion.longitude && (
            <a
              href={`https://maps.google.com/?q=${captacion.latitude},${captacion.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-gold hover:underline"
            >
              <Navigation size={12} />
              Ver en Google Maps ({captacion.latitude.toFixed(4)}, {captacion.longitude.toFixed(4)})
            </a>
          )}

          {captacion.owner_confirmed && (
            <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <Check size={15} />
              Dueño confirmó que quiere vender
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-ink/10">
        {(["info", "photos", "logs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition",
              tab === t
                ? "border-b-2 border-gold text-gold"
                : "text-ink/50 hover:text-ink/80"
            )}
          >
            {t === "info" && "Datos del Dueño"}
            {t === "photos" && `Fotos (${allPhotos.length})`}
            {t === "logs" && `Intentos (${logs.length})`}
          </button>
        ))}
      </div>

      {/* TAB: Info */}
      {tab === "info" && (
        <div className="rounded-2xl border border-gold/15 bg-white/70 p-6">
          {!updatingData ? (
            <div className="space-y-4">
              <InfoRow label="Teléfono">
                {captacion.owner_phone ? (
                  <a href={`tel:${captacion.owner_phone}`} className="text-gold hover:underline">
                    {captacion.owner_phone}
                  </a>
                ) : (
                  <span className="text-ink/35">No registrado</span>
                )}
              </InfoRow>
              <InfoRow label="Nombre">{captacion.owner_name || <span className="text-ink/35">No registrado</span>}</InfoRow>
              <InfoRow label="Contacto (Email/Otro)">{captacion.owner_contact || <span className="text-ink/35">No registrado</span>}</InfoRow>
              <InfoRow label="Dirección Real">{captacion.address_real || <span className="text-ink/35">No registrada</span>}</InfoRow>
              {captacion.notes && (
                <InfoRow label="Notas"><span className="whitespace-pre-wrap">{captacion.notes}</span></InfoRow>
              )}

              {isCaptadora && (
                <button
                  onClick={() => setUpdatingData(true)}
                  className="mt-2 rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
                >
                  Actualizar Datos
                </button>
              )}
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
              <Input label="Teléfono" type="tel" value={formData.owner_phone}
                onChange={(v) => setFormData({ ...formData, owner_phone: v })}
                placeholder="+56 9 1234 5678" />
              <Input label="Nombre del Dueño" value={formData.owner_name}
                onChange={(v) => setFormData({ ...formData, owner_name: v })}
                placeholder="Juan Pérez" />
              <Input label="Contacto (Email/Otro)" value={formData.owner_contact}
                onChange={(v) => setFormData({ ...formData, owner_contact: v })}
                placeholder="juan@example.com" />
              <Input label="Dirección Real" value={formData.address_real}
                onChange={(v) => setFormData({ ...formData, address_real: v })}
                placeholder="Av. Providencia 1234" />
              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.owner_confirmed}
                  onChange={(e) => setFormData({ ...formData, owner_confirmed: e.target.checked })}
                  className="rounded border border-ink/20"
                />
                <span className="text-sm font-medium text-ink">Dueño confirmó que sí quiere vender</span>
              </label>

              {error && <ErrorBox>{error}</ErrorBox>}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Guardar
                </button>
                <button type="button" onClick={() => setUpdatingData(false)}
                  className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5">
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB: Photos */}
      {tab === "photos" && (
        <div className="rounded-2xl border border-gold/15 bg-white/70 p-6">
          {allPhotos.length === 0 ? (
            <div className="py-12 text-center">
              <Image size={32} className="mx-auto mb-3 text-ink/25" />
              <p className="text-sm text-ink/50">Sin fotos guardadas</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {allPhotos.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => { setTab("info"); setCurrentPhoto(i); }}
                  className="aspect-video overflow-hidden rounded-lg border border-ink/10 hover:border-gold/30"
                >
                  <img
                    src={p.url}
                    alt={`Foto ${i + 1}`}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: Logs */}
      {tab === "logs" && (
        <div className="rounded-2xl border border-gold/15 bg-white/70 p-6">
          {isCaptadora && !loggingAttempt && (
            <button
              onClick={() => setLoggingAttempt(true)}
              className="mb-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              + Registrar Intento
            </button>
          )}

          {loggingAttempt && (
            <form className="mb-6 space-y-4 rounded-xl border border-ink/10 bg-ink/3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">Tipo</label>
                  <select
                    value={logForm.attempt_type}
                    onChange={(e) => setLogForm({ ...logForm, attempt_type: e.target.value as any })}
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm"
                  >
                    <option value="call">Llamada</option>
                    <option value="visit">Visita</option>
                    <option value="message">Mensaje</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">Resultado</label>
                  <select
                    value={logForm.result}
                    onChange={(e) => setLogForm({ ...logForm, result: e.target.value })}
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm"
                  >
                    <option value="answered">Respondió</option>
                    <option value="no_answer">No respondió</option>
                    <option value="interested">Interesado</option>
                    <option value="not_interested">No interesado</option>
                    <option value="call_back">Llamar después</option>
                    <option value="wrong_number">Número incorrecto</option>
                    <option value="busy">Ocupado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Teléfono obtenido" type="tel" value={logForm.phone}
                  onChange={(v) => setLogForm({ ...logForm, phone: v })}
                  placeholder="+56 9..." />
                <Input label="Nombre obtenido" value={logForm.name}
                  onChange={(v) => setLogForm({ ...logForm, name: v })}
                  placeholder="Nombre" />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Notas del intento</label>
                <textarea
                  value={logForm.notes}
                  onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Detalles de la conversación..."
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm"
                />
              </div>

              {error && <ErrorBox>{error}</ErrorBox>}

              <div className="flex gap-2">
                <button type="button" onClick={handleLogAttempt} disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Guardar Intento
                </button>
                <button type="button" onClick={() => setLoggingAttempt(false)}
                  className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5">
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {logs.length === 0 ? (
            <div className="py-10 text-center">
              <MessageSquare size={28} className="mx-auto mb-3 text-ink/25" />
              <p className="text-sm text-ink/50">Sin intentos registrados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-xl border border-ink/8 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded-full bg-ink/8 px-2.5 py-0.5 text-xs font-medium text-ink">
                        {ATTEMPT_TYPE_LABELS[log.attempt_type] || log.attempt_type}
                      </span>
                      <span className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        log.result === "interested" && "bg-emerald-100 text-emerald-700",
                        log.result === "answered" && "bg-blue-100 text-blue-700",
                        log.result === "not_interested" && "bg-red-100 text-red-700",
                        !["interested", "answered", "not_interested"].includes(log.result) &&
                          "bg-amber-100 text-amber-700",
                      )}>
                        {RESULT_LABELS[log.result] || log.result}
                      </span>
                      {log.owner_phone && (
                        <span className="flex items-center gap-1 text-xs text-ink/55">
                          <Phone size={10} />
                          {log.owner_phone}
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-[11px] text-ink/40 flex-shrink-0">
                      <Clock size={10} />
                      {new Date(log.created_at).toLocaleDateString("es-CL", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {log.notes && (
                    <p className="mt-2 text-sm text-ink/65 whitespace-pre-wrap">{log.notes}</p>
                  )}
                  {log.profiles?.full_name && (
                    <p className="mt-1.5 text-[11px] text-ink/40">{log.profiles.full_name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-ink/50 uppercase tracking-wide">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{children}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink/70 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
      />
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </div>
  );
}
