"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PLACEHOLDER_GRADIENT } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type MlProperty = {
  id: string;
  slug: string;
  title: string;
  price: number | null;
  operation: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  cover_photo_url: string | null;
  bc_reference: string | null;
  commune: string | null;
  region: string | null;
  property_type: string | null;
  portalinmobiliario_id: string | null;
  portalinmobiliario_published_at: string | null;
  portalinmobiliario_sync_status: string | null;
};

const STATUS_LABELS: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  synced: { label: "Publicado", icon: CheckCircle2, className: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  pending: { label: "Pendiente", icon: Clock, className: "text-amber-600 bg-amber-50 border-amber-200" },
  failed: { label: "Error", icon: AlertCircle, className: "text-red-600 bg-red-50 border-red-200" },
  archived: { label: "Archivado", icon: XCircle, className: "text-ink/50 bg-ink/5 border-ink/15" },
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-[11px] text-ink/40">—</span>;
  const s = STATUS_LABELS[status];
  if (!s) return <span className="text-[11px] text-ink/40">{status}</span>;
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium", s.className)}>
      <Icon size={11} strokeWidth={2} />
      {s.label}
    </span>
  );
}

export function PortalinmobiliarioClient({
  properties,
  isConnected,
}: {
  properties: MlProperty[];
  isConnected: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handlePublish(propertyId: string) {
    setLoadingId(propertyId);
    setErrors((prev) => ({ ...prev, [propertyId]: "" }));
    try {
      const res = await fetch("/api/admin/cl/publish-to-portalinmobiliario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrors((prev) => ({ ...prev, [propertyId]: data.error ?? "Error al publicar" }));
      } else {
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setErrors((prev) => ({ ...prev, [propertyId]: "Error de conexión" }));
    } finally {
      setLoadingId(null);
    }
  }

  async function handleUnpublish(propertyId: string) {
    setLoadingId(propertyId);
    setErrors((prev) => ({ ...prev, [propertyId]: "" }));
    try {
      const res = await fetch("/api/admin/cl/unpublish-from-portalinmobiliario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrors((prev) => ({ ...prev, [propertyId]: data.error ?? "Error al despublicar" }));
      } else {
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setErrors((prev) => ({ ...prev, [propertyId]: "Error de conexión" }));
    } finally {
      setLoadingId(null);
    }
  }

  const published = properties.filter((p) => p.portalinmobiliario_sync_status === "synced");
  const unpublished = properties.filter((p) => !p.portalinmobiliario_sync_status || p.portalinmobiliario_sync_status === "archived" || p.portalinmobiliario_sync_status === "failed");
  const pending = properties.filter((p) => p.portalinmobiliario_sync_status === "pending");

  return (
    <div className="space-y-6">
      {/* Connection status */}
      <div className={cn(
        "flex items-center justify-between gap-4 rounded-xl border p-4",
        isConnected
          ? "border-emerald-200 bg-emerald-50"
          : "border-amber-200 bg-amber-50"
      )}>
        <div className="flex items-center gap-3">
          <Globe2 size={20} className={isConnected ? "text-emerald-600" : "text-amber-600"} />
          <div>
            <p className={cn("text-sm font-semibold", isConnected ? "text-emerald-800" : "text-amber-800")}>
              {isConnected ? "Conectado a MercadoLibre Chile" : "No conectado a MercadoLibre"}
            </p>
            <p className={cn("text-xs", isConnected ? "text-emerald-600" : "text-amber-700")}>
              {isConnected
                ? "Puedes publicar propiedades directamente en PortalInmobiliario.com"
                : "Conecta tu cuenta para publicar propiedades en PortalInmobiliario.com"}
            </p>
          </div>
        </div>
        {!isConnected && (
          <a
            href="/api/admin/cl/ml-connect"
            className="shrink-0 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
          >
            Conectar MercadoLibre
          </a>
        )}
        {isConnected && (
          <Link
            href="/cl/admin/configuracion"
            className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
          >
            Configuración
          </Link>
        )}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gold/15 bg-white/70 p-4 text-center">
          <p className="text-2xl font-semibold text-ink">{published.length}</p>
          <p className="mt-0.5 text-xs text-ink/55">Publicadas</p>
        </div>
        <div className="rounded-xl border border-gold/15 bg-white/70 p-4 text-center">
          <p className="text-2xl font-semibold text-ink">{unpublished.length}</p>
          <p className="mt-0.5 text-xs text-ink/55">Sin publicar</p>
        </div>
        <div className="rounded-xl border border-gold/15 bg-white/70 p-4 text-center">
          <p className="text-2xl font-semibold text-ink">{properties.length}</p>
          <p className="mt-0.5 text-xs text-ink/55">Total</p>
        </div>
      </div>

      {/* Properties table */}
      {properties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 py-12 text-center">
          <Globe2 size={32} className="mx-auto mb-3 text-ink/25" strokeWidth={1.5} />
          <p className="text-sm text-ink/50">No hay propiedades en Chile</p>
          <Link
            href="/cl/admin/propiedades"
            className="mt-3 inline-block rounded-lg bg-ink px-4 py-2 text-xs font-medium text-cream-50 transition hover:bg-ink/80"
          >
            Ir a propiedades
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gold/15">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gold/15 bg-white/50">
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink/50">Propiedad</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink/50">Detalles</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink/50">Ubicación</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink/50">Estado ML</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink/50">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => {
                const isLoading = loadingId === p.id;
                const errorMsg = errors[p.id];
                const isPublished = p.portalinmobiliario_sync_status === "synced";
                const mlUrl = p.portalinmobiliario_id
                  ? `https://www.portalinmobiliario.com/MLC${p.portalinmobiliario_id}`
                  : null;

                return (
                  <tr key={p.id} className="border-b border-gold/10 last:border-0 hover:bg-white/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-ink/10 bg-ink/5">
                          {p.cover_photo_url ? (
                            <Image
                              src={p.cover_photo_url}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="64px"
                            />
                          ) : (
                            <div
                              className="h-full w-full"
                              style={{ background: PLACEHOLDER_GRADIENT }}
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/cl/admin/propiedades/${p.slug}`}
                            className="line-clamp-1 text-[13px] font-medium text-ink hover:text-gold"
                          >
                            {p.title}
                          </Link>
                          {p.bc_reference && (
                            <p className="text-[11px] text-ink/45">{p.bc_reference}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-semibold text-ink">
                        {p.price ? formatPrice(p.price) : "—"}
                      </p>
                      <p className="text-[11px] text-ink/55">
                        {p.operation === "rent" ? "Arriendo" : "Venta"} ·{" "}
                        {p.bedrooms ?? 0}d {p.bathrooms ?? 0}b
                        {p.square_meters ? ` · ${p.square_meters}m²` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[12px] text-ink/70">
                        {p.commune ?? <span className="text-amber-600">Sin comuna ★</span>}
                      </p>
                      <p className="text-[11px] text-ink/40">
                        {p.region ?? <span className="text-amber-600">Sin región ★</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.portalinmobiliario_sync_status} />
                      {p.portalinmobiliario_published_at && (
                        <p className="mt-1 text-[10px] text-ink/40">
                          {new Date(p.portalinmobiliario_published_at).toLocaleDateString("es-CL")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        {isConnected && (
                          <>
                            {!isPublished && (
                              <button
                                type="button"
                                onClick={() => handlePublish(p.id)}
                                disabled={isLoading || isPending}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-50"
                              >
                                {isLoading ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <Globe2 size={11} />
                                )}
                                {p.portalinmobiliario_sync_status === "archived"
                                  ? "Re-publicar"
                                  : p.portalinmobiliario_sync_status === "failed"
                                  ? "Reintentar"
                                  : "Publicar"}
                              </button>
                            )}
                            {isPublished && (
                              <button
                                type="button"
                                onClick={() => handleUnpublish(p.id)}
                                disabled={isLoading || isPending}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                              >
                                {isLoading ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <XCircle size={11} />
                                )}
                                Despublicar
                              </button>
                            )}
                          </>
                        )}
                        {p.portalinmobiliario_id && (
                          <a
                            href={`https://www.portalinmobiliario.com/MLC${p.portalinmobiliario_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-gold hover:text-gold-dark"
                          >
                            <ExternalLink size={10} />
                            Ver en Portal
                          </a>
                        )}
                        {errorMsg && (
                          <p className="max-w-[180px] text-[10px] text-red-600">{errorMsg}</p>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Missing fields warning */}
      {properties.some((p) => !p.commune || !p.region || !p.property_type) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[12px] font-semibold text-amber-800">
            Algunas propiedades no tienen todos los datos requeridos por PortalInmobiliario
          </p>
          <p className="mt-1 text-[11px] text-amber-700">
            Los campos marcados con ★ (comuna, región, tipo de propiedad) son requeridos al publicar.
            Edita cada propiedad para completarlos.
          </p>
        </div>
      )}
    </div>
  );
}
