"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Controles pequeños y reutilizables de la barra y del panel de filtros. Todos
// miden 40 px de alto (objetivo táctil ≥ 40 px en móvil) y comparten el mismo
// anillo de foco oscuro (el dorado no llega a 3:1 sobre blanco).

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-white";

export type Option<T extends string> = { value: T; label: string; icon?: React.ReactNode; hint?: string };

/**
 * Selector segmentado (radiogroup): una opción siempre activa, relleno dorado
 * suave, flechas ←/→ para cambiar. Para pocas opciones excluyentes (Venta /
 * Alquiler / Todas) es más rápido que un desplegable: un toque, sin abrir nada.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  iconOnly = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  ariaLabel: string;
  className?: string;
  /** Solo icono (con aria-label y title): para el alternador de vista. */
  iconOnly?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex h-10 shrink-0 items-stretch rounded-xl border border-ink/10 bg-white p-0.5", className)}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={iconOnly ? o.label : undefined}
            title={iconOnly ? o.label : o.hint}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm transition",
              iconOnly && "w-9 px-0",
              active
                ? "bg-gold/25 font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(168,138,82,0.65)]"
                : "font-medium text-ink/70 hover:bg-ink/[0.04] hover:text-ink",
              FOCUS_RING,
            )}
          >
            {o.icon}
            {!iconOnly && <span className="truncate">{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Elección de un valor entre varios, en pastillas que saltan de línea. Para el
 * panel de filtros, donde hay sitio y se ven todas las opciones de un vistazo.
 * Pulsar la activa NO la desmarca: la opción "Todos/Cualquiera" es explícita.
 */
export function ChoiceGroup<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm transition",
              active
                ? "border-gold-dark bg-gold/25 font-semibold text-ink"
                : "border-ink/15 bg-white font-medium text-ink/75 hover:border-ink/30 hover:text-ink",
              FOCUS_RING,
            )}
          >
            {active && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Interruptor accesible (role="switch") con su etiqueta a la izquierda. */
export function SwitchRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-h-10 items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-ink/65">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition",
          checked ? "border-ink bg-ink" : "border-ink/25 bg-ink/15",
          FOCUS_RING,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

const FIELD =
  "h-10 w-full rounded-xl border border-ink/15 bg-white px-3 text-sm text-ink placeholder:text-ink/50 transition focus:border-ink/40 disabled:cursor-not-allowed disabled:bg-ink/[0.04] disabled:text-ink/45";

/**
 * Campo numérico con sufijo (€, m²…). Solo dígitos: el valor sigue siendo string, como en la URL.
 *
 * Lo tecleado vive en un borrador local: el padre (y por tanto la URL y el
 * servidor) solo recibe el valor 300 ms después de la última tecla, al salir
 * del campo o con Intro. Mientras el campo tiene el borrador, el `value` que
 * llega de fuera NO lo pisa (antes, una re-sincronización a mitad de escritura
 * dejaba «80» en «8»).
 */
export function NumberField({
  value,
  onChange,
  placeholder,
  suffix,
  ariaLabel,
  allowDecimal = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix?: string;
  ariaLabel: string;
  allowDecimal?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const commit = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (draftRef.current !== null) onChangeRef.current(draftRef.current);
  };
  // Al desmontar con un valor aún sin confirmar (Esc con el panel abierto), se confirma.
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); if (draftRef.current !== null) onChangeRef.current(draftRef.current); } }, []);

  return (
    <div className="relative">
      <input
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        value={draft ?? value}
        onChange={(e) => {
          const v = e.target.value.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, "");
          draftRef.current = v;
          setDraft(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(commit, 300);
        }}
        onBlur={() => {
          commit();
          draftRef.current = null;
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(FIELD, suffix && "pr-9", FOCUS_RING)}
      />
      {suffix && (
        <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink/55">
          {suffix}
        </span>
      )}
    </div>
  );
}

/** Desplegable nativo con aspecto de la casa (en móvil abre el selector del sistema, que es lo cómodo). */
export function SelectField({
  value,
  onChange,
  children,
  ariaLabel,
  disabled,
  className,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("relative", className)}>
      {icon && (
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/50">
          {icon}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(FIELD, "appearance-none pr-9", icon && "pl-9", FOCUS_RING)}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        strokeWidth={1.75}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink/50"
      />
    </div>
  );
}

/** Botón neutro de 40 px de la barra (Más filtros, Herramientas…). */
export const BAR_BUTTON =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-ink/15 bg-white px-3.5 text-sm font-medium text-ink transition hover:border-ink/30 hover:bg-cream-50";
