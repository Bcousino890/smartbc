"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Bath, BedDouble, Building2, Calendar, Camera, Check, ChevronDown, ClipboardList, Compass, Copy, Euro, ExternalLink, Hammer, History, Leaf, Loader2, MapPin, MessageCircle, MessageSquare, Phone, Plus, RefreshCw, Ruler, Sparkles, UserCheck, Video, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { formatPrice } from "@/lib/format";
import { detectVideoType, getYoutubeEmbedUrl, getVimeoEmbedUrl } from "@/lib/video-embed";
import { cn } from "@/lib/utils";
import { assignParticular, createParticularShareLink, createPropertyFromParticular, logParticularContact, setParticularActive, updateParticularPhone } from "./actions";
import { prefetchParticularDetail } from "./detail-cache";
import { LinkedAdsSection } from "./linked-ads-section";
import { AdMap } from "@/components/admin/particulares/ad-map";
import { esAddress, esCondition, esFeatures, esFloor, esOrientation, esText } from "@/lib/particulares/es-labels";
import { Gallery, type MediaItem } from "./_ficha/gallery";
import { Lightbox } from "./_ficha/lightbox";
import { SourcesTab } from "./_ficha/sources-tab";
import { formatEuros, formatPct, formatZone, groupThousands, mapPrecision, portalName, pricePerM2, priceVariation, relativeTime, whatsappUrl, zoneForMap } from "./_ficha/format";
import type { ParticularChangeRow, ParticularRow, StaffOption } from "./particulares-types";

export const DATE_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

// Única función de formateo de teléfono del módulo (antes había una segunda
// casi idéntica, formatPhoneToInternational, que no reformateaba bien los
// números ya guardados con prefijo +34 — el caso más común, porque
// normalizeSpanishPhone ya los guarda así).
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/[\s\-\(\)\.]/g, "");
  if (/^[6789]\d{8}$/.test(d))
    return `+34 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (/^34[6789]\d{8}$/.test(d))
    return `+34 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (/^\+34[6789]\d{8}$/.test(d))
    return `+${d.slice(1, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return phone;
}

// ─── Edit Phone Modal ────────────────────────────────────────────────────────

function EditPhoneModal({
  particularId,
  currentPhone,
  onClose,
  onSaved,
}: {
  particularId: string;
  currentPhone: string | null;
  onClose: () => void;
  onSaved: (newPhone: string | null) => void;
}) {
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await updateParticularPhone(particularId, phone || null);
      if (res.ok) {
        onSaved(phone || null);
        onClose();
      } else {
        setError((res as any).error || "unknown_error");
      }
    } catch {
      setError("network_error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} isPending={saving} title="Editar teléfono" size="sm">
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-ink/75 mb-2">
            Teléfono
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej: +34 600 123 456"
            className="w-full rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <p className="mt-1 text-xs text-ink/50">
            Deja en blanco para eliminar el teléfono
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-ink/5 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-gold-dark disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Link temporal externo ──────────────────────────────────────────────────
// Genera un enlace público de solo lectura para ESTE anuncio, pensado para
// reenviar FUERA del equipo (WhatsApp a un cliente o a un colega externo).
// Vive en su propia tabla/ruta (particulares_share_links + /a/[token], ver
// migración 0149) — no toca properties/SmartLinks/Viewing Collections, así
// que este bloque es autónomo a propósito: no comparte estado con el resto
// del modal más allá del `particularId` que recibe por prop.
function ShareLinkAction({ particularId }: { particularId: string }) {
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await createParticularShareLink(particularId);
      if (res.ok) setLink({ url: res.url, expiresAt: res.expiresAt });
      else setError((res as any).error || "unknown_error");
    } catch {
      setError("network_error");
    } finally {
      setCreating(false);
    }
  }

  function handleCopy() {
    if (!link) return;
    navigator.clipboard.writeText(link.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border-t border-ink/8 pt-4">
      {!link ? (
        <button
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink/70 transition hover:border-gold/40 hover:text-ink disabled:opacity-60"
        >
          {creating ? (
            <Loader2 size={14} strokeWidth={2} className="animate-spin" />
          ) : (
            <ExternalLink size={14} strokeWidth={1.75} />
          )}
          {creating ? "Creando enlace…" : "Crear link temporal para compartir"}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2.5">
          <p className="crm-label-sm text-ink/40">Enlace temporal (7 días)</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link.url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border border-ink/10 bg-cream-50 px-2 py-1.5 text-xs text-ink/70"
            />
            <button
              onClick={handleCopy}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-ink/15 px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-gold/40"
            >
              {copied ? (
                <Check size={12} strokeWidth={2} />
              ) : (
                <Copy size={12} strokeWidth={1.75} />
              )}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="text-xs text-ink/40">
            Caduca el{" "}
            {new Date(link.expiresAt).toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "Europe/Madrid",
            })}
            . Cualquiera con el enlace puede verlo, sin iniciar sesión.
          </p>
          <p className="text-xs text-ink/40">
            La descripción se limpia con IA antes de publicarla (sin
            teléfono, email ni menciones de "particular"/"sin agencias").
          </p>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600">
          No se pudo crear el enlace ({error}). Inténtalo de nuevo.
        </p>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

// Fecha del timeline: "10 jun 2026, 12:35"
const HISTORY_DATE_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

// Eje X del gráfico de precios: "10 jun"
const CHART_DATE_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});

function asPrice(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function euros(v: unknown): string {
  const n = asPrice(v);
  return n != null ? `${formatPrice(n)} €` : "—";
}

type TimelineEntry = {
  key: string;
  date: string; // ISO
  title: string;
  icon: ReactNode;
  iconClass: string;
};

// Traducción de cada change_type del cron a una línea legible del timeline.
function changeToEntry(c: ParticularChangeRow): TimelineEntry {
  const base = { key: c.id, date: c.changed_at };
  switch (c.change_type) {
    case "new_listing": {
      const price = asPrice(c.new_value?.price);
      return {
        ...base,
        title: price != null ? `Alta del anuncio · ${formatPrice(price)} €` : "Alta del anuncio",
        icon: <Sparkles size={12} strokeWidth={2} />,
        iconClass: "bg-gold/20 text-gold-dark",
      };
    }
    case "price_up":
      return {
        ...base,
        title: `El precio subió de ${euros(c.old_value?.price)} a ${euros(c.new_value?.price)}`,
        icon: <ArrowUp size={12} strokeWidth={2.5} />,
        iconClass: "bg-red-100 text-red-600",
      };
    case "price_down":
      return {
        ...base,
        title: `El precio bajó de ${euros(c.old_value?.price)} a ${euros(c.new_value?.price)}`,
        icon: <ArrowDown size={12} strokeWidth={2.5} />,
        iconClass: "bg-emerald-100 text-emerald-600",
      };
    case "phone_added":
      return {
        ...base,
        title: `Teléfono añadido: ${String(c.new_value?.phone ?? "—")}`,
        icon: <Phone size={12} strokeWidth={2} />,
        iconClass: "bg-emerald-100 text-emerald-600",
      };
    case "phone_changed":
      return {
        ...base,
        title: `El teléfono cambió de ${String(c.old_value?.phone ?? "—")} a ${String(c.new_value?.phone ?? "—")}`,
        icon: <Phone size={12} strokeWidth={2} />,
        iconClass: "bg-blue-100 text-blue-600",
      };
    case "photo_count_change":
      return {
        ...base,
        title: `Las fotos pasaron de ${String(c.old_value?.count ?? "—")} a ${String(c.new_value?.count ?? "—")}`,
        icon: <Camera size={12} strokeWidth={2} />,
        iconClass: "bg-blue-100 text-blue-600",
      };
    case "deleted":
      return {
        ...base,
        title: "Anuncio retirado",
        icon: <X size={12} strokeWidth={2.5} />,
        iconClass: "bg-red-100 text-red-600",
      };
    case "reactivated":
      return {
        ...base,
        title: "Anuncio reactivado",
        icon: <RefreshCw size={12} strokeWidth={2} />,
        iconClass: "bg-emerald-100 text-emerald-600",
      };
    case "video_added":
      return {
        ...base,
        title: "Vídeo añadido al anuncio",
        icon: <Video size={12} strokeWidth={2} />,
        iconClass: "bg-violet-100 text-violet-600",
      };
    case "floor_plan_added":
      return {
        ...base,
        title: "Plano añadido al anuncio",
        icon: <Ruler size={12} strokeWidth={2} />,
        iconClass: "bg-violet-100 text-violet-600",
      };
    default:
      return {
        ...base,
        title: "Actualización",
        icon: <History size={12} strokeWidth={2} />,
        iconClass: "bg-ink/10 text-ink/60",
      };
  }
}

// Historial de cambios del anuncio: timeline (particulares_changes) + gráfico
// de evolución del precio cuando ha habido al menos un cambio real.
function ChangeHistory({ row }: { row: ParticularRow }) {
  const [changes, setChanges] = useState<ParticularChangeRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/particulares/changes?id=${row.id}`)
      .then((r) => r.json())
      .then((d) => setChanges(d.changes ?? []))
      .catch(() => setChanges([]))
      .finally(() => setLoading(false));
  }, [row.id]);

  // Timeline (más reciente arriba). Si el cron aún no registró el alta
  // (anuncios anteriores al tipo "new_listing"), se sintetiza al final con
  // la fecha de detección del anuncio.
  const entries = useMemo<TimelineEntry[]>(() => {
    if (!changes) return [];
    const sorted = [...changes].sort(
      (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
    );
    const items = sorted.map(changeToEntry);
    const hasAlta = sorted.some((c) => c.change_type === "new_listing");
    const altaDate = row.detected_at ?? row.created_at;
    if (!hasAlta && altaDate) {
      items.push({
        key: "alta-sintetizada",
        date: altaDate,
        title: "Alta del anuncio",
        icon: <Sparkles size={12} strokeWidth={2} />,
        iconClass: "bg-gold/20 text-gold-dark",
      });
    }
    return items;
  }, [changes, row.detected_at, row.created_at]);

  // Serie de precios: alta → cambios de precio en orden cronológico → precio
  // actual como último punto.
  const pricePoints = useMemo(() => {
    if (!changes) return [] as Array<{ date: string; price: number }>;
    const asc = [...changes].sort(
      (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
    );
    const pts: Array<{ date: string; price: number }> = [];
    for (const c of asc) {
      if (!["new_listing", "price_up", "price_down"].includes(c.change_type)) continue;
      const price = asPrice(c.new_value?.price);
      if (price != null) pts.push({ date: c.changed_at, price });
    }
    if (row.price != null) {
      pts.push({ date: new Date().toISOString(), price: row.price });
    }
    return pts;
  }, [changes, row.price]);

  // Solo merece gráfico si el precio cambió de verdad (≥2 valores distintos).
  const showChart = new Set(pricePoints.map((p) => p.price)).size >= 2;
  const chartData = useMemo(
    () =>
      pricePoints.map((p) => ({
        label: CHART_DATE_FMT.format(new Date(p.date)),
        price: p.price,
      })),
    [pricePoints],
  );

  const first = pricePoints[0]?.price ?? null;
  const last = row.price ?? pricePoints[pricePoints.length - 1]?.price ?? null;
  const varPct = first != null && last != null && first > 0 ? ((last - first) / first) * 100 : null;
  const since = row.detected_at ?? row.created_at;
  const daysInMarket = since ? Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000)) : null;
  const priceByKey = new Map<string, number>();
  for (const c of changes ?? []) {
    const pr = asPrice(c.new_value?.price);
    if (pr != null && ["new_listing", "price_up", "price_down"].includes(c.change_type)) priceByKey.set(c.id, pr);
  }

  if (loading)
    return (
      <p className="flex items-center gap-1.5 py-2 text-sm text-ink/70">
        <Loader2 size={14} className="animate-spin" /> Cargando histórico…
      </p>
    );

  const kpi = (label: string, value: string, tone = "text-ink") => (
    <div className="rounded-xl border border-ink/10 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-ink/65">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpi("Precio inicial", first != null ? `${formatPrice(first)} €` : "—")}
        {kpi("Precio actual", last != null ? `${formatPrice(last)} €` : "—")}
        {kpi(
          "Variación",
          varPct == null || Math.abs(varPct) < 0.05 ? "Sin cambios" : `${varPct > 0 ? "+" : "−"}${Math.abs(varPct).toFixed(1).replace(".", ",")} %`,
          varPct == null || Math.abs(varPct) < 0.05 ? "text-ink" : varPct < 0 ? "text-emerald-800" : "text-red-800",
        )}
        {kpi("En el mercado", daysInMarket != null ? `${daysInMarket} ${daysInMarket === 1 ? "día" : "días"}` : "—")}
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink">Evolución del precio</h3>
        {chartData.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/70">Todavía no hay precios registrados.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(10, 10, 10, 0.08)" />
                <XAxis dataKey="label" stroke="rgba(10, 10, 10, 0.6)" style={{ fontSize: "12px" }} tickLine={false} />
                <YAxis stroke="rgba(10, 10, 10, 0.6)" style={{ fontSize: "12px" }} width={64} domain={["auto", "auto"]} tickFormatter={(v) => formatPrice(Number(v))} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "rgba(251, 248, 243, 0.97)", border: "1px solid rgba(10, 10, 10, 0.1)", borderRadius: "10px", fontSize: "13px" }}
                  formatter={(value: unknown) => [typeof value === "number" ? `${formatPrice(value)} €` : "—", "Precio"]}
                  labelFormatter={(label) => `Fecha: ${label}`}
                />
                <Line type="stepAfter" dataKey="price" stroke="#8a6d2f" strokeWidth={2.5} dot={{ r: 4, fill: "#8a6d2f", strokeWidth: 0 }} isAnimationActive={false} name="Precio" />
              </LineChart>
            </ResponsiveContainer>
            {!showChart && (
              <p className="mt-2 text-xs text-ink/65">
                El precio no ha cambiado desde que lo detectamos. Si cambia, lo verás aquí.
              </p>
            )}
          </>
        )}
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink">Línea de tiempo</h3>
        {entries.length === 0 ? (
          <p className="py-2 text-sm text-ink/70">Sin historial de cambios.</p>
        ) : (
          <ol className="space-y-4">
            {entries.map((e) => {
              const pr = priceByKey.get(e.key);
              return (
                <li key={e.key} className="flex items-start gap-3">
                  <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", e.iconClass)}>{e.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{e.title}</p>
                    <p className="mt-0.5 text-xs text-ink/65">{HISTORY_DATE_FMT.format(new Date(e.date))}</p>
                  </div>
                  {pr != null && <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">{formatPrice(pr)} €</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

// ─── Contact Log ─────────────────────────────────────────────────────────────

type ContactEntry = {
  id: string;
  contact_type: string;
  outcome: string | null;
  notes: string | null;
  contacted_at: string;
  advisor_id: string;
  profiles: { first_name: string | null; last_name: string | null } | null;
};

const CONTACT_TYPE_LABELS: Record<string, string> = {
  call: "Llamada",
  whatsapp: "WhatsApp",
  email: "Email",
  visit: "Visita",
  note: "Nota",
};

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  no_answer: { label: "No contesta", color: "bg-ink/10 text-ink/60" },
  interested: { label: "Interesado", color: "bg-emerald-100 text-emerald-700" },
  not_interested: { label: "No interesado", color: "bg-red-100 text-red-700" },
  callback_requested: { label: "Pide que llame", color: "bg-amber-100 text-amber-700" },
  appointment_set: { label: "Cita fijada", color: "bg-blue-100 text-blue-700" },
  converted: { label: "Convertido", color: "bg-emerald-200 text-emerald-800" },
  other: { label: "Otro", color: "bg-ink/10 text-ink/60" },
};

function ContactLog({ particularId }: { particularId: string }) {
  const [contacts, setContacts] = useState<ContactEntry[] | null>(null);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [contactType, setContactType] = useState<"call" | "whatsapp" | "email" | "visit" | "note">("call");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/admin/particulares/contacts?id=${particularId}`)
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts ?? []))
      .catch(() => setContacts([]))
      .finally(() => setLoadingContacts(false));
  }, [particularId]);

  async function handleSubmit() {
    setSaving(true);
    try {
      const res = await logParticularContact(
        particularId,
        contactType,
        outcome || null,
        notes || null,
      );
      if (res.ok) {
        toast("Contacto registrado correctamente", "success");
        setShowForm(false);
        setOutcome("");
        setNotes("");
        // Refresh the contact list
        fetch(`/api/admin/particulares/contacts?id=${particularId}`)
          .then((r) => r.json())
          .then((d) => setContacts(d.contacts ?? []))
          .catch(() => {});
      } else {
        toast(
          `Error al guardar (${(res as { ok: false; error: string }).error}). Inténtalo de nuevo.`,
          "error",
        );
      }
    } catch {
      toast("Error al guardar (network_error). Inténtalo de nuevo.", "error");
    } finally {
      setSaving(false);
    }
  }

  const fmt = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });

  return (
    <div>
      {/* Header + toggle button */}
      <div className="flex items-center justify-between mb-3">
        <p className="crm-label-sm text-ink/40">
          Registro de contactos
          {contacts && contacts.length > 0 && (
            <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-xs text-gold-dark">
              {contacts.length}
            </span>
          )}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/5 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-gold/50 hover:bg-gold/10"
        >
          <ClipboardList size={13} strokeWidth={1.75} />
          Registrar contacto
          <ChevronDown size={12} strokeWidth={2} className={cn("transition-transform", showForm && "rotate-180")} />
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="mb-4 rounded-xl border border-gold/20 bg-gold/3 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink/50 mb-1">
                Tipo de contacto
              </label>
              <select
                value={contactType}
                onChange={(e) => setContactType(e.target.value as typeof contactType)}
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
              >
                <option value="call">Llamada</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="visit">Visita</option>
                <option value="note">Nota interna</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink/50 mb-1">
                Resultado
              </label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
              >
                <option value="">Sin especificar</option>
                <option value="no_answer">No contesta</option>
                <option value="interested">Interesado</option>
                <option value="not_interested">No interesado</option>
                <option value="callback_requested">Pide que llame</option>
                <option value="appointment_set">Cita fijada</option>
                <option value="converted">Convertido</option>
                <option value="other">Otro</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink/50 mb-1">
              Notas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Resumen de la conversación, próximos pasos…"
              className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-lg border border-ink/15 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-ink/5"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink transition hover:bg-gold-dark disabled:opacity-60"
            >
              {saving ? (
                <><Loader2 size={14} className="animate-spin" /> Guardando…</>
              ) : (
                "Guardar contacto"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Contact history list */}
      {loadingContacts ? (
        <p className="text-xs text-ink/40 py-2">Cargando contactos…</p>
      ) : !contacts || contacts.length === 0 ? (
        <p className="text-xs text-ink/40 py-2">Sin contactos registrados todavía.</p>
      ) : (
        <ol className="relative border-l border-ink/10 pl-4 space-y-3">
          {contacts.map((c) => {
            const outcomeMeta = c.outcome ? OUTCOME_LABELS[c.outcome] : null;
            const advisorName = c.profiles
              ? [c.profiles.first_name, c.profiles.last_name].filter(Boolean).join(" ")
              : null;
            return (
              <li key={c.id} className="flex items-start gap-2">
                <span className="absolute -left-1.5 mt-0.5 h-3 w-3 rounded-full border-2 border-white bg-gold/50" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs font-semibold text-ink/70">
                      {CONTACT_TYPE_LABELS[c.contact_type] ?? c.contact_type}
                    </span>
                    {outcomeMeta && (
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", outcomeMeta.color)}>
                        {outcomeMeta.label}
                      </span>
                    )}
                    {advisorName && (
                      <span className="text-xs text-ink/45">{advisorName}</span>
                    )}
                  </div>
                  {c.notes && (
                    <p className="mt-1 text-xs text-ink/65 leading-relaxed">{c.notes}</p>
                  )}
                  <p className="mt-0.5 text-xs text-ink/40">{fmt.format(new Date(c.contacted_at))}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function ParticularModal({
  row,
  onClose,
  onPhoneUpdated,
  onAssigned,
  onActiveChanged,
  canCreateProperty = true,
  staffOptions = [],
}: {
  row: ParticularRow;
  onClose: () => void;
  onPhoneUpdated?: (newPhone: string | null) => void;
  onAssigned?: (advisorId: string | null, advisorName: string | null) => void;
  onActiveChanged?: (active: boolean, takenDownAt: string | null) => void;
  canCreateProperty?: boolean;
  staffOptions?: StaffOption[];
}) {
  const router = useRouter();
  const [photoIdx, setPhotoIdx] = useState(0);
  const [currentRow, setCurrentRow] = useState(row);
  const [showEditPhone, setShowEditPhone] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [tab, setTab] = useState<"detalles" | "fuentes" | "historico" | "contactos">("detalles");
  const [sourcesCount, setSourcesCount] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{ items: MediaItem[]; start: number } | null>(null);
  const [descOpen, setDescOpen] = useState(false);

  // El listado solo trae la portada: la galería completa y la ficha técnica se
  // piden al abrir (normalmente ya están en la caché por el prefetch de la tarjeta).
  useEffect(() => {
    let cancelled = false;
    if (currentRow.photos) return;
    (async () => {
      const data = await prefetchParticularDetail(row.id);
      if (cancelled || !data) return;
      setCurrentRow((prev) => ({ ...prev, ...data }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  const photos = currentRow.photos ?? (currentRow.cover_url ? [{ url: currentRow.cover_url }] : []);
  const hasPhone = Boolean(currentRow.phone);
  const detailLoading = !currentRow.photos;

  // Español siempre, también para lo guardado en inglés antes del backfill.
  const address = esAddress(currentRow.address);
  const features = esFeatures(currentRow.features);
  const zoneText = formatZone(currentRow.zone);
  const title = address || zoneText || "Anuncio";
  const portalLabel = portalName(currentRow.portal);
  const operationLabel = currentRow.operation === "rent" ? "Alquiler" : "Venta";
  const variation = priceVariation(currentRow.price, currentRow.previous_price, currentRow.price_drop_pct);
  const perM2 = pricePerM2(currentRow.price, currentRow.square_meters, currentRow.price_per_m2);
  const wa = whatsappUrl(
    currentRow.phone,
    `Hola, le escribo por su anuncio de ${currentRow.operation === "rent" ? "alquiler" : "venta"}${address ? ` en ${address}` : ""}.`,
  );
  const precision = mapPrecision({
    latitude: currentRow.latitude,
    longitude: currentRow.longitude,
    address: currentRow.address,
    zone: currentRow.zone,
  });

  // Bloqueo de scroll + Escape. Con el visor o el diálogo de teléfono abiertos,
  // Escape cierra primero ESO y no la ficha.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !showEditPhone && !viewer) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, showEditPhone, viewer]);

  async function handleAssign(advisorId: string) {
    setAssigning(true);
    setAssignError(null);
    const value = advisorId || null;
    const res = await assignParticular(currentRow.id, value);
    if (res.ok) {
      const name = value ? (staffOptions.find((s) => s.id === value)?.name ?? null) : null;
      setCurrentRow((prev) => ({ ...prev, assigned_to: value, assigned_name: name }));
      onAssigned?.(value, name);
    } else {
      console.error("[particulares] Error asignando:", res.error);
      setAssignError("No se pudo guardar la asignación. Inténtalo de nuevo.");
    }
    setAssigning(false);
  }

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ slug: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

  async function handleToggleActive() {
    const next = !currentRow.is_active;
    setTogglingActive(true);
    try {
      const res = await setParticularActive(currentRow.id, next);
      if (res.ok) {
        const takenDownAt = next ? null : new Date().toISOString();
        setCurrentRow((prev) => ({ ...prev, is_active: next, taken_down_at: takenDownAt }));
        onActiveChanged?.(next, takenDownAt);
      }
    } finally {
      setTogglingActive(false);
    }
  }

  async function handleCreateProperty() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createPropertyFromParticular(currentRow.id);
      if (res.ok) setCreated({ slug: res.slug });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else setCreateError((res as any).error || "unknown_error");
    } catch {
      setCreateError("network_error");
    } finally {
      setCreating(false);
    }
  }

  function handlePhoneSaved(newPhone: string | null) {
    setCurrentRow({ ...currentRow, phone: newPhone });
    onPhoneUpdated?.(newPhone);
    setShowEditPhone(false);
  }

  const [verifyingThis, setVerifyingThis] = useState(false);
  const [verifyThisResult, setVerifyThisResult] = useState<string | null>(null);

  async function handleVerifyThisPhone() {
    setVerifyingThis(true);
    setVerifyThisResult(null);
    try {
      const res = await fetch(`/api/admin/particulares/verify-phones?id=${currentRow.id}`, { method: "POST" });
      const data = await res.json();
      if (data?.ok && data.foundPhone) {
        setCurrentRow((prev) => ({ ...prev, phone: data.foundPhone, chat_only: false }));
        onPhoneUpdated?.(data.foundPhone);
        setVerifyThisResult("✓ Teléfono encontrado y guardado.");
      } else if (data?.ok) {
        setVerifyThisResult("El anuncio no expone teléfono en el portal (solo chat).");
      } else {
        setVerifyThisResult("No se pudo verificar — reintenta en un momento.");
      }
    } catch {
      setVerifyThisResult("No se pudo verificar — reintenta en un momento.");
    } finally {
      setVerifyingThis(false);
    }
  }

  function openViewer(what: "photos" | "plan" | "video") {
    const items: MediaItem[] = [];
    if (what === "photos") {
      photos.forEach((p) => items.push({ kind: "photo", url: p.url, alt: p.alt }));
      setViewer({ items, start: photoIdx });
      return;
    }
    if (what === "plan" && currentRow.floor_plan_url) items.push({ kind: "plan", url: currentRow.floor_plan_url });
    if (what === "video" && currentRow.video_url) items.push({ kind: "video", url: currentRow.video_url });
    if (items.length) setViewer({ items, start: 0 });
  }

  // Datos clave: solo lo que existe (nada de «—»).
  const facts: Array<{ icon: ReactNode; label: string; value: string }> = [];
  if (currentRow.bedrooms != null) facts.push({ icon: <BedDouble size={18} />, label: "Dormitorios", value: String(currentRow.bedrooms) });
  if (currentRow.bathrooms != null) facts.push({ icon: <Bath size={18} />, label: "Baños", value: String(currentRow.bathrooms) });
  if (currentRow.square_meters != null) facts.push({ icon: <Ruler size={18} />, label: "Superficie", value: `${currentRow.square_meters} m²` });
  if (perM2 != null) facts.push({ icon: <Euro size={18} />, label: "Precio por m²", value: `${groupThousands(perM2)} €/m²` });
  if (currentRow.floor) facts.push({ icon: <Building2 size={18} />, label: "Planta", value: esFloor(currentRow.floor) });
  if (currentRow.has_lift != null) facts.push({ icon: <ArrowUpDown size={18} />, label: "Ascensor", value: currentRow.has_lift ? "Sí" : "No" });
  if (currentRow.year_built != null) facts.push({ icon: <Calendar size={18} />, label: "Año de construcción", value: String(currentRow.year_built) });
  if (currentRow.condition) facts.push({ icon: <Hammer size={18} />, label: "Estado", value: esCondition(currentRow.condition) });
  if (currentRow.orientation) facts.push({ icon: <Compass size={18} />, label: "Orientación", value: esOrientation(currentRow.orientation) });
  if (currentRow.energy_consumption) facts.push({ icon: <Zap size={18} />, label: "Energía · consumo", value: esText(currentRow.energy_consumption) });
  if (currentRow.energy_emissions) facts.push({ icon: <Leaf size={18} />, label: "Energía · emisiones", value: esText(currentRow.energy_emissions) });

  const description = currentRow.description ? esText(currentRow.description) : "";
  const longDesc = description.length > 420;

  const btnPrimary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  const priceBlock = (
  <div className="rounded-xl border border-ink/10 bg-white p-4">
    <p className="text-3xl font-bold tabular-nums text-ink">
      {currentRow.price != null ? formatEuros(currentRow.price, { monthly: currentRow.operation === "rent" }) : "Precio no disponible"}
    </p>
    {variation && (
      <p className={cn("mt-1 text-sm font-medium", variation.direction === "down" ? "text-emerald-800" : "text-red-800")}>
        {variation.direction === "down" ? "Bajó" : "Subió"} {formatPct(Math.abs(variation.pct))} · antes {formatEuros(variation.previous, { monthly: currentRow.operation === "rent" })}
      </p>
    )}
    <h2 className="mt-3 flex items-start gap-1.5 text-base font-semibold text-ink">
      <MapPin size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-gold-dark" />
      <span>{address || zoneText || "Madrid"}</span>
    </h2>
    {address && zoneText && <p className="ml-[22px] text-sm text-ink/70">{zoneText}</p>}
    <div className="mt-3 flex flex-wrap gap-1.5">
      <span className="rounded-md bg-ink px-2 py-0.5 text-xs font-semibold text-cream-50">{operationLabel}</span>
      <span className="rounded-md bg-gold/30 px-2 py-0.5 text-xs font-semibold text-ink">{portalLabel}</span>
    </div>
  </div>
  );

  const contactCard = (
    <div className="rounded-xl border border-ink/10 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-ink">Contacto · Particular</p>
      {currentRow.owner_name && <p className="mb-3 font-medium text-ink">{currentRow.owner_name}</p>}
      {hasPhone ? (
        <div className="space-y-2">
          <a href={`tel:${currentRow.phone}`} className={cn(btnPrimary, "w-full bg-emerald-700 text-white hover:bg-emerald-800")}>
            <Phone size={16} strokeWidth={2} />
            Llamar · {formatPhone(currentRow.phone!)}
          </a>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(btnPrimary, "w-full border border-emerald-700 text-emerald-800 hover:bg-emerald-50")}>
              <MessageCircle size={16} strokeWidth={2} />
              WhatsApp
            </a>
          )}
          {currentRow.phone_confidence && (
            <p className="text-xs text-ink/65">
              {currentRow.phone_confidence === "high" ? "Teléfono verificado en el portal" : "Teléfono detectado automáticamente"}
            </p>
          )}
          <button onClick={() => setShowEditPhone(true)} className={cn(btnPrimary, "w-full border border-ink/15 bg-white text-ink hover:border-ink/40")}>
            Editar teléfono
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <a href={currentRow.source_url} target="_blank" rel="noopener noreferrer" className={cn(btnPrimary, "w-full border border-ink/15 bg-white text-ink hover:border-ink/40")}>
            <MessageSquare size={16} strokeWidth={1.75} />
            Contactar por chat en {portalLabel}
          </a>
          <button onClick={() => setShowEditPhone(true)} className={cn(btnPrimary, "w-full border border-gold-dark/40 bg-gold/10 text-ink hover:bg-gold/20")}>
            <Phone size={14} strokeWidth={1.75} />
            Agregar teléfono
          </button>
          <button onClick={handleVerifyThisPhone} disabled={verifyingThis} className={cn(btnPrimary, "w-full border border-ink/15 bg-white text-ink hover:border-ink/40 disabled:opacity-60")}>
            {verifyingThis ? (
              <><Loader2 size={14} className="animate-spin" /> Consultando el portal…</>
            ) : (
              <><RefreshCw size={14} strokeWidth={1.75} /> Verificar teléfono ahora</>
            )}
          </button>
          {verifyThisResult && <p className="text-center text-xs text-ink/70">{verifyThisResult}</p>}
        </div>
      )}
    </div>
  );

  const assignCard = (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <UserCheck size={14} strokeWidth={2} className="text-blue-700" />
        Asignado a
      </p>
      <div className="flex items-center gap-2">
        <select
          aria-label="Asesor asignado"
          value={currentRow.assigned_to ?? ""}
          onChange={(e) => handleAssign(e.target.value)}
          disabled={assigning || staffOptions.length === 0}
          className="h-10 flex-1 rounded-lg border border-ink/15 bg-white px-3 text-sm text-ink focus:border-ink/40 focus:outline-none disabled:opacity-60"
        >
          <option value="">Sin asignar</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {assigning && <Loader2 size={16} className="animate-spin text-ink/50" />}
      </div>
      {assignError && <p className="mt-1.5 text-xs text-red-700">{assignError}</p>}
      {currentRow.last_contact_by && (
        <p className="mt-2 text-xs text-ink/70">
          Último contacto: <span className="font-medium text-ink">{currentRow.last_contact_by}</span>
          {currentRow.last_contact_at && ` · ${DATE_FMT.format(new Date(currentRow.last_contact_at))}`}
        </p>
      )}
    </div>
  );

  const actions = (
    <div className="space-y-2">
      <a href={currentRow.source_url} target="_blank" rel="noopener noreferrer" className={cn(btnPrimary, "w-full border border-ink/15 bg-white text-ink hover:border-ink/40")}>
        <ExternalLink size={14} strokeWidth={1.75} />
        Ver en {portalLabel}
      </a>
      {canCreateProperty &&
        (created ? (
          <Link href={`/admin/propiedades/${created.slug}`} className={cn(btnPrimary, "w-full bg-emerald-700 text-white hover:bg-emerald-800")}>
            <Check size={14} strokeWidth={2} />
            Propiedad creada · abrir ficha
          </Link>
        ) : (
          <button onClick={handleCreateProperty} disabled={creating} className={cn(btnPrimary, "w-full bg-gold text-ink hover:bg-gold-dark disabled:opacity-60")}>
            <Plus size={14} strokeWidth={2} />
            {creating ? "Creando…" : "Crear propiedad"}
          </button>
        ))}
      {createError && <p className="text-xs text-red-700">No se pudo crear la propiedad ({createError}). Inténtalo de nuevo.</p>}
      {currentRow.is_active && (
        <button onClick={handleToggleActive} disabled={togglingActive} className={cn(btnPrimary, "w-full border border-red-300 text-red-800 hover:bg-red-50 disabled:opacity-60")}>
          <X size={14} strokeWidth={2} />
          {togglingActive ? "Guardando…" : "Marcar como retirado"}
        </button>
      )}
      <ShareLinkAction particularId={currentRow.id} />
    </div>
  );

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={cn(
        "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink",
        tab === id ? "border-ink text-ink" : "border-transparent text-ink/65 hover:text-ink",
      )}
    >
      {label}
    </button>
  );

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {showEditPhone && (
        <EditPhoneModal
          particularId={currentRow.id}
          currentPhone={currentRow.phone}
          onClose={() => setShowEditPhone(false)}
          onSaved={handlePhoneSaved}
        />
      )}
      {viewer && <Lightbox items={viewer.items} startIndex={viewer.start} title={title} onClose={() => setViewer(null)} />}
      <div className="crm-root fixed inset-0 z-50 flex items-stretch justify-center bg-ink/50 backdrop-blur-sm sm:p-4" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Ficha: ${title}`}
          className="relative flex w-full max-w-6xl flex-col overflow-hidden bg-cream-50 shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink/10 bg-white px-4 py-3 sm:px-6">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {currentRow.particular_reference && (
                <span className="rounded-md border border-gold-dark/30 bg-gold/10 px-2 py-0.5 font-mono text-xs font-semibold text-ink">{currentRow.particular_reference}</span>
              )}
              <span className="rounded-md border border-ink/15 bg-ink/5 px-2 py-0.5 font-mono text-xs text-ink/70">
                {currentRow.portal.toUpperCase()}-{currentRow.external_id}
              </span>
              {relativeTime(currentRow.created_at) && <span className="text-xs text-ink/65">Detectado {relativeTime(currentRow.created_at)}</span>}
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar ficha" className="rounded-full p-2 text-ink hover:bg-ink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
              <X size={20} strokeWidth={2} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto pb-24 lg:pb-0">
            <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 space-y-6">
                <Gallery
                  photos={photos}
                  index={photoIdx}
                  onIndexChange={setPhotoIdx}
                  loadingMore={detailLoading}
                  title={title}
                  operationLabel={operationLabel}
                  portalLabel={portalLabel}
                  retired={!currentRow.is_active}
                  sourceUrl={currentRow.source_url}
                  hasPlan={Boolean(currentRow.floor_plan_url)}
                  hasVideo={Boolean(currentRow.video_url)}
                  onOpenViewer={openViewer}
                  keyboardActive={!viewer && !showEditPhone}
                />

                {/* Precio y dirección: en móvil bajo la foto; en escritorio, en la columna derecha */}
                <div className="lg:hidden">{priceBlock}</div>

                {facts.length > 0 && (
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {facts.map((f) => (
                      <div key={f.label} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-3 py-2.5">
                        <span aria-hidden className="text-gold-dark">{f.icon}</span>
                        <div className="min-w-0">
                          <dt className="text-xs text-ink/65">{f.label}</dt>
                          <dd className="break-words text-sm font-semibold text-ink">{f.value}</dd>
                        </div>
                      </div>
                    ))}
                  </dl>
                )}

                <div role="tablist" aria-label="Secciones de la ficha" className="flex border-b border-ink/10">
                  {tabBtn("detalles", "Detalles")}
                  {tabBtn("fuentes", sourcesCount != null ? `Fuentes (${sourcesCount})` : "Fuentes")}
                  {tabBtn("historico", "Histórico")}
                  {tabBtn("contactos", "Contactos")}
                </div>

                {tab === "detalles" && (
                  <div className="space-y-6">
                    {description && (
                      <section>
                        <h3 className="mb-2 text-sm font-semibold text-ink">Descripción</h3>
                        <p className={cn("whitespace-pre-wrap text-sm leading-relaxed text-ink/80", longDesc && !descOpen && "line-clamp-6")}>{description}</p>
                        {longDesc && (
                          <button type="button" onClick={() => setDescOpen((v) => !v)} className="mt-1 text-sm font-semibold text-ink underline underline-offset-2">
                            {descOpen ? "Ver menos" : "Ver más"}
                          </button>
                        )}
                      </section>
                    )}
                    {features.length > 0 && (
                      <section>
                        <h3 className="mb-2 text-sm font-semibold text-ink">Características</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {features.map((f, i) => (
                            <span key={i} className="rounded-full border border-ink/10 bg-white px-3 py-1 text-sm text-ink/80">{f}</span>
                          ))}
                        </div>
                      </section>
                    )}
                    {currentRow.floor_plan_url && (
                      <section>
                        <h3 className="mb-2 text-sm font-semibold text-ink">Plano</h3>
                        <button type="button" onClick={() => openViewer("plan")} aria-label="Ampliar el plano" className="block w-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={currentRow.floor_plan_url} alt="Plano de la vivienda" className="w-full rounded-lg border border-ink/10 bg-white" loading="lazy" />
                        </button>
                      </section>
                    )}
                    {currentRow.video_url && (
                      <section>
                        <h3 className="mb-2 text-sm font-semibold text-ink">Vídeo</h3>
                        {(() => {
                          const v = detectVideoType(currentRow.video_url);
                          if (v.type === "youtube" && v.id)
                            return <iframe src={getYoutubeEmbedUrl(v.id)} className="aspect-video w-full rounded-lg" allowFullScreen loading="lazy" title="Vídeo de YouTube" />;
                          if (v.type === "vimeo" && v.id)
                            return <iframe src={getVimeoEmbedUrl(v.id)} className="aspect-video w-full rounded-lg" allowFullScreen loading="lazy" title="Vídeo de Vimeo" />;
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          return <video controls preload="none" className="w-full rounded-lg" src={currentRow.video_url!} />;
                        })()}
                      </section>
                    )}
                    {precision !== null && (
                      <section>
                        <h3 className="mb-2 text-sm font-semibold text-ink">Ubicación</h3>
                        <AdMap
                          particularId={currentRow.id}
                          latitude={currentRow.latitude}
                          longitude={currentRow.longitude}
                          address={currentRow.address}
                          zone={zoneForMap(currentRow.zone)}
                          precision={precision}
                          height={288}
                        />
                      </section>
                    )}
                    {(currentRow.source_update_text || currentRow.advertiser_profile_url) && (
                      <div className="space-y-1 text-xs text-ink/65">
                        {currentRow.source_update_text && <p>{esText(currentRow.source_update_text)}</p>}
                        {currentRow.advertiser_profile_url && (
                          <a href={currentRow.advertiser_profile_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-2">
                            Ver perfil del anunciante ↗
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {tab === "fuentes" && (
                  <div className="space-y-6">
                    <SourcesTab rowId={currentRow.id} onCount={setSourcesCount} />
                    <LinkedAdsSection rowId={currentRow.id} onChanged={() => router.refresh()} />
                  </div>
                )}

                {tab === "historico" && <ChangeHistory row={currentRow} />}

                {tab === "contactos" && (
                  <div className="rounded-xl border border-ink/10 bg-white p-4">
                    <ContactLog particularId={currentRow.id} />
                  </div>
                )}
              </div>

              {/* Columna derecha: precio, contacto, asignación y acciones */}
              <aside className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:self-start">
                {!currentRow.is_active && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    <span className="font-semibold">Anuncio retirado</span>
                    {currentRow.taken_down_at && <span>· {DATE_FMT.format(new Date(currentRow.taken_down_at))}</span>}
                    <button onClick={handleToggleActive} disabled={togglingActive} className="ml-auto rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60">
                      {togglingActive ? "Guardando…" : "Reactivar"}
                    </button>
                  </div>
                )}
                <div className="hidden lg:block">{priceBlock}</div>
                {contactCard}
                {assignCard}
                {actions}
              </aside>
            </div>
          </div>

          {/* Barra inferior móvil: llamar / WhatsApp siempre al alcance del pulgar */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex gap-2 border-t border-ink/10 bg-white p-3 lg:hidden">
            {hasPhone ? (
              <>
                <a href={`tel:${currentRow.phone}`} className={cn(btnPrimary, "flex-1 bg-emerald-700 text-white")}>
                  <Phone size={16} /> Llamar
                </a>
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(btnPrimary, "flex-1 border border-emerald-700 text-emerald-800")}>
                    <MessageCircle size={16} /> WhatsApp
                  </a>
                )}
              </>
            ) : (
              <button onClick={() => setShowEditPhone(true)} className={cn(btnPrimary, "flex-1 border border-gold-dark/40 bg-gold/10 text-ink")}>
                <Phone size={16} /> Agregar teléfono
              </button>
            )}
            <button type="button" onClick={onClose} className={cn(btnPrimary, "bg-ink px-5 text-cream-50")}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
