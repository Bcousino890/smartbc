"use client";

import { ArrowDown, ArrowUp, Camera, Check, ChevronDown, ClipboardList, Copy, ExternalLink, History, Loader2, MapPin, MessageSquare, Phone, Plus, RefreshCw, Ruler, Sparkles, UserCheck, Video, X } from "lucide-react";
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
          <p className="text-[11px] text-ink/40">
            Caduca el{" "}
            {new Date(link.expiresAt).toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "Europe/Madrid",
            })}
            . Cualquiera con el enlace puede verlo, sin iniciar sesión.
          </p>
          <p className="text-[11px] text-ink/40">
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

// Texto de búsqueda para el mapa de fallback (sin coordenadas): la dirección
// exacta es más precisa que la zona. Solo añadimos ", Madrid" si falta.
function mapFallbackQuery(row: ParticularRow): string {
  const base = row.address ?? row.zone ?? "";
  return /madrid/i.test(base) ? base : `${base}, Madrid`;
}

// ¿La dirección es una calle concreta (vía + idealmente número), no solo una
// zona/barrio? Determina si podemos clavar el puntito exacto.
const STREET_RE =
  /\b(calle|c\/|avda?\.?|avenida|paseo|p\.?º|plaza|pl\.|camino|carretera|ctra\.?|ronda|traves[ií]a|v[ií]a|glorieta|bulevar|gran\s+v[ií]a|cuesta|costanilla|callej[oó]n)\b/i;
function isExactStreet(address: string | null | undefined): boolean {
  return !!address && STREET_RE.test(address);
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

  return (
    <div>
      <p className="mb-3 crm-label-sm text-ink/40">
        Historial de cambios
      </p>
      {loading ? (
        <p className="flex items-center gap-1.5 text-xs text-ink/40 py-2">
          <Loader2 size={12} className="animate-spin" />
          Cargando historial…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-ink/40 py-2">Sin historial de cambios.</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((e) => (
            <li key={e.key} className="flex items-start gap-2.5">
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  e.iconClass,
                )}
              >
                {e.icon}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink">{e.title}</p>
                <p className="mt-0.5 text-xs text-ink/40">
                  {HISTORY_DATE_FMT.format(new Date(e.date))}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Evolución del precio (alta → cambios → precio actual) */}
      {!loading && showChart && (
        <div className="mt-4">
          <p className="mb-2 crm-label-sm text-ink/40">
            Cambio de precio
          </p>
          <div className="rounded-lg border border-ink/10 bg-white p-3">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(10, 10, 10, 0.06)" />
                <XAxis
                  dataKey="label"
                  stroke="rgba(10, 10, 10, 0.4)"
                  style={{ fontSize: "11px" }}
                  tickLine={false}
                />
                <YAxis
                  stroke="rgba(10, 10, 10, 0.4)"
                  style={{ fontSize: "11px" }}
                  width={64}
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => formatPrice(Number(v))}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(251, 248, 243, 0.95)",
                    border: "1px solid rgba(10, 10, 10, 0.1)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: unknown) => [
                    typeof value === "number" ? `${formatPrice(value)} €` : "—",
                    "Precio",
                  ]}
                  labelFormatter={(label) => `Fecha: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#c9a96e"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#c9a96e", strokeWidth: 0 }}
                  isAnimationActive={false}
                  name="Precio"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
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

  // El listado solo trae la portada. Al abrir el modal hace falta la galería
  // completa + la ficha técnica; normalmente ya vienen de la caché porque se
  // prefetchan al pasar el ratón por la tarjeta (ver detail-cache.ts), así
  // que el modal abre con todo puesto en vez de rellenarse a trozos.
  useEffect(() => {
    let cancelled = false;
    if (currentRow.photos) return;
    (async () => {
      const data = await prefetchParticularDetail(row.id);
      if (cancelled || !data) return;
      // Se fusiona el payload entero: fotos + ficha técnica (precio/m²,
      // rebaja, planta, año, estado, energía…). `photos` sale siempre como
      // array del servidor.
      setCurrentRow((prev) => ({ ...prev, ...data }));
    })();
    return () => {
      cancelled = true;
    };
    // Solo al abrir: `row.id` identifica el anuncio del modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  const photos =
    currentRow.photos ??
    (currentRow.cover_url ? [{ url: currentRow.cover_url }] : []);
  const cover = photos[photoIdx]?.url;

  // Preload the next/prev slide so paging the gallery is instant. The list only
  // ships the cover, so the gallery loads on demand; without this each slide
  // waits on its own download.
  useEffect(() => {
    if (photos.length < 2) return;
    const around = [
      photos[(photoIdx + 1) % photos.length]?.url,
      photos[(photoIdx - 1 + photos.length) % photos.length]?.url,
    ];
    for (const u of around) {
      if (u) {
        const img = new window.Image();
        img.src = u;
      }
    }
  }, [photoIdx, photos]);
  const hasPhone = Boolean(currentRow.phone);

  // Scroll-lock + Escape-para-cerrar: este modal no usa el <Modal> compartido
  // (el carrusel de fotos hace de "header" propio, no encaja en su prop
  // `title`), así que replica aquí lo mínimo que ese componente da gratis.
  // Si EditPhoneModal (hijo, vía showEditPhone) está abierto, dejamos que
  // Escape lo cierre a él primero en vez de cerrar este modal también.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !showEditPhone) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, showEditPhone]);

  async function handleAssign(advisorId: string) {
    setAssigning(true);
    setAssignError(null);
    const value = advisorId || null;
    const res = await assignParticular(currentRow.id, value);
    if (res.ok) {
      const name = value
        ? (staffOptions.find((s) => s.id === value)?.name ?? null)
        : null;
      setCurrentRow((prev) => ({ ...prev, assigned_to: value, assigned_name: name }));
      onAssigned?.(value, name);
    } else {
      console.error("[particulares] Error asignando:", res.error);
      setAssignError("No se pudo guardar la asignación. Inténtalo de nuevo.");
    }
    setAssigning(false);
  }

  // Estado de la conversión particular → propiedad (en Portales externos).
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ slug: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Retirar / reactivar manualmente (además de la baja automática del cron).
  const [togglingActive, setTogglingActive] = useState(false);

  async function handleToggleActive() {
    const next = !currentRow.is_active;
    setTogglingActive(true);
    try {
      const res = await setParticularActive(currentRow.id, next);
      if (res.ok) {
        const takenDownAt = next ? null : new Date().toISOString();
        setCurrentRow((prev) => ({
          ...prev,
          is_active: next,
          taken_down_at: takenDownAt,
        }));
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
      else setCreateError((res as any).error || "unknown_error");
    } catch {
      setCreateError("network_error");
    } finally {
      setCreating(false);
    }
  }

  const portalLabel =
    currentRow.portal.charAt(0).toUpperCase() + currentRow.portal.slice(1);

  function handlePhoneSaved(newPhone: string | null) {
    setCurrentRow({ ...currentRow, phone: newPhone });
    onPhoneUpdated?.(newPhone);
    setShowEditPhone(false);
  }

  // Verificación bajo demanda de ESTE anuncio: re-scrapea la ficha y llama
  // al endpoint AJAX "Ver teléfono" de Idealista. Si aparece teléfono, se
  // guarda y se refleja al instante.
  const [verifyingThis, setVerifyingThis] = useState(false);
  const [verifyThisResult, setVerifyThisResult] = useState<string | null>(null);

  async function handleVerifyThisPhone() {
    setVerifyingThis(true);
    setVerifyThisResult(null);
    try {
      const res = await fetch(
        `/api/admin/particulares/verify-phones?id=${currentRow.id}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (data?.ok && data.foundPhone) {
        // Actualización en el sitio (sin recargar): refresca el modal y la
        // tarjeta de la lista vía onPhoneUpdated.
        setCurrentRow((prev) => ({ ...prev, phone: data.foundPhone, chat_only: false }));
        onPhoneUpdated?.(data.foundPhone);
        setVerifyThisResult("✓ Teléfono encontrado y guardado.");
      } else if (data?.ok) {
        setVerifyThisResult(
          "El anuncio no expone teléfono en el portal (solo chat).",
        );
      } else {
        setVerifyThisResult("No se pudo verificar — reintenta en un momento.");
      }
    } catch {
      setVerifyThisResult("No se pudo verificar — reintenta en un momento.");
    } finally {
      setVerifyingThis(false);
    }
  }

  // Portal a document.body — igual que el Lightbox de PropertyGallery. Antes
  // este modal renderizaba inline, anidado varios niveles dentro del
  // contenedor flex-col de la página (page.tsx: `flex min-h-screen flex-col`).
  // WebKit/iOS tiene bugs conocidos donde un `fixed` anidado así de profundo
  // dentro de un flex container no siempre escapa al viewport real: en vez
  // de quedar fijo en pantalla, terminaba posicionándose relativo a la
  // altura TOTAL de ese contenedor (que crece con el listado + paginación +
  // pie de página), así que el contenido de la ficha aparecía "flotando" en
  // mitad de esa altura total en vez de sobre la pantalla — justo el bug
  // reportado ("el gráfico y la foto aparecen debajo del pie de página").
  // Un portal a <body> saca el modal de esa jerarquía por completo.
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
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-cream-50 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Foto + nav */}
        <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-ink/5">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ink/30">
              sin foto
            </div>
          )}

          {/* Prev / Next */}
          {photos.length > 1 && (
            <>
              <button
                aria-label="Foto anterior"
                onClick={() =>
                  setPhotoIdx((i) => (i === 0 ? photos.length - 1 : i - 1))
                }
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-ink/50 p-2 text-white hover:bg-ink/70"
              >
                ‹
              </button>
              <button
                aria-label="Foto siguiente"
                onClick={() =>
                  setPhotoIdx((i) => (i === photos.length - 1 ? 0 : i + 1))
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-ink/50 p-2 text-white hover:bg-ink/70"
              >
                ›
              </button>
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIdx(i)}
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      i === photoIdx ? "bg-white" : "bg-white/50",
                    )}
                  />
                ))}
              </div>
            </>
          )}

          {/* Badges */}
          <span className="absolute left-3 top-3 rounded-md bg-ink/85 px-2 py-0.5 crm-label-sm text-cream-50">
            {currentRow.operation === "rent" ? "Alquiler" : "Venta"}
          </span>
          <span className="absolute right-10 top-3 rounded-md bg-gold/90 px-2 py-0.5 crm-label-sm text-ink">
            {portalLabel}
          </span>

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-white/90 p-1 text-ink hover:bg-white"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Referencias (interna + externa) */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {currentRow.particular_reference && (
                <span className="rounded-md border border-gold/30 bg-gold/10 px-2.5 py-1 font-mono text-xs font-semibold tracking-wider text-gold-dark">
                  {currentRow.particular_reference}
                </span>
              )}
              <span className="rounded-md border border-ink/15 bg-ink/5 px-2.5 py-1 font-mono text-xs text-ink/60">
                {currentRow.portal.toUpperCase()}-{currentRow.external_id}
              </span>
            </div>
          </div>

          {/* Precio + zona */}
          <div>
            {/* Badge de baja — el dato se conserva pero el anuncio ya no está activo */}
            {!currentRow.is_active && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <span className="font-semibold">Anuncio retirado</span>
                {currentRow.taken_down_at && (
                  <span className="text-red-500">
                    · {DATE_FMT.format(new Date(currentRow.taken_down_at))}
                  </span>
                )}
                <span className="ml-auto text-xs text-red-400">
                  Datos conservados — puede volver a estar disponible
                </span>
                <button
                  onClick={handleToggleActive}
                  disabled={togglingActive}
                  className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                >
                  {togglingActive ? "Guardando…" : "Reactivar"}
                </button>
              </div>
            )}
            <p className="crm-number text-2xl text-ink">
              {currentRow.price != null
                ? `${formatPrice(currentRow.price)}${currentRow.operation === "rent" ? "/mes" : ""}`
                : "Precio no disponible"}
            </p>
            {/* Dirección exacta si existe (migración 0035); si no, la zona como antes */}
            {currentRow.address ? (
              <div className="mt-1 flex items-center gap-1 text-sm text-ink/60">
                <MapPin size={13} strokeWidth={1.75} className="text-gold" />
                <span>
                  {currentRow.address}
                  {currentRow.zone && currentRow.zone !== currentRow.address && (
                    <span className="text-ink/40"> · {currentRow.zone}</span>
                  )}
                </span>
              </div>
            ) : currentRow.zone ? (
              <div className="mt-1 flex items-center gap-1 text-sm text-ink/60">
                <MapPin size={13} strokeWidth={1.75} className="text-gold" />
                {currentRow.zone}
              </div>
            ) : null}
            <p className="mt-1 text-sm text-ink/50">
              {[
                currentRow.bedrooms != null ? `${currentRow.bedrooms} hab` : null,
                currentRow.bathrooms != null ? `${currentRow.bathrooms} baños` : null,
                currentRow.square_meters != null ? `${currentRow.square_meters} m²` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          {/* Mismo inmueble en otros portales / operaciones (migración 0176) */}
          <LinkedAdsSection rowId={currentRow.id} onChanged={() => router.refresh()} />

          {/* Ficha técnica — datos scrapeados de Idealista (bajo demanda) */}
          {(currentRow.price_per_m2 != null ||
            currentRow.previous_price != null ||
            currentRow.floor ||
            currentRow.has_lift != null ||
            currentRow.year_built != null ||
            currentRow.condition ||
            currentRow.orientation ||
            currentRow.energy_consumption ||
            currentRow.energy_emissions ||
            currentRow.reference) && (
            <div className="rounded-xl border border-gold/20 bg-white p-4">
              <p className="mb-3 crm-label-sm text-ink/40">Ficha técnica</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {currentRow.price_per_m2 != null && (
                  <div>
                    <dt className="text-ink/40">Precio/m²</dt>
                    <dd className="text-ink">{formatPrice(currentRow.price_per_m2)} €</dd>
                  </div>
                )}
                {currentRow.previous_price != null && (
                  <div>
                    <dt className="text-ink/40">Precio anterior</dt>
                    <dd className="text-ink">
                      {formatPrice(currentRow.previous_price)} €
                      {currentRow.price_drop_pct != null
                        ? ` (−${currentRow.price_drop_pct}%)`
                        : ""}
                    </dd>
                  </div>
                )}
                {currentRow.floor && (
                  <div>
                    <dt className="text-ink/40">Planta</dt>
                    <dd className="text-ink">{currentRow.floor}</dd>
                  </div>
                )}
                {currentRow.has_lift != null && (
                  <div>
                    <dt className="text-ink/40">Ascensor</dt>
                    <dd className="text-ink">{currentRow.has_lift ? "Sí" : "No"}</dd>
                  </div>
                )}
                {currentRow.year_built != null && (
                  <div>
                    <dt className="text-ink/40">Año construcción</dt>
                    <dd className="text-ink">{currentRow.year_built}</dd>
                  </div>
                )}
                {currentRow.condition && (
                  <div>
                    <dt className="text-ink/40">Estado</dt>
                    <dd className="text-ink">{currentRow.condition}</dd>
                  </div>
                )}
                {currentRow.orientation && (
                  <div>
                    <dt className="text-ink/40">Orientación</dt>
                    <dd className="text-ink">{currentRow.orientation}</dd>
                  </div>
                )}
                {currentRow.energy_consumption && (
                  <div>
                    <dt className="text-ink/40">Energía · consumo</dt>
                    <dd className="text-ink">{currentRow.energy_consumption}</dd>
                  </div>
                )}
                {currentRow.energy_emissions && (
                  <div>
                    <dt className="text-ink/40">Energía · emisiones</dt>
                    <dd className="text-ink">{currentRow.energy_emissions}</dd>
                  </div>
                )}
                {currentRow.reference && (
                  <div>
                    <dt className="text-ink/40">Referencia</dt>
                    <dd className="text-ink">{currentRow.reference}</dd>
                  </div>
                )}
              </dl>
              {currentRow.source_update_text && (
                <p className="mt-3 text-xs text-ink/40">
                  {currentRow.source_update_text}
                </p>
              )}
              {currentRow.advertiser_profile_url && (
                <a
                  href={currentRow.advertiser_profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-gold hover:underline"
                >
                  Ver perfil del anunciante ↗
                </a>
              )}
            </div>
          )}

          {/* Datos de contacto */}
          <div className="rounded-xl border border-gold/20 bg-white p-4">
            <p className="mb-3 crm-label-sm text-ink/40">
              Contacto · Particular
            </p>

            {currentRow.owner_name && (
              <p className="mb-3 font-medium text-ink">{currentRow.owner_name}</p>
            )}

            {hasPhone ? (
              <div className="space-y-2">
                <a
                  href={`tel:${currentRow.phone}`}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <Phone size={16} strokeWidth={2} />
                  Llamar · {formatPhone(currentRow.phone!)}
                  {/* Confianza de la extracción automática del teléfono (migración 0035).
                      Sin confianza (añadido a mano) no se muestra badge. */}
                  {currentRow.phone_confidence === "high" && (
                    <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      Verificado
                    </span>
                  )}
                  {currentRow.phone_confidence === "medium" && (
                    <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      Detectado
                    </span>
                  )}
                </a>
                <button
                  onClick={() => setShowEditPhone(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold/40 hover:bg-gold/5"
                >
                  Editar teléfono
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <a
                  href={currentRow.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold/40 hover:bg-gold/5"
                >
                  <MessageSquare size={16} strokeWidth={1.75} />
                  Contactar por chat
                  {currentRow.chat_only && (
                    <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      Solo disponible
                    </span>
                  )}
                </a>
                <button
                  onClick={() => setShowEditPhone(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold/50 hover:bg-gold/10"
                >
                  <Phone size={14} strokeWidth={1.75} />
                  Agregar teléfono
                </button>
                <button
                  onClick={handleVerifyThisPhone}
                  disabled={verifyingThis}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold/40 hover:bg-gold/5 disabled:opacity-60"
                >
                  {verifyingThis ? (
                    <><Loader2 size={14} className="animate-spin" /> Consultando el portal…</>
                  ) : (
                    <><RefreshCw size={14} strokeWidth={1.75} /> Verificar teléfono ahora</>
                  )}
                </button>
                {verifyThisResult && (
                  <p className="text-center text-xs text-ink/55">{verifyThisResult}</p>
                )}
              </div>
            )}
          </div>

          {/* Asignación — quién gestiona este anuncio (evita doble trabajo) */}
          <div className="rounded-xl border border-blue-200/60 bg-blue-50/40 p-4">
            <p className="mb-2 flex items-center gap-1.5 crm-label-sm text-ink/40">
              <UserCheck size={13} strokeWidth={2} className="text-blue-600" />
              Asignado a
            </p>
            <div className="flex items-center gap-2">
              <select
                value={currentRow.assigned_to ?? ""}
                onChange={(e) => handleAssign(e.target.value)}
                disabled={assigning || staffOptions.length === 0}
                className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none disabled:opacity-60"
              >
                <option value="">Sin asignar</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {assigning && <Loader2 size={16} className="animate-spin text-ink/40" />}
            </div>
            {assignError && (
              <p className="mt-1.5 text-xs text-red-600">{assignError}</p>
            )}
            {currentRow.last_contact_by && (
              <p className="mt-2 text-xs text-ink/55">
                Último contacto: <span className="font-medium text-ink/75">{currentRow.last_contact_by}</span>
                {currentRow.last_contact_at &&
                  ` · ${DATE_FMT.format(new Date(currentRow.last_contact_at))}`}
              </p>
            )}
          </div>

          {/* Registro de contactos CRM */}
          <div className="rounded-xl border border-ink/10 bg-ink/3 p-4">
            <ContactLog particularId={currentRow.id} />
          </div>

          {/* Historial de cambios (particulares_changes) + evolución del precio */}
          <div className="rounded-xl border border-ink/10 bg-ink/3 p-4">
            <ChangeHistory row={currentRow} />
          </div>

          {/* Mapa — prioridad: dirección exacta (puntito en el portal/número) →
              coordenadas de Idealista (lo más cercano al real) → zona. Compacto
              (h-36) para que no domine el modal. */}
          {(() => {
            const hasExact = isExactStreet(currentRow.address);
            const hasCoords =
              currentRow.latitude != null && currentRow.longitude != null;
            if (!hasExact && !hasCoords && !currentRow.address && !currentRow.zone) {
              return null;
            }
            return (
              <div>
                <p className="mb-2 crm-label-sm text-ink/40">
                  Ubicación
                </p>
                <div className="overflow-hidden rounded-lg border border-ink/10">
                  <div className="relative h-36 w-full bg-gray-100">
                    <iframe
                      title="Mapa de ubicación del anuncio"
                      width="100%"
                      height="100%"
                      style={{ border: "none" }}
                      src={
                        hasExact
                          ? // Dirección con calle/número → pin exacto en Google.
                            `https://maps.google.com/maps?q=${encodeURIComponent(
                              mapFallbackQuery(currentRow),
                            )}&output=embed&zoom=17`
                          : hasCoords
                            ? // Coordenadas de Idealista → marcador en OSM.
                              `https://www.openstreetmap.org/export/embed.html?bbox=${currentRow.longitude! - 0.002},${currentRow.latitude! - 0.002},${currentRow.longitude! + 0.002},${currentRow.latitude! + 0.002}&layer=mapnik&marker=${currentRow.latitude},${currentRow.longitude}`
                            : // Solo zona.
                              `https://maps.google.com/maps?q=${encodeURIComponent(
                                mapFallbackQuery(currentRow),
                              )}&output=embed&zoom=14`
                      }
                      allowFullScreen
                      loading="lazy"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 bg-white px-3 py-2 text-xs text-ink/50">
                    <MapPin size={11} strokeWidth={1.75} className="text-gold" />
                    {hasExact ? (
                      <>Dirección exacta · {currentRow.address}</>
                    ) : hasCoords ? (
                      <>Ubicación aproximada (Idealista){currentRow.zone ? ` · ${currentRow.zone}` : ""}</>
                    ) : (
                      <>Zona aproximada · {currentRow.zone}</>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Vídeo del anuncio (migración 0036) */}
          {currentRow.video_url && (
            <div>
              <p className="mb-2 crm-label-sm text-ink/40">
                Vídeo
              </p>
              {(() => {
                const videoInfo = detectVideoType(currentRow.video_url);
                if (videoInfo.type === "youtube" && videoInfo.id) {
                  return (
                    <iframe
                      src={getYoutubeEmbedUrl(videoInfo.id)}
                      className="w-full rounded-lg aspect-video"
                      allowFullScreen
                      loading="lazy"
                      title="YouTube video player"
                    />
                  );
                }
                if (videoInfo.type === "vimeo" && videoInfo.id) {
                  return (
                    <iframe
                      src={getVimeoEmbedUrl(videoInfo.id)}
                      className="w-full rounded-lg aspect-video"
                      allowFullScreen
                      loading="lazy"
                      title="Vimeo video player"
                    />
                  );
                }
                // Direct video file (MP4, WebM, etc.)
                return (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    controls
                    preload="none"
                    className="w-full rounded-lg"
                    src={currentRow.video_url}
                  />
                );
              })()}
            </div>
          )}

          {/* Plano de la vivienda (migración 0036) */}
          {currentRow.floor_plan_url && (
            <div>
              <p className="mb-2 crm-label-sm text-ink/40">
                Plano
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentRow.floor_plan_url}
                alt="Plano de la vivienda"
                className="w-full rounded-lg border border-ink/10 bg-white"
                loading="lazy"
              />
            </div>
          )}

          {/* Características */}
          {currentRow.features && currentRow.features.length > 0 && (
            <div>
              <p className="mb-2 crm-label-sm text-ink/40">
                Características
              </p>
              <div className="flex flex-wrap gap-1.5">
                {currentRow.features.map((f, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-xs text-ink/70"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Descripción */}
          {currentRow.description && (
            <div>
              <p className="mb-2 crm-label-sm text-ink/40">
                Descripción
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/75">
                {currentRow.description}
              </p>
            </div>
          )}

          {/* Acciones inferiores */}
          <div className="flex gap-2 border-t border-ink/8 pt-4">
            <a
              href={currentRow.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink/70 transition hover:border-gold/40 hover:text-ink"
            >
              <ExternalLink size={14} strokeWidth={1.75} />
              Ver en {portalLabel}
            </a>
            {/* Retirada manual: archiva el anuncio en el tab "Retirados" sin
                esperar a que el cron detecte el 404 en el portal. */}
            {currentRow.is_active && (
              <button
                onClick={handleToggleActive}
                disabled={togglingActive}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
              >
                <X size={14} strokeWidth={2} />
                {togglingActive ? "Guardando…" : "Marcar como retirado"}
              </button>
            )}
            {canCreateProperty && (
              created ? (
                <Link
                  href={`/admin/propiedades/${created.slug}`}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <Check size={14} strokeWidth={2} />
                  Propiedad creada · abrir ficha
                </Link>
              ) : (
                <button
                  onClick={handleCreateProperty}
                  disabled={creating}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink transition hover:bg-gold-dark disabled:opacity-60"
                >
                  <Plus size={14} strokeWidth={2} />
                  {creating ? "Creando…" : "Crear propiedad"}
                </button>
              )
            )}
          </div>
          {createError && (
            <p className="text-xs text-red-600">
              No se pudo crear la propiedad ({createError}). Inténtalo de nuevo.
            </p>
          )}

          {/* Link temporal externo — independiente de las acciones de arriba,
              ver el bloque "Link temporal externo" más arriba en el archivo. */}
          <ShareLinkAction particularId={currentRow.id} />
        </div>

        {/* Cerrar, fijo debajo del contenido con scroll (no dentro de él):
            la X de la esquina superior queda fuera del alcance del pulgar
            en pantallas grandes (iPhone 16 Pro Max) sujetando el móvil con
            una mano. Este botón vive al ras del borde inferior de la
            ficha, que sí cae dentro de esa zona. */}
        <div className="shrink-0 border-t border-ink/8 bg-cream-50 p-3">
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-cream-50 transition hover:bg-ink-soft"
          >
            <X size={16} strokeWidth={2} />
            Cerrar
          </button>
        </div>
      </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Listado principal ────────────────────────────────────────────────────────

