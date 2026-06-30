"use client";

import { Check, Globe2, Plus, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { cn } from "@/lib/utils";
import { CreateCaptacionModal } from "./create-captacion-modal";
import type { Captacion } from "./actions";

type CaptacionesClientProps = {
  captaciones: Captacion[];
  userRole: string;
};

export function CaptacionesClient({ captaciones, userRole }: CaptacionesClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [captacionesList, setCaptacionesList] = useState(captaciones);

  const isCaptadora = userRole === "captadora";

  const handleCreated = () => {
    // Recargar la lista
    window.location.reload();
  }

  function formatPrice(c: Captacion) {
    if (!c.price) return null;
    if (c.currency === "uf") return `UF ${c.price.toLocaleString("es-CL")}`;
    return `$${(c.price / 1_000_000).toFixed(0)}M`;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="admin.nav.captaciones"
        subtitleKey="Prospección de propiedades - Agentes crean, captadoras completan info"
      />

      {/* Crear Captación (solo agentes/admins) */}
      {!isCaptadora && (
        <section className="mb-8">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
          >
            <Plus size={16} />
            Nueva Captación
          </button>
        </section>
      )}

      <CreateCaptacionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleCreated}
      />

      {/* Listado */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-ink/70">
          {isCaptadora ? "Mis Captaciones Asignadas" : "Captaciones Creadas"}
        </h2>

        {captaciones.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 py-12 text-center">
            <Globe2 size={32} className="mx-auto mb-3 text-ink/25" />
            <p className="text-sm text-ink/50">
              {isCaptadora ? "Sin captaciones asignadas" : "Sin captaciones creadas aún"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {captaciones.map((c) => (
              <Link
                key={c.id}
                href={`/cl/admin/captaciones/${c.id}`}
                className="flex gap-4 rounded-xl border border-gold/15 bg-white/70 p-4 transition hover:border-gold/30 hover:bg-white"
              >
                {c.cover_photo_url && (
                  <img
                    src={c.cover_photo_url}
                    alt=""
                    className="h-16 w-20 rounded-lg object-cover flex-shrink-0"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
                <div className="flex flex-1 min-w-0 items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-ink line-clamp-1">
                      {c.title || "Sin título"}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/55">
                      {c.commune && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} />
                          {c.commune}
                        </span>
                      )}
                      {c.bedrooms && <span>{c.bedrooms}d</span>}
                      {c.price && <span>{formatPrice(c)}</span>}
                      {c.scrape_status === "scraped" && (
                        <span className="text-emerald-600 flex items-center gap-0.5">
                          <Check size={10} />
                          Scrapeado
                        </span>
                      )}
                      {c.scrape_status === "failed" && (
                        <span className="text-red-600 text-[10px]">❌ Error scrape</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-ink/40">
                      Hace {new Date(c.created_at).toLocaleDateString("es-CL")}
                    </p>
                  </div>

                  <div className="flex-shrink-0 text-right">
                    <div className={cn(
                      "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium",
                      (c.status as string) === "pending" && "bg-amber-100 text-amber-700",
                      (c.status as string) === "completed" && "bg-emerald-100 text-emerald-700",
                      c.status === "converted_to_property" && "bg-blue-100 text-blue-700",
                      c.status === "rejected" && "bg-red-100 text-red-700",
                    )}>
                      {(c.status as string) === "pending" && "Pendiente"}
                      {(c.status as string) === "completed" && "Completada"}
                      {c.status === "converted_to_property" && "Convertida"}
                      {c.status === "rejected" && "Rechazada"}
                    </div>
                    {c.owner_confirmed && (
                      <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-emerald-600">
                        <Check size={10} />
                        Dueño confirmado
                      </div>
                    )}
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
