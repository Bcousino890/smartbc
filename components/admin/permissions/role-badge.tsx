import { cn } from "@/lib/utils";
import { isLegacyRole, roleDetail, roleLabel } from "@/lib/auth/role-model";

/**
 * Insignia de rol de una cuenta, con el matiz del perfil debajo.
 *
 * Una sola fuente para la tabla de Usuarios y para el panel de Permisos (antes
 * cada uno tenía su copia de colores y etiquetas, y en el panel los dos Asesores
 * —«toda la cartera» y «solo su cartera»— se veían exactamente igual).
 */
const BADGE_STYLE: Record<string, string> = {
  owner: "border-violet-200 bg-violet-50 text-violet-700",
  admin: "border-emerald-200 bg-emerald-50 text-emerald-700",
  agent_admin: "border-emerald-200 bg-emerald-50 text-emerald-700",
  advisor: "border-blue-200 bg-blue-50 text-blue-700",
  agent_senior: "border-indigo-200 bg-indigo-50 text-indigo-700",
  agent_junior: "border-sky-200 bg-sky-50 text-sky-700",
  captadora: "border-rose-200 bg-rose-50 text-rose-700",
  client: "border-amber-200 bg-amber-50 text-amber-700",
  viewer: "border-ink/15 bg-ink/5 text-ink/65",
};

export function RoleBadge({
  role,
  layout = "stacked",
  className,
}: {
  role: string;
  /** `stacked`: matiz debajo (tablas). `inline`: matiz a continuación (cabeceras). */
  layout?: "stacked" | "inline";
  className?: string;
}) {
  const detail = roleDetail(role);
  const badge = (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        BADGE_STYLE[role] ?? BADGE_STYLE.viewer,
      )}
    >
      {roleLabel(role)}
      {isLegacyRole(role) && (
        <span className="ml-1.5 rounded bg-ink/10 px-1 text-[10px] font-semibold uppercase tracking-wide text-ink/55">
          heredado
        </span>
      )}
    </span>
  );
  if (!detail) return <span className={className}>{badge}</span>;
  // El detalle de los heredados ya lleva «(heredado)»: se quita, la etiqueta lo dice.
  const text = detail.replace(/\s*\(heredado\)\s*$/i, "");
  return layout === "inline" ? (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {badge}
      <span className="text-xs text-ink/55">{text}</span>
    </span>
  ) : (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      {badge}
      <span className="text-[11px] leading-tight text-ink/50">{text}</span>
    </span>
  );
}
