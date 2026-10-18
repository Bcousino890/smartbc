"use client";

// Desplegable de filtro con su etiqueta (Propiedades y buscador del catálogo).
// Sacado tal cual de properties-admin-client.tsx (BCP-01, P1). `disabled` y
// `title` son opcionales: Propiedades no los usa.
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  title,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label
      title={title}
      className={
        "inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-white/85 px-2 py-1 text-ink/75 transition focus-within:border-gold/55" +
        (disabled ? " cursor-not-allowed opacity-50" : "")
      }
    >
      <span className="crm-label-sm text-ink/45">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="appearance-none bg-transparent text-xs text-ink focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
