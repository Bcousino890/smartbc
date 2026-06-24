"use client";

import { ArrowLeft, Phone, User, MapPin, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Captacion } from "../actions";

type DetailClientProps = {
  captacion: Captacion;
  userRole: string;
};

export function CaptacionDetailClient({ captacion, userRole }: DetailClientProps) {
  const isCaptadora = userRole === "captadora";
  const [updatingData, setUpdatingData] = useState(false);
  const [loggingAttempt, setLoggingAttempt] = useState(false);
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
    result: "answered" as const,
    notes: "",
    phone: "",
    name: "",
  });
  const [error, setError] = useState("");

  async function handleUpdate() {
    setError("");
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
    } catch (err) {
      setError("Error de conexión");
    }
  }

  async function handleLogAttempt() {
    setError("");
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
    } catch (err) {
      setError("Error de conexión");
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-10">
      <Link
        href="/cl/admin/captaciones"
        className="flex items-center gap-2 text-sm font-medium text-gold hover:text-gold-dark mb-6"
      >
        <ArrowLeft size={16} />
        Volver a captaciones
      </Link>

      {/* Encabezado */}
      <div className="rounded-2xl border border-gold/15 bg-white/70 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">{captacion.title || "Sin título"}</h1>
            <p className="mt-1 text-sm text-ink/55">{captacion.source_url}</p>
          </div>
          <div className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium",
            captacion.status === "pending" && "bg-amber-100 text-amber-700",
            captacion.status === "completed" && "bg-emerald-100 text-emerald-700",
            captacion.status === "converted_to_property" && "bg-blue-100 text-blue-700",
            captacion.status === "rejected" && "bg-red-100 text-red-700",
          )}>
            {captacion.status === "pending" && "Pendiente"}
            {captacion.status === "completed" && "Completada"}
            {captacion.status === "converted_to_property" && "Convertida"}
            {captacion.status === "rejected" && "Rechazada"}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-4">
          {captacion.bedrooms && (
            <div>
              <p className="text-[11px] text-ink/50 uppercase">Dormitorios</p>
              <p className="text-lg font-semibold text-ink">{captacion.bedrooms}</p>
            </div>
          )}
          {captacion.price && (
            <div>
              <p className="text-[11px] text-ink/50 uppercase">Precio</p>
              <p className="text-lg font-semibold text-ink">${(captacion.price / 1_000_000).toFixed(1)}M</p>
            </div>
          )}
          {captacion.commune && (
            <div>
              <p className="text-[11px] text-ink/50 uppercase">Comuna</p>
              <p className="text-lg font-semibold text-ink">{captacion.commune}</p>
            </div>
          )}
          {captacion.owner_confirmed && (
            <div>
              <p className="text-[11px] text-ink/50 uppercase">Estado</p>
              <p className="flex items-center gap-1 text-lg font-semibold text-emerald-600">
                <Check size={16} />
                Confirmado
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Datos completados */}
      <div className="rounded-2xl border border-gold/15 bg-white/70 p-6 mb-6">
        <h2 className="text-sm font-bold text-ink/70 uppercase tracking-wider mb-4">
          Datos del Dueño
        </h2>

        {!updatingData ? (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] text-ink/50 uppercase">Teléfono</p>
              <p className="text-sm text-ink font-medium">
                {captacion.owner_phone ? (
                  <a href={`tel:${captacion.owner_phone}`} className="text-gold hover:underline">
                    {captacion.owner_phone}
                  </a>
                ) : (
                  <span className="text-ink/40">No registrado</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink/50 uppercase">Nombre</p>
              <p className="text-sm text-ink font-medium">
                {captacion.owner_name || <span className="text-ink/40">No registrado</span>}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink/50 uppercase">Contacto</p>
              <p className="text-sm text-ink font-medium">
                {captacion.owner_contact || <span className="text-ink/40">No registrado</span>}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink/50 uppercase">Dirección Real</p>
              <p className="text-sm text-ink font-medium">
                {captacion.address_real || <span className="text-ink/40">No registrada</span>}
              </p>
            </div>

            {isCaptadora && (
              <button
                onClick={() => setUpdatingData(true)}
                className="mt-4 rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
              >
                Actualizar Datos
              </button>
            )}
          </div>
        ) : (
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Teléfono</label>
              <input
                type="tel"
                value={formData.owner_phone}
                onChange={(e) => setFormData({ ...formData, owner_phone: e.target.value })}
                placeholder="+56 9 1234 5678"
                className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Nombre del Dueño</label>
              <input
                type="text"
                value={formData.owner_name}
                onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                placeholder="Juan Pérez"
                className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Contacto (Email/Otro)</label>
              <input
                type="text"
                value={formData.owner_contact}
                onChange={(e) => setFormData({ ...formData, owner_contact: e.target.value })}
                placeholder="juan@example.com"
                className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Dirección Real</label>
              <input
                type="text"
                value={formData.address_real}
                onChange={(e) => setFormData({ ...formData, address_real: e.target.value })}
                placeholder="Av. Providencia 1234, Providencia"
                className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.owner_confirmed}
                  onChange={(e) => setFormData({ ...formData, owner_confirmed: e.target.checked })}
                  className="rounded border border-ink/20"
                />
                <span className="text-sm font-medium text-ink">Dueño confirmó que sí quiere vender</span>
              </label>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleUpdate}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setUpdatingData(false)}
                className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Log de intentos */}
      {isCaptadora && (
        <div className="rounded-2xl border border-gold/15 bg-white/70 p-6">
          <h2 className="text-sm font-bold text-ink/70 uppercase tracking-wider mb-4">
            Registrar Intento de Contacto
          </h2>

          {!loggingAttempt ? (
            <button
              onClick={() => setLoggingAttempt(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              + Registrar Intento
            </button>
          ) : (
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Tipo de Intento</label>
                <select
                  value={logForm.attempt_type}
                  onChange={(e) => setLogForm({ ...logForm, attempt_type: e.target.value as any })}
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
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
                  onChange={(e) => setLogForm({ ...logForm, result: e.target.value as any })}
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
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

              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Teléfono (si obtuvo)</label>
                <input
                  type="tel"
                  value={logForm.phone}
                  onChange={(e) => setLogForm({ ...logForm, phone: e.target.value })}
                  placeholder="+56 9..."
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Nombre (si obtuvo)</label>
                <input
                  type="text"
                  value={logForm.name}
                  onChange={(e) => setLogForm({ ...logForm, name: e.target.value })}
                  placeholder="Nombre del dueño"
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Notas del Intento</label>
                <textarea
                  value={logForm.notes}
                  onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
                  placeholder="Detalles de la conversación..."
                  rows={3}
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleLogAttempt}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  Guardar Intento
                </button>
                <button
                  type="button"
                  onClick={() => setLoggingAttempt(false)}
                  className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
