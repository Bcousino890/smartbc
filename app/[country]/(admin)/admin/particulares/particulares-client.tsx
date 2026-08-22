"use client";

import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  ExternalLink,
  History,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  PhoneOff,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Sparkles,
  UserCheck,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { ZoneFilter, type ZoneFilterGroup } from "@/components/admin/particulares/zone-filter";
import { extractFloor } from "@/lib/floor";
import { extractFurnished } from "@/lib/furnished";
import { formatPrice } from "@/lib/format";
import { canAccess } from "@/lib/permissions";
import { detectVideoType, getYoutubeEmbedUrl, getVimeoEmbedUrl } from "@/lib/video-embed";
import { cn } from "@/lib/utils";
import {
  assignParticular,
  createParticularShareLink,
  createPropertyFromParticular,
  logParticularContact,
  setParticularActive,
  updateParticularPhone,
} from "./actions";
import { ANUNCIOS_POR_PAGINA } from "./constants";
import { useParticularesFilters } from "./use-particulares-filters";

export type StaffOption = { id: string; name: string };

export type ParticularChangeRow = {
  id: string;
  change_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_at: string;
};

export type ParticularRow = {
  id: string;
  portal: string;
  external_id: string;
  particular_reference: string | null;
  source_url: string;
  zone: string | null;
  price: number | null;
  operation: "rent" | "sale" | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  description: string | null;
  /**
   * Portada del anuncio. Es lo único que trae el listado: la galería completa
   * la carga el modal al abrirse (ver /api/admin/particulares/detail), porque
   * mandar los 30+ `photos` de cada fila colgaba la página.
   */
  cover_url: string | null;
  /** Solo presente una vez el modal ha cargado el detalle. */
  photos?: Array<{ url: string; alt?: string }> | null;
  features: string[] | null;
  owner_name: string | null;
  phone: string | null;
  chat_only: boolean | null;
  latitude: number | null;
  longitude: number | null;
  // Campos de la migración 0035 — pueden venir undefined/null si aún no está aplicada
  address?: string | null;
  phone_confidence?: "high" | "medium" | "low" | null;
  advertiser_type?: string | null;
  // Campos de la migración 0036 (plano + vídeo) — pueden venir undefined/null
  has_floor_plan?: boolean | null;
  floor_plan_url?: string | null;
  has_video?: boolean | null;
  video_url?: string | null;
  detected_at?: string | null;
  created_at: string | null;
  taken_down_at: string | null;
  is_active: boolean;
  // Gestión interna (enriquecido en el servidor — ver lib/db/queries/particulares.ts)
  assigned_to?: string | null;
  assigned_name?: string | null;
  last_contact_at?: string | null;
  last_contact_by?: string | null;
  last_contact_type?: string | null;
  contact_count?: number;
};

// timeZone fijo a Madrid: sin él, el servidor (VPS en UTC) y el navegador
// (hora local) formatean la hora distinto y React lanza el error de
// hidratación #418 ("text content does not match").
const DATE_FMT = new Intl.DateTimeFormat("es-ES", {
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
function formatPhone(phone: string | null | undefined): string {
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

function ParticularModal({
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
  const [photoIdx, setPhotoIdx] = useState(0);
  const [currentRow, setCurrentRow] = useState(row);
  const [showEditPhone, setShowEditPhone] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // El listado solo trae la portada. Al abrir el modal se pide la galería
  // completa, así que hasta que llegue se muestra la portada como única foto.
  useEffect(() => {
    let cancelled = false;
    if (currentRow.photos) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/particulares/detail?id=${encodeURIComponent(row.id)}`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (Array.isArray(data.photos)) {
          setCurrentRow((prev) => ({ ...prev, photos: data.photos }));
        }
      } catch {
        // Sin galería: se queda la portada. No merece romper el modal.
      }
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

  return (
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
    </>
  );
}

// ─── Listado principal ────────────────────────────────────────────────────────

type RefreshState = "idle" | "loading" | "done" | "error";

export function ParticularesClient({
  rows,
  total,
  page,
  activeTotal,
  retiredTotal,
  zoneGroups,
  currentRole,
  currentUserId,
  staffOptions = [],
}: {
  /** Página actual YA filtrada y paginada por el servidor (ver page.tsx). */
  rows: ParticularRow[];
  /** Total exacto para el filtro/pestaña actuales — salvo cuando hay planta,
   *  amueblado o gestión "contactados"/"sin gestionar" activos: esos se
   *  resuelven tras traer la página (ver `hasClientOnlyFilter` abajo), así
   *  que `total` pasa a ser una cota superior, no un conteo exacto. */
  total: number;
  /** Página actual (1-based), reflejada en la URL (?page=). */
  page: number;
  activeTotal: number;
  retiredTotal: number;
  zoneGroups: ZoneFilterGroup[];
  currentRole?: string;
  currentUserId?: string;
  staffOptions?: StaffOption[];
}) {
  // Filtros sincronizados con la URL (persisten al refrescar, se pueden
  // compartir por link, y el botón "atrás" del navegador los recorre).
  const {
    query,
    setQuery,
    operation,
    setOperation,
    zone,
    setZone,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    bedrooms,
    setBedrooms,
    floorMin,
    setFloorMin,
    areaMin,
    setAreaMin,
    last24h,
    setLast24h,
    phoneFilter,
    setPhoneFilter,
    gestion,
    setGestion,
    advertiser,
    setAdvertiser,
    furnished,
    setFurnished,
    showRetired,
    setShowRetired,
  } = useParticularesFilters();
  const [pageRows, setPageRows] = useState(rows);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [refreshResult, setRefreshResult] = useState<{ updated: number; checked: number } | null>(null);
  // Verificación de teléfonos contra el portal (endpoint verify-phones).
  const [verifying, setVerifying] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Transición de "ir a otra página": la paginación ya no trocea en memoria,
  // pide la página al servidor — esto solo pinta un estado de carga breve
  // mientras esa respuesta llega.
  const [pageNavPending, startPageNav] = useTransition();

  // Ficha abierta = una entrada de historial (?ficha=<id>), no solo estado
  // local: así el gesto nativo de "atrás" de iOS Safari cierra la ficha y
  // vuelve al listado con sus filtros intactos, en vez de navegar fuera de
  // la página entera (antes con useState puro, "volver" en el móvil se
  // salía de /admin/particulares y parecía "borrar" el listado). `selected`
  // se deriva de la página actual — si el id no está en `pageRows` (enlace
  // caducado o página distinta), simplemente no hay nada que abrir.
  const fichaId = searchParams.get("ficha");
  const selected = fichaId ? (pageRows.find((r) => r.id === fichaId) ?? null) : null;

  function openParticular(row: ParticularRow) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ficha", row.id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Deshace exactamente el push de openParticular — mismo efecto que el
  // gesto de "atrás", lo dispare el usuario con la X, el fondo o el botón
  // "Cerrar" de abajo.
  function closeParticular() {
    router.back();
  }

  // Sincronizar con los datos frescos del servidor: cambio de filtro/página
  // (page.tsx vuelve a renderizar con las searchParams nuevas) o
  // router.refresh() tras una acción en bloque (verificar/actualizar teléfonos).
  useEffect(() => {
    setPageRows(rows);
  }, [rows]);

  // Planta por anuncio, deducida de features/descripción (lib/floor.ts). Solo
  // sobre la página actual: filtrar por planta ya no puede recorrer el
  // listado entero (ver el comentario de ParticularesFilters en
  // lib/db/queries/particulares.ts — es fuzzy, no una columna).
  const floorById = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const r of pageRows) {
      map.set(r.id, extractFloor(r.features, r.description));
    }
    return map;
  }, [pageRows]);

  // Amueblado, deducido igual que la planta (no hay columna en BD — ver
  // lib/furnished.ts). Mismo alcance: solo la página actual.
  const furnishedById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof extractFurnished>>();
    for (const r of pageRows) {
      map.set(r.id, extractFurnished(r.features, r.description));
    }
    return map;
  }, [pageRows]);

  // Post-filtro sobre la página que ya llegó filtrada del servidor: texto,
  // zona, precio, habitaciones, m², teléfono, anunciante, últimas 24h y la
  // mayor parte de "gestión" ya vinieron resueltos en `rows` (ver
  // getParticularesPage()/ParticularesFilters). Solo quedan planta y
  // amueblado (se deducen de texto libre, no son columna) y lo de "gestión"
  // que SQL no puede resolver sin un JOIN a particulares_contacts
  // (contact_count). Con cualquiera de estos activo, esta página puede
  // devolver MENOS de ANUNCIOS_POR_PAGINA resultados aunque queden más
  // páginas por delante — tradeoff aceptado frente a traer toda la tabla
  // para filtrar exacto.
  const visibleRows = useMemo(() => {
    const fMin = floorMin ? Number(floorMin) : null;
    return pageRows.filter((r) => {
      if (fMin != null) {
        const fl = floorById.get(r.id);
        if (fl == null || fl < fMin) return false;
      }
      if (furnished && furnishedById.get(r.id) !== furnished) return false;
      if (gestion === "contacted" && (r.contact_count ?? 0) === 0) return false;
      if (gestion === "unmanaged" && (r.contact_count ?? 0) > 0) return false;
      return true;
    });
  }, [pageRows, floorMin, floorById, furnished, furnishedById, gestion]);

  const hasClientOnlyFilter =
    Boolean(floorMin) || Boolean(furnished) || gestion === "contacted" || gestion === "unmanaged";

  // Paginación: ya no es un slice() en memoria — `page`/`rows` vienen del
  // servidor (page.tsx lee ?page= y pide esa página con getParticularesPage).
  const totalPages = Math.max(1, Math.ceil(total / ANUNCIOS_POR_PAGINA));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const showingFrom = visibleRows.length === 0 ? 0 : (currentPage - 1) * ANUNCIOS_POR_PAGINA + 1;
  const showingTo = showingFrom === 0 ? 0 : showingFrom + visibleRows.length - 1;

  // Ir a otra página: navega vía URL en vez de recortar `filtered` en
  // memoria. Solo se toca "page" — el resto de parámetros se preserva tal
  // cual; cambiar cualquier OTRO filtro ya limpia "page" solo, porque
  // use-particulares-filters.ts reconstruye la querystring desde sus propias
  // claves cada vez que algo cambia (ver flush() ahí).
  function goToPage(n: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (n <= 1) params.delete("page");
    else params.set("page", String(n));
    const qs = params.toString();
    startPageNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Verificar teléfonos contra el portal: revisa hasta 30 anuncios y
  // actualiza teléfono / chat_only según lo que devuelva el endpoint.
  async function handleVerifyPhones() {
    setVerifying(true);
    try {
      const res = await fetch(
        "/api/admin/particulares/verify-phones?mode=all&limit=30",
        { method: "POST" },
      );
      const data = await res.json();
      if (res.ok && data.ok) {
        toast(
          `Verificados ${data.checked} anuncios · ${data.withPhone} con teléfono · ${data.updated} actualizados`,
          "success",
        );
        // Recargar los datos del servidor para reflejar los cambios.
        router.refresh();
      } else {
        toast("No se pudieron verificar los teléfonos. Inténtalo de nuevo.", "error");
      }
    } catch {
      toast("No se pudieron verificar los teléfonos (network_error). Inténtalo de nuevo.", "error");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRefreshPhones() {
    setRefreshState("loading");
    setRefreshResult(null);
    try {
      const res = await fetch("/api/admin/particulares/refresh-phones", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setRefreshResult({ updated: data.updated, checked: data.checked });
        setRefreshState("done");
        setTimeout(() => setRefreshState("idle"), 8000);
        // Igual que "Verificar teléfonos": recargar del servidor para que las
        // cards reflejen los teléfonos nuevos sin esperar a un reload manual.
        if (data.updated > 0) router.refresh();
      } else {
        setRefreshState("error");
        setTimeout(() => setRefreshState("idle"), 5000);
      }
    } catch {
      setRefreshState("error");
      setTimeout(() => setRefreshState("idle"), 5000);
    }
  }


  // Copiar teléfono al portapapeles: antes cada uno de los 2 botones de la
  // card (badge sobre la foto + pill debajo) tenía su propia regex de
  // limpieza ligeramente distinta. Un solo punto de verdad acá.
  function handleCopyPhone(phone: string, id: string) {
    const digits = phone.replace(/[\s\-().]/g, "");
    navigator.clipboard.writeText(digits).catch(() => {});
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  }

  function handlePhoneUpdated(newPhone: string | null) {
    // `selected` se deriva de `pageRows`: basta con actualizar aquí para que
    // tanto el listado como la ficha abierta reflejen el cambio.
    setPageRows((prev) =>
      prev.map((r) =>
        selected && r.id === selected.id ? { ...r, phone: newPhone } : r,
      ),
    );
  }

  return (
    <>
      {/* Modal */}
      {selected && (
        <ParticularModal
          row={selected}
          onClose={closeParticular}
          onPhoneUpdated={handlePhoneUpdated}
          onAssigned={(advisorId, advisorName) => {
            setPageRows((prev) =>
              prev.map((r) =>
                r.id === selected.id
                  ? { ...r, assigned_to: advisorId, assigned_name: advisorName }
                  : r,
              ),
            );
          }}
          onActiveChanged={(active, takenDownAt) => {
            setPageRows((prev) =>
              prev.map((r) =>
                r.id === selected.id
                  ? { ...r, is_active: active, taken_down_at: takenDownAt }
                  : r,
              ),
            );
          }}
          staffOptions={staffOptions}
          canCreateProperty={!currentRole || canAccess(currentRole, "properties", "create")}
        />
      )}

      <section className="mt-5 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
            <Search size={15} strokeWidth={1.75} className="text-ink/45" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por zona, descripción o ref…"
              className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
            />
          </label>
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value as typeof operation)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Operación: todas</option>
            <option value="rent">Alquiler</option>
            <option value="sale">Venta</option>
          </select>
          <ZoneFilter groups={zoneGroups} value={zone} onChange={setZone} />
          <select
            value={gestion}
            onChange={(e) => setGestion(e.target.value as typeof gestion)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Gestión: todos</option>
            <option value="unmanaged">Sin gestionar</option>
            <option value="contacted">Ya contactados</option>
            <option value="assigned">Asignados</option>
            {currentUserId && <option value="mine">Asignados a mí</option>}
          </select>
          <select
            value={advertiser}
            onChange={(e) => setAdvertiser(e.target.value as typeof advertiser)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Anunciante: todos</option>
            <option value="particular">Particular</option>
            <option value="professional">Profesional</option>
            <option value="unknown">Desconocido</option>
          </select>
          <select
            value={furnished}
            onChange={(e) => setFurnished(e.target.value as typeof furnished)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Amueblado: todos</option>
            <option value="yes">Amueblado</option>
            <option value="no">Sin amueblar</option>
          </select>
          <input
            type="number"
            inputMode="numeric"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="€ mín"
            className="w-24 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <input
            type="number"
            inputMode="numeric"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="€ máx"
            className="w-24 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <select
            value={bedrooms}
            onChange={(e) => setBedrooms(e.target.value)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Hab: todas</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
          <select
            value={floorMin}
            onChange={(e) => setFloorMin(e.target.value)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Planta: todas</option>
            <option value="1">1ª o más</option>
            <option value="2">2ª o más</option>
            <option value="3">3ª o más</option>
            <option value="4">4ª o más</option>
            <option value="5">5ª o más</option>
            <option value="6">6ª o más</option>
          </select>
          <input
            type="number"
            inputMode="numeric"
            value={areaMin}
            onChange={(e) => setAreaMin(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="m² mín"
            className="w-24 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setLast24h((v) => !v)}
            className={
              last24h
                ? "rounded-lg border border-gold bg-gold/15 px-3 py-2 text-sm font-medium text-gold-dark"
                : "rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink/70 transition hover:border-gold/40"
            }
          >
            Últimas 24h
          </button>
          <select
            value={phoneFilter}
            onChange={(e) => setPhoneFilter(e.target.value as typeof phoneFilter)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Teléfono: todos</option>
            <option value="with_phone">Con teléfono</option>
            <option value="no_phone">Sin teléfono</option>
          </select>
          <button
            type="button"
            onClick={handleRefreshPhones}
            disabled={refreshState === "loading"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              refreshState === "loading"
                ? "border border-gold/40 bg-gold/10 text-gold-dark opacity-80 cursor-wait"
                : refreshState === "done"
                ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                : refreshState === "error"
                ? "border border-red-300 bg-red-50 text-red-700"
                : "border border-ink/10 bg-white/85 text-ink/70 hover:border-gold/40 hover:bg-gold/5"
            )}
          >
            {refreshState === "loading" ? (
              <><Loader2 size={13} className="animate-spin" /> Actualizando…</>
            ) : refreshState === "done" ? (
              <><Check size={13} strokeWidth={2} /> {refreshResult?.updated ?? 0} teléfonos nuevos</>
            ) : refreshState === "error" ? (
              <>Error — reintentar</>
            ) : (
              <><RefreshCw size={13} strokeWidth={1.75} /> Actualizar teléfonos</>
            )}
          </button>
          <button
            type="button"
            onClick={handleVerifyPhones}
            disabled={verifying}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              verifying
                ? "border border-emerald-300 bg-emerald-50 text-emerald-700 opacity-80 cursor-wait"
                : "border border-ink/10 bg-white/85 text-ink/70 hover:border-emerald-300 hover:bg-emerald-50",
            )}
          >
            {verifying ? (
              <><Loader2 size={13} className="animate-spin" /> Verificando…</>
            ) : (
              <><Phone size={13} strokeWidth={1.75} /> Verificar teléfonos</>
            )}
          </button>
          <span className="ml-auto text-xs text-ink/55">
            {total} anuncios · {pageRows.filter((r) => r.phone).length} con teléfono en esta página
          </span>
        </div>

        {/* Apartados: Activos / Retirados. Los retirados se conservan en BD
            con todos sus datos (precio, fotos, historial) — solo dejan de
            estar publicados en el portal de origen. */}
        <div className="mt-4 flex items-center gap-1 rounded-xl border border-ink/10 bg-white/60 p-1 w-fit">
          <button
            type="button"
            onClick={() => setShowRetired(false)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition",
              !showRetired
                ? "bg-ink text-cream-50 shadow-sm"
                : "text-ink/60 hover:text-ink",
            )}
          >
            Activos ({activeTotal})
          </button>
          <button
            type="button"
            onClick={() => setShowRetired(true)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition",
              showRetired
                ? "bg-red-600 text-white shadow-sm"
                : "text-ink/60 hover:text-red-700",
            )}
          >
            Retirados ({retiredTotal})
          </button>
        </div>

        {/* Grid */}
        {visibleRows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-gold/15 bg-white/40 px-4 py-12 text-center text-ink/55">
            {showRetired
              ? "No hay anuncios retirados."
              : "No hay anuncios de particulares todavía. El scraper los detecta automáticamente cada hora."}
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleRows.map((r) => {
              const cover = r.cover_url ?? r.photos?.[0]?.url;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openParticular(r)}
                  className="group flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-white text-left transition hover:border-gold/50 hover:shadow-[0_12px_30px_-18px_rgba(40,28,10,0.35)]"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink/5">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-ink/30">
                        sin foto
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-md bg-ink/85 px-2 py-0.5 crm-label-sm text-cream-50">
                      {r.operation === "rent" ? "Alquiler" : "Venta"}
                    </span>
                    <span className="absolute right-2 top-2 rounded-md bg-gold/90 px-2 py-0.5 crm-label-sm text-ink">
                      {r.portal}
                    </span>
                    {/* Badge de retirado */}
                    {!r.is_active && (
                      <span className="absolute inset-0 flex items-center justify-center bg-ink/30">
                        <span className="rounded-md bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow">
                          Retirado
                        </span>
                      </span>
                    )}
                    {/* Etiqueta de teléfono: verde con número (copiar al pulsar),
                        ámbar "Solo chat" o gris "Sin teléfono" */}
                    {r.phone ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyPhone(r.phone!, r.id);
                        }}
                        className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700"
                      >
                        {copiedPhoneId === r.id ? (
                          <>
                            <Check size={10} strokeWidth={2.5} />
                            ¡Copiado!
                          </>
                        ) : (
                          <>
                            <Phone size={10} strokeWidth={2} />
                            {formatPhone(r.phone)}
                            {/* Check pequeño cuando la extracción es de confianza alta */}
                            {r.phone_confidence === "high" && (
                              <Check size={10} strokeWidth={2.5} className="text-emerald-200" />
                            )}
                          </>
                        )}
                      </button>
                    ) : r.chat_only ? (
                      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-xs font-semibold text-white">
                        <MessageSquare size={10} strokeWidth={1.75} />
                        Solo chat
                      </span>
                    ) : (
                      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-ink/55 px-2 py-0.5 text-xs font-semibold text-white">
                        <PhoneOff size={10} strokeWidth={1.75} />
                        Sin teléfono
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-ink/60">
                      <MapPin size={12} strokeWidth={1.75} className="text-gold" />
                      <span>{r.zone ?? "Madrid"}</span>
                    </div>
                    {/* Dirección exacta (si el scraper la trae) — ayuda a ubicar el piso sin abrir el modal */}
                    {r.address && (
                      <p className="mt-0.5 truncate text-xs text-ink/50" title={r.address}>
                        {r.address}
                      </p>
                    )}
                    <p className="mt-1 crm-section-title text-ink">
                      {r.price != null
                        ? `${formatPrice(r.price)}${r.operation === "rent" ? "/mes" : ""}`
                        : "Precio n/d"}
                    </p>
                    <p className="mt-1 text-xs text-ink/60">
                      {[
                        r.bedrooms != null ? `${r.bedrooms} hab` : null,
                        r.bathrooms != null ? `${r.bathrooms} baños` : null,
                        r.square_meters != null ? `${r.square_meters} m²` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {/* Gestión: quién lo tiene asignado y quién lo contactó.
                        Evita que dos asesores trabajen el mismo anuncio.
                        + extras multimedia (vídeo / plano, migración 0036). */}
                    {(r.assigned_name || r.last_contact_by || (!r.is_active && r.taken_down_at) || r.has_video || r.video_url || r.has_floor_plan || r.floor_plan_url) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(r.has_video || r.video_url) && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink/60">
                            <Video size={10} strokeWidth={2} />
                            Vídeo
                          </span>
                        )}
                        {(r.has_floor_plan || r.floor_plan_url) && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink/60">
                            <Ruler size={10} strokeWidth={2} />
                            Plano
                          </span>
                        )}
                        {r.assigned_name && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                            <UserCheck size={10} strokeWidth={2} />
                            {r.assigned_name}
                          </span>
                        )}
                        {r.last_contact_by && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                            <ClipboardList size={10} strokeWidth={2} />
                            Contactado · {r.last_contact_by}
                            {r.last_contact_at &&
                              ` · ${DATE_FMT.format(new Date(r.last_contact_at))}`}
                          </span>
                        )}
                        {!r.is_active && r.taken_down_at && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                            Retirado · {DATE_FMT.format(new Date(r.taken_down_at))}
                          </span>
                        )}
                      </div>
                    )}
                    {r.phone && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyPhone(r.phone!, r.id);
                        }}
                        className="mt-2 flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        {copiedPhoneId === r.id ? (
                          <>
                            <Check size={12} strokeWidth={2.5} />
                            ¡Copiado!
                          </>
                        ) : (
                          <>
                            <Copy size={12} strokeWidth={1.75} />
                            {formatPhone(r.phone)}
                          </>
                        )}
                      </button>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-3 text-xs text-ink/45">
                      <span className="flex items-center gap-1.5">
                        {r.particular_reference ? (
                          <span className="font-mono font-semibold text-gold-dark/70">{r.particular_reference}</span>
                        ) : (
                          r.created_at ? DATE_FMT.format(new Date(r.created_at)) : ""
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 text-gold-dark group-hover:underline">
                        Ver detalles
                        <ExternalLink size={11} strokeWidth={1.75} />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
            </div>

            {/* Paginación server-side: cada página se pide al servidor (ver
                goToPage) en vez de trocear un array ya cargado entero. */}
            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1 || pageNavPending}
                  className="flex items-center gap-1.5 rounded-xl border border-gold/30 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-gold/60 hover:bg-gold/5 disabled:opacity-40 disabled:hover:border-gold/30 disabled:hover:bg-white"
                >
                  <ChevronLeft size={14} strokeWidth={2} />
                  Anterior
                </button>
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink/70">
                  Página {currentPage} de {totalPages}
                  {pageNavPending && <Loader2 size={13} className="animate-spin text-ink/40" />}
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages || pageNavPending}
                  className="flex items-center gap-1.5 rounded-xl border border-gold/30 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-gold/60 hover:bg-gold/5 disabled:opacity-40 disabled:hover:border-gold/30 disabled:hover:bg-white"
                >
                  Siguiente
                  <ChevronRight size={14} strokeWidth={2} />
                </button>
              </div>
              <p className="text-xs text-ink/50">
                Mostrando {showingFrom}–{showingTo} de {total} anuncios
                {hasClientOnlyFilter && " (planta/amueblado/gestión pueden dejar menos de una página completa)"}
              </p>
            </div>

          </>
        )}
      </section>
    </>
  );
}
