"use client";

import { cn } from "@/lib/utils";

/**
 * Control deslizante de rango (dos tiradores) hecho con dos `<input type=range>`
 * nativos superpuestos: así conserva el teclado (←/→, Re Pág/Av Pág), el
 * lector de pantalla y el gesto táctil del sistema sin dependencias nuevas.
 *
 * Los valores son strings porque son los de la URL: "" = «sin límite» (el
 * tirador está en su extremo). Mover un tirador hasta el extremo vuelve a ""
 * para no escribir en la URL un filtro que no filtra nada.
 */
export function RangeSlider({
  min,
  max,
  step = 1,
  valueMin,
  valueMax,
  onChange,
  labelMin,
  labelMax,
}: {
  min: number;
  max: number;
  step?: number;
  valueMin: string;
  valueMax: string;
  onChange: (next: { min: string; max: string }) => void;
  labelMin: string;
  labelMax: string;
}) {
  const lo = valueMin === "" ? min : Math.min(Math.max(Number(valueMin), min), max);
  const hi = valueMax === "" ? max : Math.min(Math.max(Number(valueMax), min), max);
  const span = max - min;
  const pct = (v: number) => ((v - min) / span) * 100;

  const emit = (nextLo: number, nextHi: number) =>
    onChange({ min: nextLo <= min ? "" : String(nextLo), max: nextHi >= max ? "" : String(nextHi) });

  // Los dos <input> ocupan todo el ancho y dejan pasar el ratón salvo en el
  // propio tirador (pointer-events solo en el thumb), así se agarra el más cercano.
  const thumb =
    "pointer-events-none absolute inset-0 h-6 w-full appearance-none bg-transparent " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-white " +
    "focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-ink [&:focus-visible::-webkit-slider-thumb]:ring-offset-2";

  return (
    <div className="relative h-6 select-none px-3">
      <div className="relative h-6">
        <div aria-hidden="true" className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink/15" />
        <div
          aria-hidden="true"
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gold-dark"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          aria-label={labelMin}
          onChange={(e) => emit(Math.min(Number(e.target.value), hi), hi)}
          className={cn(thumb)}
          // El tirador izquierdo queda por encima cuando ambos están al máximo,
          // si no, no se podría volver a bajar el derecho.
          style={{ zIndex: lo >= max - step ? 3 : 2 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          aria-label={labelMax}
          onChange={(e) => emit(lo, Math.max(Number(e.target.value), lo))}
          className={cn(thumb)}
          style={{ zIndex: 2 }}
        />
      </div>
    </div>
  );
}
