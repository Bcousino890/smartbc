import L from "leaflet";
import type { MapPin, PinTier } from "@/lib/captaciones-map/pins";
import { formatPinPrice } from "@/lib/captaciones-map/pin-label";

/** Altura de la píldora y de su cola: el ancla del icono es la punta de la cola. */
const PILL_H = 24;
const TAIL_H = 7;

/**
 * Icono de un pin (maqueta v4): `match` negro (dorado en oscuro) con precio,
 * `partial` blanco con borde dorado y precio, `nomatch` punto de 12 px. `out`
 * devuelve null: se pinta como circleMarker de canvas (miles de DOM nodes
 * para pines fuera de zona no compensan). Los estilos viven en CSS
 * (`.cm-pin*` en captaciones-map.tsx); aquí solo clases y estructura.
 *
 * `showLabel` false baja `partial` a punto cuando hay demasiados pines a la
 * vista (el llamador decide el umbral); `match` siempre conserva su precio.
 */
export function buildPinIcon(
  pin: MapPin,
  tier: PinTier,
  theme: "light" | "dark",
  selected: boolean,
  showLabel = true,
): L.DivIcon | null {
  if (tier === "out") return null;
  const asPill = tier === "match" || (tier === "partial" && showLabel);
  const flags = [
    selected ? "cm-sel" : "",
    pin.isAgency ? "cm-agency" : "",
    theme === "dark" ? "cm-dark" : "",
  ].join(" ");
  const newDot = pin.isNew ? '<i class="cm-new"></i>' : "";

  if (!asPill) {
    return L.divIcon({
      className: `cm-pin cm-dot cm-${tier} ${flags}`,
      html: `<b></b>${newDot}`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
  }
  const label = formatPinPrice(pin.price, pin.operation);
  // Misma estimación de ancho que la maqueta (7 px por carácter + relleno).
  const w = label.length * 7 + 20;
  return L.divIcon({
    className: `cm-pin cm-pill cm-${tier} ${flags}`,
    html: `<span>${label}</span>${newDot}`,
    iconSize: [w, PILL_H + TAIL_H],
    iconAnchor: [w / 2, PILL_H + TAIL_H],
  });
}
