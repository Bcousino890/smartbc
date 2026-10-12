"use client";

// STUB — lo implementa el agente "es-pin". Contrato (NO cambiar las props):
// mapa del anuncio con SU PIN. Si hay coordenadas, pin exacto; si no, las
// obtiene (geocodificación en servidor, con caché) a partir de la calle y la
// zona; nunca muestra el mapa del mundo sin pin. `precision` rotula si el
// punto es el del portal («Ubicación exacta») o aproximado.
export type AdMapProps = {
  /** id del anuncio en `particulares` (para pedir/guardar coordenadas si faltan). */
  particularId: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  zone?: string | null;
  /** "exact" = pin del portal con calle y número · "approximate" = zona/calle sin número. */
  precision?: "exact" | "approximate" | null;
  className?: string;
  /** Altura del mapa en px (por defecto 224). */
  height?: number;
};

export function AdMap({ className, height = 224 }: AdMapProps) {
  return (
    <div className={className} style={{ height }}>
      <div className="flex h-full items-center justify-center rounded-lg border border-ink/10 bg-ink/5 text-xs text-ink/40">
        Mapa (pendiente de implementar)
      </div>
    </div>
  );
}
