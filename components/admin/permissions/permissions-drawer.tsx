"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  Eye,
  History,
  Loader2,
  Lock,
  Pencil,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACTION_LABELS,
  canAccess,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  RESOURCE_LABELS,
  type PermissionAction,
  type PermissionResource,
} from "@/lib/permissions";
import { roleDetail, roleLabel } from "@/lib/auth/role-model";
import {
  buildScopeOverrides,
  cloneScopes,
  countScopeDiffs,
  scopesEqual,
  setScopeCell,
  type ScopeKind,
  type ScopeMatrix,
  type ScopeValue,
  type ScopedResource,
} from "@/lib/permissions-scope";
import type { InternalUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PermissionMatrix } from "./permission-matrix";
import {
  getPermissionAreas,
  summarizePermissions,
  type CellMatrix,
  type PermissionArea,
} from "./permission-areas";
import { RoleBadge } from "./role-badge";

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

// Etiqueta legible en español para cada tipo de evento (todos los que escribe
// `logPermissionEvent`: si falta uno aquí, el historial enseñaría el código crudo).
const EVENT_LABEL: Record<string, string> = {
  role_changed: "Cambio de perfil",
  country_changed: "Cambio de país",
  permissions_updated: "Permisos actualizados",
  user_created: "Cuenta creada",
  password_reset_sent: "Enlace de contraseña enviado",
  email_changed: "Correo de acceso cambiado",
  user_suspended: "Cuenta suspendida",
  user_reactivated: "Cuenta reactivada",
  infra_action: "Acción de infraestructura",
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

/** «Asesor · Solo su cartera», sin el «(heredado)» del matiz. */
function roleName(role: string | undefined): string {
  if (!role) return "—";
  const detail = roleDetail(role)?.replace(/\s*\(heredado\)\s*$/i, "");
  return detail ? `${roleLabel(role)} · ${detail}` : roleLabel(role);
}

/** Resumen breve de contexto (país / sección·acción / cambio) para una entrada. */
function entryDetail(entry: AuditEntry): string | null {
  const parts: string[] = [];
  if (entry.country) parts.push(COUNTRY_NAME[entry.country] ?? entry.country);
  if (entry.resource) {
    const res = RESOURCE_LABELS[entry.resource as PermissionResource] ?? entry.resource;
    const act = entry.action ? ACTION_LABELS[entry.action as PermissionAction] ?? entry.action : null;
    parts.push(act ? `${res} · ${act}` : res);
  }
  if (entry.eventType === "role_changed") {
    const nv = entry.newValue as { role?: string } | null;
    const ov = entry.oldValue as { role?: string } | null;
    if (ov?.role || nv?.role) parts.push(`${roleName(ov?.role)} → ${roleName(nv?.role)}`);
  }
  if (entry.eventType === "permissions_updated") {
    const nv = entry.newValue as { overrideCount?: number } | null;
    if (typeof nv?.overrideCount === "number") {
      parts.push(
        nv.overrideCount === 0
          ? "sin excepciones"
          : `${nv.overrideCount} ${nv.overrideCount === 1 ? "excepción" : "excepciones"}`,
      );
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

type PermValue = true | false | "override_true" | "override_false";
type PermMatrix = Record<string, Record<string, PermValue>>;

interface PermissionsDrawerProps {
  user: InternalUser;
  /** Whether the current admin can persist changes (POST). */
  canEdit?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const cloneMatrix = (m: CellMatrix): CellMatrix => {
  const next = {} as CellMatrix;
  for (const r of PERMISSION_RESOURCES) next[r] = { ...m[r] };
  return next;
};

function sameMatrix(a: CellMatrix, b: CellMatrix): boolean {
  return PERMISSION_RESOURCES.every((r) => PERMISSION_ACTIONS.every((x) => a[r][x] === b[r][x]));
}

function buildStates(
  perms: PermMatrix,
  role: string,
  roleDefaults?: PermMatrix,
): { effective: CellMatrix; defaults: CellMatrix } {
  const effective = {} as CellMatrix;
  const defaults = {} as CellMatrix;
  for (const resource of PERMISSION_RESOURCES) {
    effective[resource] = {} as Record<PermissionAction, boolean>;
    defaults[resource] = {} as Record<PermissionAction, boolean>;
    for (const action of PERMISSION_ACTIONS) {
      const raw = perms[resource]?.[action];
      effective[resource][action] = raw === true || raw === "override_true";
      // La base "modificado"/"restablecer" viene del servidor (`roleDefaults`, ver
      // resolveBaseMatrix): es la única fuente correcta cuando la persona tiene rol
      // personalizado o rol por país, que `canAccess(role, ...)` (estático) no conoce.
      const fromServer = roleDefaults?.[resource]?.[action];
      defaults[resource][action] =
        typeof fromServer === "boolean" ? fromServer : canAccess(role, resource, action);
    }
  }
  return { effective, defaults };
}

export function PermissionsDrawer({
  user,
  canEdit = true,
  onClose,
  onSaved,
}: PermissionsDrawerProps) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  const [effective, setEffective] = useState<CellMatrix | null>(null);
  const [defaults, setDefaults] = useState<CellMatrix | null>(null);
  // Lo último que hay GUARDADO en el servidor: para saber si hay cambios sin
  // guardar (distinto de "excepciones", que se cuentan contra el perfil).
  const [saved, setSaved] = useState<CellMatrix | null>(null);
  // Alcance (Todo / Solo lo suyo) de las secciones escalables. null si el API
  // no lo devuelve: entonces la matriz no pinta chips y no se envía nada.
  const [scopes, setScopes] = useState<ScopeMatrix | null>(null);
  const [scopeDefaults, setScopeDefaults] = useState<ScopeMatrix | null>(null);
  const [savedScopes, setSavedScopes] = useState<ScopeMatrix | null>(null);
  const [viewRole, setViewRole] = useState<string | null>(null);

  // ── Filtros de la matriz ───────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [onlyModified, setOnlyModified] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const areas = useMemo<PermissionArea[]>(() => getPermissionAreas(), []);

  // ── Historial de auditoría ─────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditState, setAuditState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [historyReload, setHistoryReload] = useState(0);

  // ── Dimensión país ─────────────────────────────────────────────────────────
  // Solo relevante si la persona tiene más de un país: los permisos se gestionan
  // por país (GET/POST con ?country= / { country }).
  const countries = useMemo(() => {
    const list =
      user.countries ??
      (user.multiCountry ? ["es", "cl"] : user.country ? [user.country] : []);
    return list.filter((c) => c === "es" || c === "cl");
  }, [user.countries, user.multiCountry, user.country]);
  const isMultiCountry = countries.length > 1;
  const [activeCountry, setActiveCountry] = useState<string>(
    () =>
      (user.country && (countries as readonly string[]).includes(user.country)
        ? user.country
        : countries[0]) ?? "es",
  );

  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // ── Fetch on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    (async () => {
      try {
        const url = isMultiCountry
          ? `/api/admin/usuarios/${user.id}/permissions?country=${activeCountry}`
          : `/api/admin/usuarios/${user.id}/permissions`;
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error ?? "No se pudieron cargar los permisos");
          setLoadState("error");
          return;
        }
        const role: string = data.role ?? user.roleKey;
        const { effective: eff, defaults: def } = buildStates(
          data.permissions ?? {},
          role,
          data.roleDefaults,
        );
        setViewRole(role);
        setEffective(eff);
        setDefaults(def);
        setSaved(cloneMatrix(eff));
        if (data.scopes && data.scopeDefaults) {
          setScopes(cloneScopes(data.scopes as ScopeMatrix));
          setScopeDefaults(cloneScopes(data.scopeDefaults as ScopeMatrix));
          setSavedScopes(cloneScopes(data.scopes as ScopeMatrix));
        } else {
          setScopes(null);
          setScopeDefaults(null);
          setSavedScopes(null);
        }
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
  }, [user.id, user.roleKey, activeCountry, isMultiCountry]);

  // ── Historial (perezoso: solo con la sección abierta) ──────────────────────
  useEffect(() => {
    if (!historyOpen) return;
    let cancelled = false;
    setAuditState("loading");
    (async () => {
      try {
        const res = await fetch(`/api/admin/usuarios/${user.id}/permissions/audit`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setAuditState("error");
          return;
        }
        setAuditEntries(Array.isArray(data.entries) ? data.entries : []);
        setAuditState("ready");
      } catch {
        if (cancelled) return;
        setAuditState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyOpen, user.id, historyReload]);

  // ── Derivados ──────────────────────────────────────────────────────────────
  const overrides = useMemo(() => {
    if (!effective || !defaults) return [];
    const out: { resource: string; action: string; allowed: boolean }[] = [];
    for (const resource of PERMISSION_RESOURCES) {
      for (const action of PERMISSION_ACTIONS) {
        if (effective[resource][action] !== defaults[resource][action]) {
          out.push({ resource, action, allowed: effective[resource][action] });
        }
      }
    }
    return out;
  }, [effective, defaults]);
  // Las excepciones de alcance cuentan como excepciones del perfil.
  const scopeOverrideCount = useMemo(
    () => (scopes && scopeDefaults ? countScopeDiffs(scopes, scopeDefaults) : 0),
    [scopes, scopeDefaults],
  );
  const overrideCount = overrides.length + scopeOverrideCount;

  const dirty = useMemo(() => {
    const permsDirty = effective && saved ? !sameMatrix(effective, saved) : false;
    const scopesDirty = scopes && savedScopes ? !scopesEqual(scopes, savedScopes) : false;
    return permsDirty || scopesDirty;
  }, [effective, saved, scopes, savedScopes]);
  const summary = useMemo(() => (effective ? summarizePermissions(effective) : null), [effective]);

  // ── Cierre con aviso si hay cambios sin guardar ────────────────────────────
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Cerrar y descartarlos?")) return;
    onClose();
  }, [dirty, onClose]);

  const requestCountry = useCallback(
    (c: string) => {
      if (c === activeCountry) return;
      if (dirty && !window.confirm("Hay cambios sin guardar en este país. ¿Cambiar de país y descartarlos?")) return;
      setActiveCountry(c);
      setSaveState("idle");
    },
    [activeCountry, dirty],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => closeBtnRef.current?.focus(), 50);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [requestClose]);

  // ── Mutadores ──────────────────────────────────────────────────────────────
  const touch = () => setSaveState("idle");

  const setCell = useCallback(
    (resource: PermissionResource, action: PermissionAction, value: boolean) => {
      setEffective((prev) =>
        prev ? { ...prev, [resource]: { ...prev[resource], [action]: value } } : prev,
      );
      touch();
    },
    [],
  );

  const setRow = useCallback((resource: PermissionResource, value: boolean) => {
    setEffective((prev) => {
      if (!prev) return prev;
      const next = { ...prev[resource] };
      for (const action of PERMISSION_ACTIONS) next[action] = value;
      return { ...prev, [resource]: next };
    });
    touch();
  }, []);

  const setArea = useCallback((area: PermissionArea, value: boolean) => {
    setEffective((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const resource of area.resources) {
        next[resource] = { ...prev[resource] };
        for (const action of PERMISSION_ACTIONS) next[resource][action] = value;
      }
      return next;
    });
    touch();
  }, []);

  const setScope = useCallback((r: ScopedResource, k: ScopeKind, v: ScopeValue) => {
    setScopes((prev) => (prev ? setScopeCell(prev, r, k, v) : prev));
    touch();
  }, []);

  const resetToRole = useCallback(() => {
    if (!defaults) return;
    setEffective(cloneMatrix(defaults));
    if (scopeDefaults) setScopes(cloneScopes(scopeDefaults));
    touch();
  }, [defaults, scopeDefaults]);

  const discardChanges = useCallback(() => {
    if (!saved) return;
    setEffective(cloneMatrix(saved));
    if (savedScopes) setScopes(cloneScopes(savedScopes));
    touch();
  }, [saved, savedScopes]);

  const toggleArea = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Guardar ────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!canEdit || !effective) return;
    setSaveState("saving");
    setSaveError("");
    try {
      const res = await fetch(`/api/admin/usuarios/${user.id}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `scopeOverrides` va SIEMPRE (también `[]`): el API reemplaza el
        // conjunto entero, así que quitar una excepción es enviar la lista sin ella.
        body: JSON.stringify({
          overrides,
          ...(scopes && scopeDefaults
            ? { scopeOverrides: buildScopeOverrides(scopes, scopeDefaults) }
            : {}),
          ...(isMultiCountry ? { country: activeCountry } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "No se pudieron guardar los permisos");
        setSaveState("error");
        return;
      }
      setSaved(cloneMatrix(effective));
      if (scopes) setSavedScopes(cloneScopes(scopes));
      setSaveState("success");
      onSaved?.();
      setHistoryReload((n) => n + 1);
      setTimeout(() => setSaveState((s) => (s === "success" ? "idle" : s)), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Error de red");
      setSaveState("error");
    }
  }, [canEdit, effective, overrides, scopes, scopeDefaults, user.id, onSaved, isMultiCountry, activeCountry]);

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const headerRole = viewRole ?? user.roleKey;
  const normalizedQuery = query.trim().toLowerCase();

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/50 backdrop-blur-sm"
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Permisos de ${fullName}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col bg-cream-50 shadow-2xl sm:max-w-3xl"
        style={{ animation: "perm-drawer-in 0.28s cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        {/* Cabecera */}
        <div className="border-b border-ink/10 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-cream-50">
                {user.initials}
              </span>
              <div className="min-w-0">
                <p className="crm-label-sm text-ink/50">Permisos</p>
                <h2 className="crm-section-title truncate leading-tight text-ink">{fullName}</h2>
                <p className="truncate text-xs text-ink/55">{user.email}</p>
                <div className="mt-2">
                  <RoleBadge role={headerRole} layout="inline" />
                </div>
              </div>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={requestClose}
              aria-label="Cerrar"
              className="rounded-full p-2 text-ink/40 transition hover:bg-ink/5 hover:text-ink"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          {isMultiCountry && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="crm-label-sm text-ink/50">País que estás editando</span>
              <div className="inline-flex rounded-xl border border-ink/10 bg-white/70 p-0.5">
                {countries.map((c) => {
                  const active = c === activeCountry;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => requestCountry(c)}
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
            </div>
          )}
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

        {loadState === "ready" && effective && defaults && summary && (
          <>
            <div className="flex-1 overflow-y-auto px-5 pb-4 sm:px-6">
              <div className="h-4" aria-hidden />
              {!canEdit && (
                <p className="mb-4 flex items-start gap-2 rounded-xl border border-ink/10 bg-white/70 px-3.5 py-3 text-sm text-ink/70">
                  <Lock size={16} className="mt-0.5 shrink-0 text-ink/45" />
                  <span>
                    <span className="font-medium text-ink">Solo lectura.</span> Solo el Propietario y los
                    Administradores pueden cambiar permisos.
                  </span>
                </p>
              )}

              {/* Resumen de lo que puede hacer */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <SummaryStat
                  icon={<Eye size={15} />}
                  label="Puede ver"
                  value={`${summary.canView} de ${summary.total}`}
                  hint="secciones"
                />
                <SummaryStat
                  icon={<Pencil size={15} />}
                  label="Puede cambiar"
                  value={`${summary.canChange} de ${summary.total}`}
                  hint="secciones"
                />
                <SummaryStat
                  icon={<ShieldAlert size={15} />}
                  label="Sensibles"
                  value={String(summary.sensitive)}
                  hint="borrar, exportar, publicar"
                  tone={summary.sensitive > 0 ? "warn" : "neutral"}
                />
                <SummaryStat
                  icon={<ShieldCheck size={15} />}
                  label="Excepciones"
                  value={String(overrideCount)}
                  hint={overrideCount === 0 ? "igual que su perfil" : "sobre su perfil"}
                  tone={overrideCount > 0 ? "gold" : "neutral"}
                />
              </div>

              <p className="mt-3 text-xs leading-relaxed text-ink/55">
                El perfil <span className="font-medium text-ink/75">{roleName(headerRole)}</span> da unos permisos
                base. Los interruptores son <span className="font-medium text-ink/75">excepciones de esta persona</span>{" "}
                sobre ese perfil; las que difieren llevan un punto{" "}
                <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-gold align-middle" /> dorado. En las
                secciones con datos de personas, el botón bajo <span className="font-medium text-ink/75">Ver</span> y{" "}
                <span className="font-medium text-ink/75">Editar</span> elige si alcanza{" "}
                <span className="font-medium text-ink/75">Todo</span> o{" "}
                <span className="font-medium text-ink/75">Solo lo suyo</span>.
              </p>

              {/* Barra de herramientas */}
              <div className="sticky top-0 z-10 -mx-5 mt-4 flex flex-wrap items-center gap-2 border-y border-ink/8 bg-cream-50/95 px-5 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
                <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
                  <Search size={14} strokeWidth={1.75} className="text-ink/45" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar sección…"
                    aria-label="Buscar sección"
                    className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setOnlyModified((v) => !v)}
                  aria-pressed={onlyModified}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition",
                    onlyModified
                      ? "border-gold/60 bg-gold/15 text-ink"
                      : "border-ink/10 bg-white/70 text-ink/65 hover:text-ink",
                  )}
                >
                  Solo excepciones{overrideCount > 0 ? ` (${overrideCount})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => (prev.size > 0 ? new Set() : new Set(areas.map((a) => a.id))))
                  }
                  className="rounded-xl px-2.5 py-2 text-xs font-medium text-ink/55 transition hover:bg-ink/5 hover:text-ink"
                >
                  {collapsed.size > 0 ? "Desplegar todo" : "Plegar todo"}
                </button>
              </div>

              <div className="mt-4">
                <PermissionMatrix
                  areas={areas}
                  effective={effective}
                  defaults={defaults}
                  scopes={scopes}
                  scopeDefaults={scopeDefaults}
                  onScope={setScope}
                  canEdit={canEdit}
                  query={normalizedQuery}
                  onlyModified={onlyModified}
                  collapsed={collapsed}
                  onToggleArea={toggleArea}
                  onCell={setCell}
                  onRow={setRow}
                  onArea={setArea}
                />
              </div>

              {/* Historial de auditoría (colapsable) */}
              <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-white/55">
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
                      <h3 className="text-sm font-bold text-ink">Historial</h3>
                      <p className="text-xs text-ink/55">Cambios de perfil, permisos, país y acceso de esta cuenta.</p>
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
                    {auditState === "error" && (
                      <p className="py-3 text-sm text-ink/55">No se pudo cargar el historial.</p>
                    )}
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
                                <span className="text-sm font-medium text-ink">
                                  {EVENT_LABEL[entry.eventType] ?? entry.eventType}
                                </span>
                                {detail && <p className="mt-0.5 text-xs text-ink/60">{detail}</p>}
                                <p className="mt-0.5 text-xs text-ink/45">por {actorName(entry.actor)}</p>
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
                  <Check size={14} /> Permisos guardados correctamente.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={resetToRole}
                  disabled={!canEdit || overrideCount === 0 || saveState === "saving"}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-ink/10 px-3.5 py-2.5 text-sm font-medium text-ink/65 transition hover:border-ink/20 hover:text-ink disabled:opacity-40"
                >
                  <RotateCcw size={14} strokeWidth={1.75} />
                  <span className="hidden sm:inline">Volver a los valores del perfil</span>
                  <span className="sm:hidden">Valores del perfil</span>
                </button>
                <div className="flex items-center gap-2.5">
                  {dirty ? (
                    <>
                      <span className="hidden items-center gap-1.5 text-xs font-medium text-amber-700 sm:inline-flex">
                        <span className="h-2 w-2 rounded-full bg-amber-500" /> Cambios sin guardar
                      </span>
                      <button
                        type="button"
                        onClick={discardChanges}
                        disabled={saveState === "saving"}
                        className="rounded-xl px-3 py-2.5 text-sm font-medium text-ink/60 transition hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                      >
                        Descartar
                      </button>
                    </>
                  ) : (
                    <span className="hidden text-xs text-ink/50 sm:inline">
                      {overrideCount === 0
                        ? "Sin excepciones"
                        : `${overrideCount} ${overrideCount === 1 ? "excepción guardada" : "excepciones guardadas"}`}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!canEdit || !dirty || saveState === "saving"}
                    className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-40"
                  >
                    {saveState === "saving" ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Check size={15} strokeWidth={2} />
                    )}
                    Guardar cambios
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

function SummaryStat({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "warn" | "gold";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        tone === "warn" && "border-rose-200 bg-rose-50/70",
        tone === "gold" && "border-gold/40 bg-gold/10",
        tone === "neutral" && "border-ink/10 bg-white/70",
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink/60">
        <span className="text-ink/40">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums leading-none text-ink">{value}</p>
      <p className="mt-1 truncate text-[11px] text-ink/45">{hint}</p>
    </div>
  );
}
