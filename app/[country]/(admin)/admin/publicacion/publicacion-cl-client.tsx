"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe2,
  Link as LinkIcon,
  Loader2,
  Settings,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PLACEHOLDER_GRADIENT } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type MLProperty = {
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
  currency: string | null;
  portalinmobiliario_id: string | null;
  portalinmobiliario_published_at: string | null;
  portalinmobiliario_sync_status: string | null;
};

type Tab = "portal" | "web";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  synced:   { label: "Publicado",  icon: CheckCircle2, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  pending:  { label: "Pendiente",  icon: Clock,        cls: "text-amber-700   bg-amber-50   border-amber-200"   },
  failed:   { label: "Error",      icon: AlertCircle,  cls: "text-red-700     bg-red-50     border-red-200"     },
  archived: { label: "Archivado",  icon: XCircle,      cls: "text-ink/50      bg-ink/5      border-ink/15"      },
};

function MlStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-ink/35">—</span>;
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", cfg.cls)}>
      <Icon size={11} strokeWidth={2} />
      {cfg.label}
    </span>
  );
}

// El item id de MercadoLibre ya viene con el prefijo del sitio ("MLC123...").
// Antes se anteponía "MLC" otra vez y el enlace quedaba .../MLCMLC123 (roto).
function mlListingUrl(itemId: string): string {
  const digits = itemId.replace(/^MLC-?/i, "");
  return `https://www.portalinmobiliario.com/MLC-${digits}`;
}

function formatCurrency(currency: string | null): string {
  if (currency === "clp") return "CLP";
  if (currency === "usd") return "USD";
  return "UF";
}

export function PublicacionClClient({
  properties,
  isConnected,
}: {
  properties: MLProperty[];
  isConnected: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("portal");
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const publishedCount = properties.filter((p) => p.portalinmobiliario_sync_status === "synced").length;
  const totalCount = properties.length;

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
    } catch {
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
    } catch {
      setErrors((prev) => ({ ...prev, [propertyId]: "Error de conexión" }));
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="mt-7 space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gold/15 bg-white/60 p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("portal")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
            tab === "portal"
              ? "bg-ink text-cream-50 shadow-sm"
              : "text-ink/60 hover:text-ink"
          )}
        >
          <Globe2 size={15} strokeWidth={1.75} />
          PortalInmobiliario.com
          <span className={cn(
            "ml-1 rounded-full px-1.5 py-0.5 text-xs font-bold",
            tab === "portal" ? "bg-cream-50/20 text-cream-50" : "bg-ink/10 text-ink/60"
          )}>
            {publishedCount}/{totalCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("web")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
            tab === "web"
              ? "bg-ink text-cream-50 shadow-sm"
              : "text-ink/60 hover:text-ink"
          )}
        >
          <LinkIcon size={15} strokeWidth={1.75} />
          Web
        </button>
      </div>

      {/* ─── TAB: PortalInmobiliario ─── */}
      {tab === "portal" && (
        <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
          {/* Header */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Globe2 size={18} className="text-gold" />
              <h2 className="crm-section-title text-ink">PortalInmobiliario.com</h2>
            </div>
            <Link
              href="/cl/admin/configuracion"
              className="flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/60 px-3 py-1.5 text-xs font-medium text-ink/55 transition hover:bg-white hover:text-ink"
            >
              <Settings size={12} />
              Configuración API
            </Link>
          </div>

          {/* Connection banner */}
          <div className={cn(
            "mb-5 flex items-center justify-between gap-4 rounded-xl border p-4",
            isConnected ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
          )}>
            <div className="flex items-center gap-3">
              <Globe2 size={18} className={isConnected ? "text-emerald-600" : "text-amber-600"} />
              <div>
                <p className={cn("text-sm font-semibold", isConnected ? "text-emerald-800" : "text-amber-800")}>
                  {isConnected ? "Conectado a MercadoLibre Chile" : "No conectado a MercadoLibre"}
                </p>
                <p className={cn("text-xs", isConnected ? "text-emerald-600" : "text-amber-700")}>
                  {isConnected
                    ? "Puedes publicar directamente en PortalInmobiliario.com"
                    : "Conecta tu cuenta para publicar en PortalInmobiliario.com"}
                </p>
              </div>
            </div>
            {!isConnected && (
              <a
                href="/api/admin/cl/ml-connect"
                className="shrink-0 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
              >
                Conectar
              </a>
            )}
          </div>

          {/* Stats row */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            {[
              { label: "Publicadas", value: publishedCount },
              { label: "Sin publicar", value: totalCount - publishedCount },
              { label: "Total propiedades", value: totalCount },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-gold/10 bg-white/70 p-3 text-center">
                <p className="text-xl font-semibold text-ink">{s.value}</p>
                <p className="mt-0.5 text-xs text-ink/50">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Properties table */}
          {properties.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink/15 py-12 text-center">
              <Globe2 size={28} className="mx-auto mb-3 text-ink/25" strokeWidth={1.5} />
              <p className="text-sm text-ink/50">No hay propiedades en Chile</p>
              <Link
                href="/cl/admin/propiedades"
                className="mt-3 inline-block rounded-lg bg-ink px-4 py-2 text-xs font-medium text-cream-50 hover:bg-ink/80 transition"
              >
                Ir a propiedades
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gold/10">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gold/10 bg-white/50">
                    {["Propiedad", "Precio", "Ubicación", "Estado", "Acciones"].map((h) => (
                      <th key={h} className="px-4 py-3 crm-table-header text-ink/45">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {properties.map((p) => {
                    const isLoading = loadingId === p.id;
                    const isPublished = p.portalinmobiliario_sync_status === "synced";
                    const errorMsg = errors[p.id];

                    return (
                      <tr key={p.id} className="border-b border-gold/8 last:border-0 hover:bg-white/40 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-lg border border-ink/8 bg-ink/5">
                              {p.cover_photo_url ? (
                                <Image src={p.cover_photo_url} alt="" fill className="object-cover" sizes="64px" />
                              ) : (
                                <div className="h-full w-full" style={{ background: PLACEHOLDER_GRADIENT }} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/cl/admin/propiedades/${p.slug}`}
                                className="line-clamp-1 text-sm font-medium text-ink hover:text-gold"
                              >
                                {p.title}
                              </Link>
                              {p.bc_reference && (
                                <p className="text-xs text-ink/40">{p.bc_reference}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-ink">
                            {p.price ? `${formatPrice(p.price)} ${formatCurrency(p.currency)}` : "—"}
                          </p>
                          <p className="text-xs text-ink/50">
                            {p.operation === "rent" ? "Arriendo" : "Venta"}
                            {" · "}{p.bedrooms ?? 0}d {p.bathrooms ?? 0}b
                            {p.square_meters ? ` · ${p.square_meters}m²` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {p.commune ? (
                            <>
                              <p className="text-xs text-ink/70">{p.commune}</p>
                              <p className="text-xs text-ink/40">{p.region ?? ""}</p>
                            </>
                          ) : (
                            <span className="text-xs text-amber-600">Sin comuna ★</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <MlStatusBadge status={p.portalinmobiliario_sync_status} />
                          {p.portalinmobiliario_published_at && (
                            <p className="mt-1 text-xs text-ink/35">
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
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-50"
                                  >
                                    {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Globe2 size={11} />}
                                    {p.portalinmobiliario_sync_status === "archived" ? "Re-publicar"
                                      : p.portalinmobiliario_sync_status === "failed" ? "Reintentar"
                                      : "Publicar"}
                                  </button>
                                )}
                                {isPublished && (
                                  <button
                                    type="button"
                                    onClick={() => handleUnpublish(p.id)}
                                    disabled={isLoading || isPending}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                                  >
                                    {isLoading ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                                    Bajar
                                  </button>
                                )}
                              </>
                            )}
                            {p.portalinmobiliario_id && (
                              <a
                                href={mlListingUrl(p.portalinmobiliario_id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-gold hover:text-gold-dark"
                              >
                                <ExternalLink size={10} />
                                Ver anuncio
                              </a>
                            )}
                            {errorMsg && (
                              <p className="max-w-[160px] text-xs text-red-600">{errorMsg}</p>
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

          {/* Warning: missing fields */}
          {properties.some((p) => !p.commune || !p.region || !p.property_type) && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold text-amber-800">
                Algunas propiedades les faltan datos requeridos por PortalInmobiliario (★)
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Edita cada propiedad para completar: comuna, región y tipo. Sin esos datos no se puede publicar.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: Web ─── */}
      {tab === "web" && (
        <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
          <div className="mb-5 flex items-center gap-2">
            <LinkIcon size={18} className="text-gold" />
            <h2 className="crm-section-title text-ink">Publicación Web</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link
              href="/cl/admin/propiedades"
              className="group flex items-start gap-4 rounded-xl border border-gold/15 bg-white/70 p-5 transition hover:border-gold/30 hover:bg-white"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/5 group-hover:bg-gold/10">
                <LinkIcon size={18} strokeWidth={1.75} className="text-ink/60 group-hover:text-gold" />
              </div>
              <div>
                <p className="font-semibold text-ink">SmartLinks</p>
                <p className="mt-1 text-sm text-ink/55">
                  Genera enlaces únicos de cada propiedad con tracking de visitas para compartir con clientes.
                </p>
              </div>
            </Link>

            <Link
              href="/cl/admin/propiedades"
              className="group flex items-start gap-4 rounded-xl border border-gold/15 bg-white/70 p-5 transition hover:border-gold/30 hover:bg-white"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/5 group-hover:bg-gold/10">
                <Globe2 size={18} strokeWidth={1.75} className="text-ink/60 group-hover:text-gold" />
              </div>
              <div>
                <p className="font-semibold text-ink">Catálogo web</p>
                <p className="mt-1 text-sm text-ink/55">
                  Todas las propiedades activas aparecen automáticamente en el portal web de Benjamín Cousiño Propiedades.
                </p>
              </div>
            </Link>
          </div>

          <div className="mt-4 rounded-xl border border-gold/15 bg-gold/5 px-4 py-3">
            <p className="text-xs text-ink/60">
              Las propiedades en estado <strong>Disponible</strong> aparecen en el portal web automáticamente.
              Para gestionar fotos, vídeos y planos, entra a la ficha de cada propiedad.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
