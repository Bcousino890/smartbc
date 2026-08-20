"use client";

// ============================================================================
// CLIENT COMMAND CENTER · piezas de interfaz
//
// El panel interno no es el sitio de la estética de la revista. Aquí lo que se
// premia es densidad y lectura rápida: bordes finos, esquinas pequeñas, fondo
// plano y ningún desenfoque. La identidad BCP se sostiene con la tipografía y
// con el oro como ACENTO —nunca como relleno—, no con tarjetas flotantes.
//
// Contra lo que había: `rounded-2xl` + `bg-cream-50/85` + `backdrop-blur` +
// una sombra de 40px en cada bloque. Con siete bloques en columna, eso es una
// página que pesa mucho y dice poco.
// ============================================================================

import { cn } from "@/lib/utils";

// ─── Panel ───────────────────────────────────────────────────────────────────

export function Panel({
  title,
  count,
  action,
  children,
  className,
  id,
  dense,
}: {
  title?: React.ReactNode;
  count?: number | null;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  dense?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-lg border border-ink/10 bg-white",
        // `scroll-mt` para que al saltar desde la próxima acción el panel no
        // quede debajo de la barra de pestañas, que es pegajosa.
        "scroll-mt-28",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-ink/8 px-4 py-2.5">
          <h2 className="crm-label-sm flex items-center gap-2 text-ink/60">
            {title}
            {typeof count === "number" && count > 0 && (
              <span className="crm-number rounded bg-ink/[0.06] px-1.5 py-px text-xs text-ink/50">
                {count}
              </span>
            )}
          </h2>
          {action}
        </header>
      )}
      <div className={dense ? "" : "p-4"}>{children}</div>
    </section>
  );
}

// ─── Etiquetas de estado ─────────────────────────────────────────────────────

export type Tone = "neutral" | "positive" | "warning" | "critical" | "info" | "gold";

const TONES: Record<Tone, string> = {
  neutral: "border-ink/12 bg-ink/[0.04] text-ink/60",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  gold: "border-gold/40 bg-gold/10 text-gold-dark",
};

export function Pill({
  tone = "neutral",
  children,
  className,
  icon,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "crm-badge inline-flex items-center gap-1 rounded border px-1.5 py-0.5",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

// ─── Dato suelto ─────────────────────────────────────────────────────────────

/**
 * Etiqueta encima, valor debajo. Cuando no hay dato se pinta una raya tenue y
 * NO se inventa un cero: en una ficha comercial, "0 dormitorios" y "no lo
 * hemos preguntado" llevan a decisiones opuestas.
 */
export function Field({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string | null;
  className?: string;
}) {
  const empty =
    value === null ||
    value === undefined ||
    value === "" ||
    value === "—";
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="crm-label-sm text-ink/40">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm",
          empty ? "text-ink/25" : "text-ink",
        )}
        title={typeof value === "string" ? value : undefined}
      >
        {empty ? "—" : value}
      </dd>
      {hint && <p className="crm-meta mt-0.5 text-ink/40">{hint}</p>}
    </div>
  );
}

// ─── Métrica ─────────────────────────────────────────────────────────────────

/**
 * Una cifra comercial. `value === null` significa "todavía no se puede medir",
 * y se pinta distinto de un cero a propósito: la ficha anterior enseñaba un 0
 * fijo en dos de sus cuatro tarjetas y nadie podía saber que no era real.
 */
export function Metric({
  label,
  value,
  hint,
  emphasis,
  href,
  onClick,
}: {
  label: string;
  value: number | string | null;
  hint?: string | null;
  emphasis?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p
        className={cn(
          "crm-number text-[22px] leading-none",
          value === null ? "text-ink/20" : emphasis ? "text-gold-dark" : "text-ink",
        )}
      >
        {value === null ? "—" : value}
      </p>
      <p className="crm-label-sm mt-1.5 text-ink/45">
        {label}
      </p>
      {hint && <p className="crm-meta mt-0.5 truncate text-ink/35">{hint}</p>}
    </>
  );

  const shell =
    "block rounded-lg border border-ink/10 bg-white px-3.5 py-3 text-left transition";

  if (href) {
    return (
      <a href={href} onClick={onClick} className={cn(shell, "hover:border-gold/45")}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(shell, "w-full hover:border-gold/45")}>
        {body}
      </button>
    );
  }
  return <div className={shell}>{body}</div>;
}

// ─── Vacíos ──────────────────────────────────────────────────────────────────

export function Empty({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-dashed border-ink/12 px-4 py-6 text-center">
      <p className="text-sm text-ink/45">{children}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

// ─── Botones ─────────────────────────────────────────────────────────────────

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <button
      {...props}
      className={cn(
        "crm-button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md transition disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "px-2.5 py-1.5" : "px-3 py-2",
        variant === "primary" &&
          "bg-ink text-cream-50 hover:bg-ink-soft",
        variant === "secondary" &&
          "border border-ink/15 bg-white text-ink/75 hover:border-gold/50 hover:text-ink",
        variant === "ghost" && "text-ink/55 hover:text-ink",
        className,
      )}
    />
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

/**
 * Un diálogo sobrio y del ancho justo. En móvil sube desde abajo y ocupa lo
 * que necesite; en escritorio se centra. El scroll queda DENTRO del cuerpo
 * para que el pie con "Guardar" nunca se vaya de la pantalla: en un formulario
 * largo, perder el botón de guardar es perder el trabajo.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex max-h-[92vh] w-full flex-col rounded-t-xl border border-ink/10 bg-white shadow-xl sm:rounded-xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-ink/8 px-4 py-3">
          <h2 className="crm-section-title text-ink">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar">
            ✕
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-ink/8 px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

// ─── Campos de formulario ────────────────────────────────────────────────────

const INPUT =
  "crm-input w-full rounded-md border border-ink/15 bg-white px-2.5 py-1.5 text-ink outline-none transition focus:border-gold/60";

export function Labeled({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="crm-label-sm mb-1 block text-ink/45">
        {label}
      </span>
      {children}
    </label>
  );
}

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <input {...props} className={cn(INPUT, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(INPUT, props.className)} />;
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return <textarea {...props} className={cn(INPUT, "resize-y", props.className)} />;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink/75">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[#8a6d3b]"
      />
      {label}
    </label>
  );
}
