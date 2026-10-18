"use client";

// Chip de rango numérico (precio, m²…): dos inputs mín – máx. Vacío = sin
// límite por ese lado. Sacado tal cual de properties-admin-client.tsx (BCP-01,
// P1), donde «PriceRange» era este mismo chip con la etiqueta «Precio».
// `disabled` y `title` son opcionales: Propiedades no los usa.
export function RangeChip({
  label,
  min,
  max,
  onMin,
  onMax,
  disabled,
  title,
}: {
  label: string;
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  const sanitize = (v: string) => v.replace(/[^\d]/g, "");
  return (
    <div
      title={title}
      className={
        "inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-white/85 px-2 py-1 text-ink/75 transition focus-within:border-gold/55" +
        (disabled ? " cursor-not-allowed opacity-50" : "")
      }
    >
      <span className="crm-label-sm text-ink/45">
        {label}
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={min}
        onChange={(e) => onMin(sanitize(e.target.value))}
        placeholder="mín"
        disabled={disabled}
        className="w-12 bg-transparent text-xs text-ink placeholder:text-ink/35 focus:outline-none"
      />
      <span className="text-ink/35">–</span>
      <input
        type="text"
        inputMode="numeric"
        value={max}
        onChange={(e) => onMax(sanitize(e.target.value))}
        placeholder="máx"
        disabled={disabled}
        className="w-14 bg-transparent text-xs text-ink placeholder:text-ink/35 focus:outline-none"
      />
    </div>
  );
}
