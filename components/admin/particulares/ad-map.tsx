"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { buildMosaic } from "@/lib/geo/tile-math";

// Mapa del anuncio con SU PIN. Mosaico propio de teselas OpenStreetMap (sin
// clave, nunca un proveedor que la pida). Sin coordenadas las pide al servidor.
export type AdMapProps = {
  particularId: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  zone?: string | null;
  /** "exact" = pin del portal con calle y número · "approximate" = zona/calle sin número. */
  precision?: "exact" | "approximate" | null;
  className?: string;
  height?: number;
};

type Pt = { lat: number; lng: number; precision: "exact" | "approximate" | "zone" };
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const ZOOM = { exact: 17, approximate: 16, zone: 14 } as const;
const LABEL = {
  exact: "Ubicación exacta",
  approximate: "Ubicación aproximada",
  zone: "Solo la zona (aproximada)",
} as const;

export function AdMap({ particularId, latitude, longitude, address, zone, precision, className, height = 224 }: AdMapProps) {
  const given: Pt | null =
    isNum(latitude) && isNum(longitude) ? { lat: latitude, lng: longitude, precision: precision ?? "approximate" } : null;
  const [fetched, setFetched] = useState<Pt | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "none">("idle");
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    if (given || (!address && !zone)) return;
    const ctl = new AbortController();
    setState("loading");
    fetch(`/api/admin/particulares/${encodeURIComponent(particularId)}/geocode`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && isNum(d.lat) && isNum(d.lng)) {
          setFetched({ lat: d.lat, lng: d.lng, precision: d.precision ?? "approximate" });
          setState("idle");
        } else setState("none");
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setState("none");
      });
    return () => ctl.abort();
  }, [given, particularId, address, zone]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pt = given ?? fetched;
  const mosaic = useMemo(
    () => (pt && w ? buildMosaic({ lat: pt.lat, lng: pt.lng, zoom: ZOOM[pt.precision], width: w, height }) : null),
    [pt, w, height],
  );
  const pin = mosaic && pt ? mosaic.project(pt.lat, pt.lng) : null;

  return (
    <div ref={wrap} className={className} style={{ height }}>
      <div className="relative h-full overflow-hidden rounded-lg border border-ink/10 bg-ink/5">
        {mosaic?.tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${t.z}/${t.x}/${t.y}`}
            src={`https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`}
            alt="" width={256} height={256} loading="lazy" decoding="async" draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ left: t.left, top: t.top, width: 256, height: 256 }}
          />
        ))}
        {pin && pt && (
          <>
            {pt.precision !== "exact" && (
              <span
                className="absolute rounded-full border border-gold bg-gold/15"
                style={{ left: pin.left - 40, top: pin.top - 40, width: 80, height: 80 }}
                aria-hidden
              />
            )}
            <MapPin
              className="absolute h-8 w-8 -translate-x-1/2 -translate-y-full fill-red-600 text-white drop-shadow"
              style={{ left: pin.left, top: pin.top }}
              aria-label="Pin del anuncio"
            />
            <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 py-0.5 text-xs text-ink/70">
              {LABEL[pt.precision]}
            </span>
            <span className="absolute bottom-1 right-1 rounded bg-white/80 px-1 text-xs text-ink/60">
              ©{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
                OpenStreetMap
              </a>
            </span>
          </>
        )}
        {!pt && (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-ink/60">
            {state === "loading" ? "Buscando la ubicación…" : "Este anuncio no tiene ubicación disponible."}
          </div>
        )}
      </div>
    </div>
  );
}
