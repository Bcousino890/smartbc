"use client";

import { Globe2, Plus, Phone, MapPin, User, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { cn } from "@/lib/utils";
import type { Captacion } from "./actions";

type CaptacionesClientProps = {
  captaciones: Captacion[];
  userRole: string;
};

export function CaptacionesClient({ captaciones, userRole }: CaptacionesClientProps) {
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    source_url: "",
    source_site: "",
    title: "",
    price: "",
    bedrooms: "",
    notes: "",
  });
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!formData.source_url.trim()) {
      setError("URL es requerida");
      return;
    }

    try {
      const res = await fetch("/api/admin/cl/captaciones/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: formData.source_url,
          source_site: formData.source_site || null,
          title: formData.title || null,
          price: formData.price ? parseInt(formData.price) : null,
          bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : null,
          notes: formData.notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al crear captación");
        return;
      }

      setFormData({ source_url: "", source_site: "", title: "", price: "", bedrooms: "", notes: "" });
      setCreating(false);
      window.location.reload();
    } catch (err) {
      setError("Error de conexión");
    }
  }

  const isCaptadora = userRole === "captadora";

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="admin.nav.captaciones"
        subtitleKey="Prospección de propiedades - Agentes crean, captadoras completan info"
      />

      {/* Crear Captación (solo agentes/admins) */}
      {!isCaptadora && (
        <section className="mb-8 rounded-2xl border border-gold/15 bg-white/70 p-6">
          <button
            onClick={() => setCreating(!creating)}
            className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
          >
            <Plus size={16} />
            Nueva Captación
          </button>

          {creating && (
            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">
                  URL de la propiedad *
                </label>
                <input
                  type="url"
                  value={formData.source_url}
                  onChange={(e) => setFormData({ ...formData, source_url: e.target.value })}
                  placeholder="https://www.portalinmobiliario.com/..."
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">
                    Sitio (portal, corredora, etc.)
                  </label>
                  <input
                    type="text"
                    value={formData.source_site}
                    onChange={(e) => setFormData({ ...formData, source_site: e.target.value })}
                    placeholder="ej: portalinmobiliario"
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">
                    Dormitorios
                  </label>
                  <input
                    type="number"
                    value={formData.bedrooms}
                    onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                    placeholder="3"
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">
                    Título/Descripción
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Casa en Las Condes"
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">
                    Precio (CLP)
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="450000000"
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">
                  Notas iniciales
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notas sobre la propiedad..."
                  rows={3}
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
                >
                  Crear Captación
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Listado */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-ink/70">
          {isCaptadora ? "Mis Captaciones" : "Captaciones Creadas"}
        </h2>

        {captaciones.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 py-12 text-center">
            <Globe2 size={32} className="mx-auto mb-3 text-ink/25" />
            <p className="text-sm text-ink/50">
              {isCaptadora ? "Sin captaciones asignadas" : "Sin captaciones creadas"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {captaciones.map((c) => (
              <Link
                key={c.id}
                href={`/cl/admin/captaciones/${c.id}`}
                className="block rounded-xl border border-gold/15 bg-white/70 p-4 transition hover:border-gold/30 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-ink line-clamp-1">
                      {c.title || "Sin título"}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink/55">
                      {c.commune && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {c.commune}
                        </span>
                      )}
                      {c.bedrooms && (
                        <span>{c.bedrooms}d</span>
                      )}
                      {c.price && (
                        <span>${(c.price / 1_000_000).toFixed(0)}M</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <div className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium",
                        c.status === "pending" && "bg-amber-100 text-amber-700",
                        c.status === "completed" && "bg-emerald-100 text-emerald-700",
                        c.status === "converted_to_property" && "bg-blue-100 text-blue-700",
                        c.status === "rejected" && "bg-red-100 text-red-700",
                      )}>
                        {c.status === "pending" && "Pendiente"}
                        {c.status === "completed" && "Completada"}
                        {c.status === "converted_to_property" && "Convertida"}
                        {c.status === "rejected" && "Rechazada"}
                      </div>

                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink/40">
                        {c.owner_phone && <Phone size={11} />}
                        {c.owner_contact && <User size={11} />}
                        {c.owner_confirmed && <span className="text-emerald-600">✓ Confirmado</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
