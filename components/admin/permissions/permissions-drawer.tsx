"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  History,
  Info,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { actionApplies, RESOURCE_WHERE, resourcesForCountry, ROLE_LABELS } from "@/lib/onboarding/guide";
import {
  ACTION_DESCRIPTIONS,
  ACTION_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  RESOURCE_LABELS,
  type PermissionAction,
  type PermissionResource,
} from "@/lib/permissions";
import type { InternalUser, InternalUserRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Toggle } from "./toggle";

// Mirrors the role badge styles used in usuarios-client.tsx
const ROLE_BADGE: Record<InternalUserRole, string> = {
  owner:        "border-violet-200 bg-violet-50 text-violet-700",
  admin:        "border-emerald-200 bg-emerald-50 text-emerald-700",
  advisor:      "border-blue-200 bg-blue-50 text-blue-700",
  client:       "border-amber-200 bg-amber-50 text-amber-700",
  viewer:       "border-ink/15 bg-ink/5 text-ink/65",
  agent_junior: "border-sky-200 bg-sky-50 text-sky-700",
  agent_senior: "border-indigo-200 bg-indigo-50 text-indigo-700",
  agent_admin:  "border-purple-200 bg-purple-50 text-purple-700",
  captadora:    "border-rose-200 bg-rose-50 text-rose-700",
};

const ROLE_LABEL: Record<InternalUserRole, string> = {
  owner:        "Propietario",
  admin:        "Administrador",
  advisor:      "Asesor",
  client:       "Cliente",
  viewer:       "Visualizador",
  agent_junior: "Agente Junior",
  agent_senior: "Agente Senior",
  agent_admin:  "Agente Admin",
  captadora:    "Captadora",
};

const COUNTRY_FLAG: Record<string, string> = { es: "🇪🇸", cl: "🇨🇱" };
const COUNTRY_NAME: Record<string, string> = { es: "España", cl: "Chile" };

// ── Historial de auditoría ───────────────────────────────────────────────────
interface AuditEntry {
  id: string;
  eventType: string;
  resource: string | null;
  action: string | null;
  country: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
  actor: { id: string | null; name: string | null; email: string | null };
}

// Etiqueta legible en español para cada tipo de evento.
const EVENT_LABEL: Record<string, string> = {
  role_changed: "Cambio de rol",
  country_changed: "Cambio de país",
  permissions_updated: "Permisos actualizados",
  user_created: "Usuario creado",
  country_roles_changed: "Rol por país",
  custom_role_changed: "Rol personalizado",
  email_changed: "Cambio de correo",
  password_changed: "Contraseña cambiada",
};

/** Fecha relativa breve en español (ej. "hace 5 min", "hace 2 d"). */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "hace un momento";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `hace ${diffHour} h`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 30) return `hace ${diffDay} d`;
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Nombre visible del actor de una entrada. */
function actorName(actor: AuditEntry["actor"]): string {
  return actor.name?.trim() || actor.email?.trim() || "Sistema";
}

/** Resumen breve de contexto (país / recurso·acción) para una entrada. */
function entryDetail(entry: AuditEntry): string | null {
  const parts: string[] = [];
  if (entry.country) parts.push(COUNTRY_NAME[entry.country] ?? entry.country);
  if (entry.resource) {
    parts.push(entry.action ? `${entry.resource}·${entry.action}` : entry.resource);
  }
  // Cambio de rol: mostramos old → new si están disponibles.
  if (entry.eventType === "role_changed") {
    const nv = entry.newValue as { role?: string } | null;
    const ov = entry.oldValue as { role?: string } | null;
    if (ov?.role || nv?.role) {
      parts.push(`${ov?.role ?? "—"} → ${nv?.role ?? "—"}`);
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

type Matrix = Record<PermissionResource, Record<PermissionAction, boolean>>;

/** Respuesta de GET /api/admin/usuarios/[id]/permissions. */
type Loaded = {
  /** Rol con el que se resuelve la matriz en este país (rol por país si lo hay). */
  effectiveRole: string;
  isCustomRole: boolean;
  country: string;
  /** Matriz del rol en este país, SIN excepciones. */
  base: Matrix;
  /** Lo que está guardado ahora (rol + excepciones). */
  saved: Matrix;
  /** Si quien mira puede cambiarlos, y si no, por qué. */
  editable: boolean;
  reason: string | null;
  /** Celdas que quien mira puede ENCENDER (no puede repartir lo que no tiene). */
  grantable: Matrix;
};

function toMatrix(raw: unknown): Matrix {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown>>;
  const out = {} as Matrix;
  for (const r of PERMISSION_RESOURCES) {
    out[r] = {} as Record<PermissionAction, boolean>;
    for (const a of PERMISSION_ACTIONS) out[r][a] = src[r]?.[a] === true;
  }
  return out;
}

function cloneMatrix(m: Matrix): Matrix {
  const out = {} as Matrix;
  for (const r of PERMISSION_RESOURCES) out[r] = { ...m[r] };
  return out;
}

function sameMatrix(a: Matrix, b: Matrix): boolean {
  return PERMISSION_RESOURCES.every((r) => PERMISSION_ACTIONS.every((x) => a[r][x] === b[r][x]));
}

interface PermissionsDrawerProps {
  user: InternalUser;
  /** Tope desde la página (p. ej. solo lectura). El servidor decide además si puede editar. */
  canEdit?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Panel «Permisos» de un usuario: tabla módulo × acción con interruptores.
 *
 * Trabaja SIEMPRE sobre un país (el menú y las APIs evalúan con el país activo,
 * ver lib/auth/guard.ts): el servidor devuelve la matriz del rol en ese país,
 * lo guardado, si quien mira puede editar y qué celdas puede encender. Lo que
 * se manda al guardar es la diferencia contra el rol; el servidor calcula las
 * filas de ese país (lib/auth/user-admin-rules.ts).
 */
export function PermissionsDrawer({ user, canEdit = true, onClose, onSaved }: PermissionsDrawerProps) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [info, setInfo] = useState<Loaded | null>(null);
  const [cells, setCells] = useState<Matrix | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ── Historial de auditoría ─────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditState, setAuditState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [historyReload, setHistoryReload] = useState(0);

  // ── País ───────────────────────────────────────────────────────────────────
  const countries = useMemo(() => {
    const list =
      user.roleKey === "owner" || user.roleKey === "admin"
        ? ["es", "cl"]
        : user.countries ?? (user.multiCountry ? ["es", "cl"] : user.country ? [user.country] : ["es"]);
    return list.filter((c) => c === "es" || c === "cl");
  }, [user.roleKey, user.countries, user.multiCountry, user.country]);
  const [activeCountry, setActiveCountry] = useState<string>(() =>
    user.country && (countries as string[]).includes(user.country) ? user.country : countries[0] ?? "es",
  );

  // ── Carga ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    (async () => {
      try {
        const res = await fetch(`/api/admin/usuarios/${user.id}/permissions?country=${activeCountry}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error ?? "No se pudieron cargar los permisos");
          setLoadState("error");
          return;
        }
        const loaded: Loaded = {
          effectiveRole: data.effectiveRole ?? data.role ?? user.roleKey,
          isCustomRole: Boolean(data.isCustomRole),
          country: data.country ?? activeCountry,
          base: toMatrix(data.roleDefaults),
          saved: toMatrix(data.effective),
          editable: Boolean(data.editable),
          reason: data.reason ?? null,
          grantable: toMatrix(data.grantable),
        };
        setInfo(loaded);
        setCells(cloneMatrix(loaded.saved));
        setLoadState("ready");
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Error de red");
        setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, user.roleKey, activeCountry, reloadKey]);

  useEffect(() => {
    if (!historyOpen) return;
    let cancelled = false;
    setAuditState("loading");
    (async () => {
      try {
        const res = await fetch(`/api/admin/usuarios/${user.id}/permissions/audit`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setAuditState("error");
          return;
        }
        setAuditEntries(Array.isArray(data.entries) ? data.entries : []);
        setAuditState("ready");
      } catch {
        if (!cancelled) setAuditState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyOpen, user.id, historyReload]);

  // ── Derivados ──────────────────────────────────────────────────────────────
  const editable = canEdit && Boolean(info?.editable);
  const resources = useMemo(() => resourcesForCountry(activeCountry), [activeCountry]);
  const dirty = Boolean(info && cells && !sameMatrix(cells, info.saved));

  /** Diferencia contra el rol: lo que se manda al guardar. */
  const overrides = useMemo(() => {
    if (!info || !cells) return [];
    const out: { resource: string; action: string; allowed: boolean }[] = [];
    for (const r of PERMISSION_RESOURCES) {
      for (const a of PERMISSION_ACTIONS) {
        if (cells[r][a] !== info.base[r][a]) out.push({ resource: r, action: a, allowed: cells[r][a] });
      }
    }
    return out;
  }, [cells, info]);
  const exceptionCount = overrides.length;

  /** ¿Se puede ENCENDER esta celda? (apagar siempre se puede) */
  const canTurnOn = useCallback(
    (r: PermissionResource, a: PermissionAction) => Boolean(info && (info.grantable[r][a] || info.saved[r][a])),
    [info],
  );

  // ── Cerrar con ESC ─────────────────────────────────────────────────────────
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Cerrar y descartarlos?")) return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [requestClose]);

  // ── Mutadores ──────────────────────────────────────────────────────────────
  const update = useCallback(
    (fn: (next: Matrix) => void) => {
      setCells((prev) => {
        if (!prev) return prev;
        const next = cloneMatrix(prev);
        fn(next);
        return next;
      });
      setSaveState("idle");
    },
    [],
  );

  const setCell = (r: PermissionResource, a: PermissionAction, v: boolean) =>
    update((m) => {
      if (v && !canTurnOn(r, a)) return;
      m[r][a] = v;
    });

  const rowAllOn = (r: PermissionResource) =>
    Boolean(cells) && PERMISSION_ACTIONS.filter((a) => actionApplies(r, a)).every((a) => cells![r][a]);

  const setRow = (r: PermissionResource, v: boolean) =>
    update((m) => {
      for (const a of PERMISSION_ACTIONS) {
        if (!actionApplies(r, a)) continue;
        if (v && !canTurnOn(r, a)) continue;
        m[r][a] = v;
      }
    });

  const columnAllOn = (a: PermissionAction) =>
    Boolean(cells) && resources.filter((r) => actionApplies(r, a)).every((r) => cells![r][a]);

  const toggleColumn = (a: PermissionAction) => {
    const v = !columnAllOn(a);
    update((m) => {
      for (const r of resources) {
        if (!actionApplies(r, a)) continue;
        if (v && !canTurnOn(r, a)) continue;
        m[r][a] = v;
      }
    });
  };

  const resetToRole = () => {
    if (!info) return;
    update((m) => {
      for (const r of PERMISSION_RESOURCES) {
        for (const a of PERMISSION_ACTIONS) {
          const v = info.base[r][a];
          if (v && !canTurnOn(r, a)) continue;
          m[r][a] = v;
        }
      }
    });
  };

  const discardChanges = () => {
    if (info) setCells(cloneMatrix(info.saved));
    setSaveState("idle");
  };

  const switchCountry = (c: string) => {
    if (c === activeCountry) return;
    if (dirty && !window.confirm(`Hay cambios sin guardar en ${COUNTRY_NAME[activeCountry]}. ¿Descartarlos?`)) {
      return;
    }
    setActiveCountry(c);
    setSaveState("idle");
  };

  // ── Guardar ────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!editable || !info) return;
    setSaveState("saving");
    setSaveError("");
    try {
      const res = await fetch(`/api/admin/usuarios/${user.id}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides, country: activeCountry }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error ?? "No se pudieron guardar los permisos");
        setSaveState("error");
        return;
      }
      setSaveState("success");
      onSaved?.();
      setHistoryReload((n) => n + 1);
      // Recarga lo guardado desde el servidor (fuente de verdad).
      setReloadKey((n) => n + 1);
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Error de red");
      setSaveState("error");
    }
  }, [editable, info, overrides, user.id, onSaved, activeCountry]);

  const baseRoleLabel = info
    ? info.isCustomRole
      ? "Rol personalizado"
      : ROLE_LABELS[info.effectiveRole] ?? info.effectiveRole
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/50 backdrop-blur-sm"
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Permisos de ${user.firstName} ${user.lastName}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-5xl flex-col bg-cream-50 shadow-2xl"
        style={{ animation: "perm-drawer-in 0.28s cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 border-b border-ink/10 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
              <ShieldCheck size={20} strokeWidth={1.75} className="text-blue-500" />
            </span>
            <div className="min-w-0">
              <h2 className="crm-section-title leading-tight text-ink">Permisos</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="truncate text-sm text-ink/70">
                  {user.firstName} {user.lastName}
                </span>
                <span
                  className={cn(
                    "inline-block rounded-md border px-2 py-0.5 text-xs font-medium",
                    ROLE_BADGE[user.roleKey],
                  )}
                >
                  {ROLE_LABEL[user.roleKey] ?? user.roleKey}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {countries.length > 1 && (
              <div className="inline-flex rounded-xl border border-ink/10 bg-white/70 p-0.5">
                {countries.map((c) => {
                  const active = c === activeCountry;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => switchCountry(c)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                        active ? "bg-ink text-cream-50" : "text-ink/60 hover:text-ink",
                      )}
                    >
                      <span>{COUNTRY_FLAG[c] ?? c}</span>
                      <span>{COUNTRY_NAME[c] ?? c}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={requestClose}
              aria-label="Cerrar"
              className="rounded-full p-1.5 text-ink/40 transition hover:bg-ink/5 hover:text-ink"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        {loadState === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink/55">
            <Loader2 size={28} className="animate-spin text-gold" />
            <p className="text-sm">Cargando permisos…</p>
          </div>
        )}

        {loadState === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
              <AlertCircle size={24} className="text-rose-500" />
            </span>
            <p className="text-sm font-medium text-ink">No se pudieron cargar los permisos</p>
            <p className="text-sm text-ink/55">{loadError}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-xl border border-ink/10 px-5 py-2 text-sm text-ink/65 transition hover:border-ink/20 hover:text-ink"
            >
              Cerrar
            </button>
          </div>
        )}

        {loadState === "ready" && info && cells && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              <p className="rounded-xl border border-gold/20 bg-gold/5 px-3.5 py-3 text-sm leading-relaxed text-ink/70">
                En <span className="font-medium text-ink">{COUNTRY_NAME[activeCountry]}</span> parte del rol{" "}
                <span className="font-medium text-ink">{baseRoleLabel}</span>. Cada interruptor que cambies
                respecto al rol es una <span className="font-medium text-ink">excepción</span> solo para esta
                persona{countries.length > 1 ? " y solo en este país" : ""}; se marca en dorado.
              </p>

              {!editable && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
                  <Lock size={15} className="mt-0.5 shrink-0" />
                  <span>{info.reason ?? "Solo lectura."}</span>
                </p>
              )}

              {/* Tabla de permisos */}
              <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white/60">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-left">
                      <th className="crm-table-header sticky left-0 z-10 bg-cream-50 px-4 py-3 text-ink/60">
                        Módulo
                      </th>
                      {PERMISSION_ACTIONS.map((a) => (
                        <th key={a} className="px-1 py-2 text-center">
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => toggleColumn(a)}
                            title={`${ACTION_DESCRIPTIONS[a]} — pulsa para ${columnAllOn(a) ? "quitarlo" : "darlo"} en toda la columna`}
                            className="crm-table-header rounded-md px-2 py-1 text-ink/60 transition hover:bg-ink/5 hover:text-ink disabled:cursor-default disabled:hover:bg-transparent"
                          >
                            {ACTION_LABELS[a]}
                          </button>
                        </th>
                      ))}
                      <th className="crm-table-header px-3 py-3 text-center text-ink/60">Todo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resources.map((r) => (
                      <tr key={r} className="border-b border-ink/8 last:border-0">
                        <td className="sticky left-0 z-10 bg-cream-50 px-4 py-2.5">
                          <p className="font-medium text-ink">{RESOURCE_LABELS[r]}</p>
                          <p className="max-w-[220px] text-xs text-ink/45">{RESOURCE_WHERE[r]}</p>
                        </td>
                        {PERMISSION_ACTIONS.map((a) => {
                          if (!actionApplies(r, a)) {
                            return (
                              <td key={a} className="bg-ink/[0.04] px-1 py-2.5 text-center text-ink/25" title="No aplica">
                                —
                              </td>
                            );
                          }
                          const on = cells[r][a];
                          const exception = on !== info.base[r][a];
                          const locked = !on && !canTurnOn(r, a);
                          return (
                            <td key={a} className="px-1 py-2 text-center">
                              <span
                                className={cn(
                                  "inline-flex items-center justify-center rounded-lg p-1.5",
                                  exception && "bg-gold/15 ring-1 ring-gold/50",
                                )}
                                title={
                                  locked
                                    ? "No puedes dar un permiso que tú no tienes"
                                    : `Por defecto del rol: ${info.base[r][a] ? "sí" : "no"}${exception ? " · excepción de esta persona" : ""}`
                                }
                              >
                                <Toggle
                                  checked={on}
                                  onChange={(v) => setCell(r, a, v)}
                                  disabled={!editable || locked}
                                  size="sm"
                                  aria-label={`${ACTION_LABELS[a]} en ${RESOURCE_LABELS[r]}`}
                                />
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center">
                          <Toggle
                            checked={rowAllOn(r)}
                            onChange={(v) => setRow(r, v)}
                            disabled={!editable}
                            size="sm"
                            aria-label={`Todos los permisos de ${RESOURCE_LABELS[r]}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink/55">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-5 rounded-full bg-gold" /> Tiene el permiso
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-4 w-4 rounded bg-gold/15 ring-1 ring-gold/50" /> Excepción (distinta del rol)
                </span>
                <span>— No aplica</span>
                <span className="flex items-center gap-1.5">
                  <Info size={12} /> Pulsa el nombre de una acción para cambiar toda la columna
                </span>
              </div>

              {/* Historial */}
              <div className="mt-5 overflow-hidden rounded-2xl border border-ink/10 bg-white/55">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((o) => !o)}
                  aria-expanded={historyOpen}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-cream-50/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/5">
                      <History size={16} strokeWidth={1.75} className="text-ink/55" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-ink">Historial</h3>
                      <p className="text-xs text-ink/55">Cambios de permisos, rol, país, correo y contraseña.</p>
                    </div>
                  </div>
                  <ChevronDown
                    size={18}
                    strokeWidth={2}
                    className={cn("shrink-0 text-ink/40 transition-transform", historyOpen && "rotate-180")}
                  />
                </button>

                {historyOpen && (
                  <div className="border-t border-ink/8 px-4 py-3">
                    {auditState === "loading" && (
                      <div className="flex items-center gap-2 py-3 text-sm text-ink/55">
                        <Loader2 size={15} className="animate-spin text-gold" />
                        Cargando historial…
                      </div>
                    )}
                    {auditState === "error" && <p className="py-3 text-sm text-ink/55">No se pudo cargar el historial.</p>}
                    {auditState === "ready" && auditEntries.length === 0 && (
                      <p className="py-3 text-sm text-ink/55">Sin cambios registrados todavía.</p>
                    )}
                    {auditState === "ready" && auditEntries.length > 0 && (
                      <ul className="space-y-2.5">
                        {auditEntries.map((entry) => {
                          const detail = entryDetail(entry);
                          return (
                            <li
                              key={entry.id}
                              className="flex items-start gap-3 rounded-xl border border-ink/8 bg-cream-50/50 px-3 py-2.5"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-sm font-medium text-ink">
                                    {EVENT_LABEL[entry.eventType] ?? entry.eventType}
                                  </span>
                                  {detail && (
                                    <span className="rounded bg-ink/5 px-1.5 py-px text-xs font-medium text-ink/60">
                                      {detail}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-xs text-ink/55">{actorName(entry.actor)}</p>
                              </div>
                              <span className="shrink-0 whitespace-nowrap text-xs text-ink/45">
                                {formatRelative(entry.createdAt)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Pie */}
            <div className="border-t border-ink/10 bg-cream-50 px-5 py-3.5 sm:px-6">
              {saveState === "error" && (
                <p className="mb-2.5 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <AlertCircle size={14} /> {saveError}
                </p>
              )}
              {saveState === "success" && (
                <p className="mb-2.5 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <Check size={14} /> Permisos guardados.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetToRole}
                    disabled={!editable || exceptionCount === 0 || saveState === "saving"}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-ink/10 px-3.5 py-2.5 text-sm font-medium text-ink/65 transition hover:border-ink/20 hover:text-ink disabled:opacity-40"
                  >
                    <RotateCcw size={14} strokeWidth={1.75} />
                    <span className="hidden sm:inline">Volver a los del rol</span>
                    <span className="sm:hidden">Rol</span>
                  </button>
                  {dirty && (
                    <button
                      type="button"
                      onClick={discardChanges}
                      disabled={saveState === "saving"}
                      className="rounded-xl px-3 py-2.5 text-sm text-ink/55 transition hover:text-ink disabled:opacity-40"
                    >
                      Descartar cambios
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink/55">
                    {exceptionCount === 0
                      ? "Sin excepciones: igual que su rol"
                      : `${exceptionCount} ${exceptionCount === 1 ? "excepción" : "excepciones"}`}
                    {dirty ? " · sin guardar" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!editable || !dirty || saveState === "saving"}
                    className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-40"
                  >
                    {saveState === "saving" ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Check size={15} strokeWidth={2} />
                    )}
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes perm-drawer-in {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
