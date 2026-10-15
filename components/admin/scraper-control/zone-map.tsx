"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { latLngToTile, worldPixelToLatLng, TILE_SIZE } from "@/lib/geo/tile-math";
import { PORTAL_LABEL, type ScraperPortal, type ScraperZone, type ZonePriority } from "@/lib/scrapers/control-types";
import { FOCUS_RING, Segmented } from "@/app/[country]/(admin)/admin/particulares/_lista/controls";
import { PrioritySelect, ZoneInfo } from "./priority-select";
import { BTN_SECONDARY, fmt } from "./shared";
import { family, normalize, type TreeNode } from "./zones-tree";

/**
 * Mapa de zonas: contornos reales (OpenStreetMap, simplificados y guardados en el repo; ver
 * scripts/zonas-mapa/generar.mjs) dibujados en SVG propio, sin claves ni servicios externos.
 * Cada zona de scraper_zones se asocia a un contorno (zone-match.json). Lo que no tiene
 * contorno propio se pinta como marcador (mediana de sus anuncios) o se lista aparte
 * como «sin posición»: ninguna zona se oculta. El estado se comparte con la lista.
 *
 * Calles: bajo el SVG van teselas raster de OpenStreetMap (tile.openstreetmap.org, sin clave;
 * © colaboradores de OpenStreetMap). Se pintan solo las del encuadre (≈ 12–25 por vista), con la
 * caché del navegador, sin precarga masiva, y siguen el zoom y el arrastre del SVG. Se pueden apagar.
 *
 * Subzonas: los municipios con barrios/urbanizaciones con contorno OSM (tipo "s", ver
 * scripts/zonas-mapa/subzonas.mjs) los dibujan al acercar o al elegir el municipio. Las subzonas sin
 * contorno salen como marcador y SIEMPRE en una lista de chips bajo el mapa, igual de marcables.
 * Modelo: la zona más específica manda; sin marcar = no se scrapea.
 *
 * Interacción: un TOQUE marca o desmarca (Sin marcar ⇄ Marcada); «Alta» se elige en el panel.
 * Un arrastre, un pellizco o una pulsación larga NO marcan. Doble toque/clic = acercar.
 */

type GeoFeature = { id: string; n: string; k: "d" | "b" | "m" | "s"; p?: string; c: [number, number]; r: number[][] };
type Geo = { attribution: string; generated: string; features: GeoFeature[] };
type Match = { generated: string; zones: Record<ScraperPortal, Record<string, { p?: string; pt?: [number, number] }>> };

type Poly = { f: GeoFeature; d: string; box: [number, number, number, number]; cx: number; cy: number };
type View = { k: number; x: number; y: number };

// Proyección plana (equirrectangular con corrección de latitud): suficiente a escala de provincia.
const LON0 = -3.7;
const LAT0 = 40.45;
const COS = Math.cos((LAT0 * Math.PI) / 180);
const S = 1000; // unidades de mapa por grado
const px = (lonE4: number) => (lonE4 / 1e4 - LON0) * COS * S;
const py = (latE4: number) => -(latE4 / 1e4 - LAT0) * S;
// Mapa (unidades) ⇄ grados, para colocar las teselas de OSM en la misma proyección.
const lonToX = (lon: number) => (lon - LON0) * COS * S;
const latToY = (lat: number) => -(lat - LAT0) * S;
const xToLon = (x: number) => x / (COS * S) + LON0;
const yToLat = (y: number) => LAT0 - y / S;

const FILL: Record<ZonePriority, string> = { off: "#e6dfd0", normal: "#3a7d68", alta: "#c9a96e" };
const STROKE: Record<ZonePriority, string> = { off: "#7a705e", normal: "#1f5a48", alta: "#8a6a2a" };
// Relleno semitransparente: deja ver las calles de debajo.
const FILL_OPACITY: Record<ZonePriority, number> = { off: 0.3, normal: 0.52, alta: 0.58 };
const NEUTRAL_FILL = "#f6f3ec";
const NEUTRAL_OPACITY = 0.22;

/** Un municipio enseña sus subzonas cuando ocupa al menos este ancho en pantalla (px) o está elegido. */
const SUBS_MIN_PX = 230;
const TILE_MIN_Z = 7;
const TILE_MAX_Z = 18;
const TILE_URL = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/** A partir de este zoom (relativo a Madrid capital) se pintan los barrios y el distrito queda como contorno. */
const BARRIOS_FROM = 1.7;
const TAP_MS = 500; // más largo que esto = pulsación larga (solo ver información)
const DOUBLE_TAP_MS = 300;
const TAP_DELAY_MS = 230; // se espera un instante por si el toque es el primero de un doble toque

type Placement = { poly?: string; pt?: [number, number] };

const stripParen = (label: string) => label.replace(/\s*\(.*\)\s*$/, "");
const clamp = (n: number, a: number, b: number) => Math.min(Math.max(n, a), b);

/** Estado que pinta un contorno con varias zonas: Alta > Marcada > Sin marcar. */
function stateOf(zs: ScraperZone[]): ZonePriority {
  if (zs.some((z) => z.priority === "alta")) return "alta";
  if (zs.some((z) => z.priority === "normal")) return "normal";
  return "off";
}

const stateWord = (p: ZonePriority) => (p === "off" ? "sin marcar" : p === "alta" ? "prioridad alta" : "marcada");

const PolyLayer = memo(function PolyLayer({
  polys,
  zonesByPoly,
  showBarrios,
  selectedPoly,
  subsVisible,
}: {
  polys: Poly[];
  zonesByPoly: Map<string, ScraperZone[]>;
  showBarrios: boolean;
  selectedPoly: string | null;
  subsVisible: Set<string>;
}) {
  // Orden de pintado: municipios, distritos, barrios y subzonas (lo más específico encima).
  return (
    <g>
      {polys.map(({ f, d }) => {
        const zs = zonesByPoly.get(f.id);
        if (f.k === "b" && !showBarrios) return null;
        if (f.k === "s" && !(f.p && subsVisible.has(f.p))) return null;
        // Con barrios visibles, el distrito queda como simple contorno (no se pulsa).
        const outlineOnly = f.k === "d" && showBarrios;
        const interactive = !!zs && !outlineOnly;
        const st = zs ? stateOf(zs) : null;
        const sel = selectedPoly === f.id;
        return (
          <path
            key={f.id}
            d={d}
            data-pid={interactive ? f.id : undefined}
            fill={outlineOnly ? "none" : st ? FILL[st] : NEUTRAL_FILL}
            fillOpacity={outlineOnly ? 0 : st ? FILL_OPACITY[st] : NEUTRAL_OPACITY}
            stroke={sel ? "#0a0a0a" : outlineOnly ? "#4a4337" : st ? STROKE[st] : "#8a8170"}
            strokeWidth={sel ? 2.6 : outlineOnly ? 1.6 : f.k === "s" ? 1.6 : 1.1}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            pointerEvents={interactive ? "auto" : "none"}
            style={{ cursor: interactive ? "pointer" : "default" }}
            role={interactive ? "button" : undefined}
            aria-label={interactive ? `${f.n}: ${stateWord(st!)}` : undefined}
          />
        );
      })}
    </g>
  );
});

type Label = { id: string; n: string; x: number; y: number };

const LabelLayer = memo(function LabelLayer({ labels, k }: { labels: Label[]; k: number }) {
  return (
    <g pointerEvents="none" fontFamily="Lato, sans-serif" fontSize={12 / k} textAnchor="middle">
      {labels.map((l) => (
        <text key={l.id} x={l.x} y={l.y} fill="#0a0a0a" stroke="#ffffff" strokeWidth={3 / k} paintOrder="stroke" strokeLinejoin="round" dominantBaseline="middle">
          {l.n}
        </text>
      ))}
    </g>
  );
});

export function ZoneMap({
  portal,
  zones,
  disabled,
  onSet,
  onFamily,
  focusKey,
  onFocusDone,
}: {
  portal: ScraperPortal;
  zones: ScraperZone[];
  disabled: boolean;
  onSet: (z: ScraperZone, p: ZonePriority) => void;
  onFamily: (all: ScraperZone[], mark: boolean) => void;
  /** Zona a enseñar al abrir (desde «Ver en el mapa» de la lista): se selecciona y se encuadra. */
  focusKey?: string | null;
  onFocusDone?: () => void;
}) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // zone_key
  const [more, setMore] = useState(40);
  const [tapMode, setTapMode] = useState<"toggle" | "view">("toggle");
  const [streets, setStreets] = useState(true);
  const [snack, setSnack] = useState<{ text: string; undo: () => void } | null>(null);

  useEffect(() => {
    let off = false;
    Promise.all([import("@/lib/scrapers/zone-map/geo.json"), import("@/lib/scrapers/zone-map/zone-match.json")])
      .then(([g, m]) => {
        if (off) return;
        setGeo(g.default as unknown as Geo);
        setMatch(m.default as unknown as Match);
      })
      .catch(() => !off && setLoadErr(true));
    return () => {
      off = true;
    };
  }, []);

  // Contornos ya proyectados (una sola vez).
  const polys = useMemo<Poly[]>(() => {
    if (!geo) return [];
    const order = { m: 0, d: 1, b: 2, s: 3 } as const;
    return geo.features
      .slice()
      .sort((a, b) => order[a.k] - order[b.k])
      .map((f) => {
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        const d = f.r
          .map((ring) => {
            let s = "";
            for (let i = 0; i < ring.length; i += 2) {
              const x = px(ring[i]);
              const y = py(ring[i + 1]);
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
              s += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
            }
            return s + "Z";
          })
          .join("");
        return { f, d, box: [x0, y0, x1, y1] as [number, number, number, number], cx: px(f.c[0]), cy: py(f.c[1]) };
      });
  }, [geo]);
  const polyById = useMemo(() => new Map(polys.map((p) => [p.f.id, p])), [polys]);

  // Dónde va cada zona: contorno (zone-match.json), marcador, o nada («sin posición»).
  const placement = useMemo(() => {
    const out = new Map<string, Placement>();
    if (!geo || !match) return out;
    const names = new Map<string, string>();
    for (const f of geo.features) if (!names.has(normalize(f.n))) names.set(normalize(f.n), f.id);
    const table = match.zones[portal] ?? {};
    for (const z of zones) {
      const m = table[z.zone_key];
      if (m?.p && polyById.has(m.p)) out.set(z.zone_key, { poly: m.p });
      else if (m?.pt) out.set(z.zone_key, { pt: m.pt });
      else if (!m) {
        // Zona nueva que aún no está en el casado: último recurso, nombre exacto. Se regenera con el script.
        const id = names.get(normalize(stripParen(z.label)));
        if (id && /^(madrid|madrid-capital)\//.test(z.zone_key) && z.zone_key.split("/").length <= 3) out.set(z.zone_key, { poly: id });
      }
    }
    return out;
  }, [geo, match, portal, zones, polyById]);

  const zoneByKey = useMemo(() => new Map(zones.map((z) => [z.zone_key, z])), [zones]);
  const zonesByPoly = useMemo(() => {
    const m = new Map<string, ScraperZone[]>();
    for (const z of zones) {
      const pl = placement.get(z.zone_key);
      if (pl?.poly) m.set(pl.poly, [...(m.get(pl.poly) ?? []), z]);
    }
    return m;
  }, [zones, placement]);
  const markers = useMemo(() => zones.filter((z) => placement.get(z.zone_key)?.pt), [zones, placement]);
  const unplaced = useMemo(
    () => zones.filter((z) => !placement.get(z.zone_key)).sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base", numeric: true })),
    [zones, placement],
  );

  // ── Vista (zoom y arrastre) ───────────────────────────────────────────────
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 500 });
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const viewRef = useRef<View>(view);
  const raf = useRef(0);
  const touched = useRef(false);

  const applyView = useCallback((v: View) => {
    viewRef.current = v;
    setView(v);
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientWidth < 520 ? 480 : 540 });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
    // El contenedor del mapa solo existe cuando ya han cargado los contornos.
  }, [geo, match]);

  const bounds = useMemo(() => {
    const box = (list: Poly[]) =>
      list.reduce<[number, number, number, number]>((b, p) => [Math.min(b[0], p.box[0]), Math.min(b[1], p.box[1]), Math.max(b[2], p.box[2]), Math.max(b[3], p.box[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    return { capital: box(polys.filter((p) => p.f.k === "d")), all: box(polys.filter((p) => p.f.k === "m" || p.f.k === "d")) };
  }, [polys]);

  const fitK = useCallback((b: [number, number, number, number], pad = 0.94) => Math.min(size.w / Math.max(b[2] - b[0], 1e-6), size.h / Math.max(b[3] - b[1], 1e-6)) * pad, [size.w, size.h]);
  const kCap = isFinite(bounds.capital[0]) ? fitK(bounds.capital) : 1;
  const kAll = isFinite(bounds.all[0]) ? fitK(bounds.all) : 1;
  const kMin = kAll * 0.8;
  const kMax = kCap * 80; // rango amplio: de toda la Comunidad a una calle

  const viewFor = useCallback(
    (b: [number, number, number, number], pad = 0.94, maxK = kMax): View => {
      const k = Math.min(fitK(b, pad), maxK);
      const w = b[2] - b[0];
      const h = b[3] - b[1];
      return { k, x: (size.w - w * k) / 2 - b[0] * k, y: (size.h - h * k) / 2 - b[1] * k };
    },
    [fitK, kMax, size.w, size.h],
  );

  /** Anima el cambio de vista (zoom en escala logarítmica: se nota igual de suave de lejos que de cerca). */
  const animateTo = useCallback(
    (to: View, ms = 260) => {
      cancelAnimationFrame(raf.current);
      const from = { ...viewRef.current };
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - p, 3);
        applyView({ k: from.k * Math.pow(to.k / from.k, e), x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
        if (p < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    },
    [applyView],
  );
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Encuadre inicial: Madrid capital; se repite si cambia el tamaño, hasta que la persona toca el mapa.
  useEffect(() => {
    if (!touched.current && polys.length && size.w > 0 && isFinite(bounds.capital[0])) applyView(viewFor(bounds.capital));
  }, [polys.length, bounds, viewFor, applyView, size.w, size.h]);

  /** Zoom alrededor de un punto de pantalla; `animate` para botones y doble toque. */
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number, animate = false) => {
      touched.current = true;
      const v = viewRef.current;
      const k = clamp(v.k * factor, kMin, kMax);
      const r = k / v.k;
      const to = { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
      if (animate) animateTo(to);
      else {
        cancelAnimationFrame(raf.current);
        applyView(to);
      }
    },
    [kMin, kMax, animateTo, applyView],
  );

  const goTo = useCallback(
    (to: View) => {
      touched.current = true;
      animateTo(to, 380);
    },
    [animateTo],
  );

  // ── Gestos: toque ≠ arrastre ≠ pellizco ≠ pulsación larga ──────────────────
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, multi: false, downAt: 0, longDone: false });
  const pinch = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; run: () => void } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  /** Zona principal de un contorno (la de ruta más corta). */
  const primaryOf = useCallback(
    (polyId: string) => (zonesByPoly.get(polyId) ?? []).slice().sort((a, b) => a.zone_key.split("/").length - b.zone_key.split("/").length)[0],
    [zonesByPoly],
  );

  /** Marca o desmarca (Sin marcar ⇄ Marcada; Alta pasa a Sin marcar) y avisa con «Deshacer». */
  const toggle = useCallback(
    (key: string) => {
      const z = zoneByKey.get(key);
      if (!z) return;
      setSelected(key);
      if (disabled || tapMode === "view") return;
      const prev = z.priority;
      const next: ZonePriority = prev === "off" ? "normal" : "off";
      onSet(z, next);
      setSnack({
        text: `${stripParen(z.label)} ${next === "off" ? "sin marcar" : "marcada"}`,
        undo: () => {
          const cur = zoneByKey.get(key);
          if (cur) onSet(cur, prev);
          setSnack(null);
        },
      });
    },
    [zoneByKey, disabled, tapMode, onSet],
  );

  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(() => setSnack(null), 6000);
    return () => clearTimeout(t);
  }, [snack]);

  const onDown = (e: React.PointerEvent) => {
    touched.current = true;
    cancelAnimationFrame(raf.current);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (ptrs.current.size === 1) {
      g.moved = 0;
      g.multi = false;
      g.longDone = false;
      g.downAt = Date.now();
      // Pulsación larga sobre una zona: solo ver su información, sin cambiarla.
      const el = (e.target as Element).closest("[data-pid],[data-zk]");
      if (el) {
        const pid = el.getAttribute("data-pid");
        const zk = el.getAttribute("data-zk");
        clearHold();
        holdTimer.current = setTimeout(() => {
          if (gesture.current.moved > 6 || ptrs.current.size !== 1) return;
          const key = zk ?? (pid ? primaryOf(pid)?.zone_key : undefined);
          if (key) {
            gesture.current.longDone = true;
            setSelected(key);
            if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(20);
          }
        }, TAP_MS);
      }
    } else {
      g.multi = true;
      clearHold();
    }
    pinch.current = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    if (!p) return;
    const n = { x: e.clientX, y: e.clientY };
    const g = gesture.current;
    if (ptrs.current.size === 1) {
      const dx = n.x - p.x;
      const dy = n.y - p.y;
      g.moved += Math.abs(dx) + Math.abs(dy);
      if (g.moved > 6) clearHold();
      const v = viewRef.current;
      applyView({ ...v, x: v.x + dx, y: v.y + dy });
    } else if (ptrs.current.size === 2) {
      ptrs.current.set(e.pointerId, n);
      const [a, b] = [...ptrs.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current > 0 && dist > 0) {
        const rect = svgRef.current!.getBoundingClientRect();
        zoomAt(dist / pinch.current, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      }
      pinch.current = dist;
      g.moved += 10;
    }
    ptrs.current.set(e.pointerId, n);
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    pinch.current = 0;
    clearHold();
  };

  /** Toque/clic (llega tras soltar). Un arrastre, un pellizco o una pulsación larga no cuentan. */
  const onClick = (e: React.MouseEvent) => {
    const g = gesture.current;
    if (g.moved > 6 || g.multi || g.longDone || Date.now() - g.downAt > TAP_MS) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const el = (e.target as Element).closest("[data-pid],[data-zk]");
    const key = el?.getAttribute("data-zk") ?? (el?.getAttribute("data-pid") ? primaryOf(el.getAttribute("data-pid")!)?.zone_key : undefined);

    const now = Date.now();
    const last = lastTap.current;
    if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(cx - last.x, cy - last.y) < 30) {
      // Doble toque/clic: acerca y NO marca (se cancela el primer toque pendiente).
      if (last.timer) clearTimeout(last.timer);
      lastTap.current = null;
      zoomAt(2.2, cx, cy, true);
      return;
    }
    if (last?.timer) {
      // Otro toque en otro sitio: el pendiente se ejecuta ya.
      clearTimeout(last.timer);
      last.run();
    }
    const run = () => {
      lastTap.current = null;
      if (key) toggle(key);
    };
    lastTap.current = { t: now, x: cx, y: cy, run, timer: setTimeout(run, TAP_DELAY_MS) };
  };

  // La rueda hace zoom en pasos pequeños (y el pellizco del trackpad, que llega como Ctrl + rueda).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-clamp(e.deltaY, -40, 40) * 0.006), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [zoomAt, polys.length]);

  // ── Encuadrar una zona ────────────────────────────────────────────────────
  const familyView = useCallback(
    (z: ScraperZone): View | null => {
      const fam = new Map(zones.map((x) => [x.zone_key, x]));
      const kids = new Map<string, ScraperZone[]>();
      for (const x of zones) if (x.parent_key) kids.set(x.parent_key, [...(kids.get(x.parent_key) ?? []), x]);
      const all: ScraperZone[] = [];
      const walk = (c: ScraperZone, d = 0) => {
        all.push(c);
        if (d < 8) (kids.get(c.zone_key) ?? []).forEach((k) => walk(k, d + 1));
      };
      if (fam.has(z.zone_key)) walk(z);
      let box: [number, number, number, number] | null = null;
      const add = (b: [number, number, number, number]) => {
        box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
      };
      for (const c of all) {
        const pl = placement.get(c.zone_key);
        if (pl?.poly && polyById.has(pl.poly)) add(polyById.get(pl.poly)!.box);
        else if (pl?.pt) {
          const x = px(pl.pt[0]);
          const y = py(pl.pt[1]);
          add([x - 3, y - 3, x + 3, y + 3]);
        }
      }
      return box ? viewFor(box, 0.8, kCap * 60) : null;
    },
    [zones, placement, polyById, viewFor, kCap],
  );
  const zoomToZone = useCallback(
    (z: ScraperZone) => {
      const v = familyView(z);
      if (v) goTo(v);
    },
    [familyView, goTo],
  );

  // «Ver en el mapa» desde la lista
  useEffect(() => {
    if (!focusKey || !polys.length || !match) return;
    const z = zoneByKey.get(focusKey);
    if (z) {
      setSelected(z.zone_key);
      zoomToZone(z);
    }
    onFocusDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, polys.length, match]);

  // ── Subzonas de un municipio ───────────────────────────────────────────────
  /** Contorno del municipio al que pertenece una zona (ella misma o un antecesor), si lo tiene. */
  const muniOf = useCallback(
    (z: ScraperZone | null | undefined): string | null => {
      for (let c: ScraperZone | null | undefined = z, i = 0; c && i < 8; c = c.parent_key ? zoneByKey.get(c.parent_key) : null, i++) {
        const poly = placement.get(c.zone_key)?.poly;
        const f = poly ? polyById.get(poly)?.f : undefined;
        if (f?.k === "m") return f.id;
        if (f?.k === "s" && f.p) return f.p;
      }
      return null;
    },
    [zoneByKey, placement, polyById],
  );
  const activeMuni = useMemo(() => muniOf(selected ? zoneByKey.get(selected) : null), [muniOf, selected, zoneByKey]);
  const munisWithSubs = useMemo(() => polys.filter((p) => p.f.k === "m" && polys.some((q) => q.f.k === "s" && q.f.p === p.f.id)), [polys]);
  // Municipios cuyas subzonas se dibujan: el elegido, y los que ocupan bastante pantalla y se ven.
  const subsKey = (() => {
    const ids: string[] = [];
    const x0 = -view.x / view.k;
    const x1 = (size.w - view.x) / view.k;
    const y0 = -view.y / view.k;
    const y1 = (size.h - view.y) / view.k;
    for (const m of munisWithSubs) {
      const [bx0, by0, bx1, by1] = m.box;
      const visible = bx1 > x0 && bx0 < x1 && by1 > y0 && by0 < y1;
      if (m.f.id === activeMuni || (visible && (bx1 - bx0) * view.k >= SUBS_MIN_PX)) ids.push(m.f.id);
    }
    return ids.sort().join("|");
  })();
  const subsVisible = useMemo(() => new Set(subsKey ? subsKey.split("|") : []), [subsKey]);

  // Al elegir un municipio con subzonas se acerca a él (si aún se ve pequeño) para que se vean sus barrios.
  const lastAuto = useRef<string | null>(null);
  useEffect(() => {
    if (!selected || lastAuto.current === selected) return;
    const z = zoneByKey.get(selected);
    const poly = z ? placement.get(z.zone_key)?.poly : undefined;
    if (!z || !poly || polyById.get(poly)?.f.k !== "m" || !munisWithSubs.some((m) => m.f.id === poly)) return;
    lastAuto.current = selected;
    const v = familyView(z);
    if (v && viewRef.current.k < v.k * 0.7) goTo(v);
  }, [selected, zoneByKey, placement, polyById, munisWithSubs, familyView, goTo]);
  useEffect(() => {
    if (!selected) lastAuto.current = null;
  }, [selected]);

  // ── Etiquetas progresivas y sin solapes ────────────────────────────────────
  // Se calculan por «nivel» de zoom (cuantizado) y se colocan de la más importante a la menos,
  // descartando las que se pisan o no caben. Así al acercar van apareciendo y nunca se amontonan.
  const level = Math.round(Math.log2(Math.max(view.k, 1e-6) / Math.max(kCap, 1e-6)) * 5) / 5;
  const kq = kCap * Math.pow(2, level);
  const showBarrios = kq >= kCap * BARRIOS_FROM;
  const labels = useMemo<Label[]>(() => {
    if (!polys.length) return [];
    const k = kq;
    const cands = polys
      .filter((p) => (p.f.k === "m" && !subsVisible.has(p.f.id)) || (p.f.k === "d" && !showBarrios) || (p.f.k === "b" && showBarrios) || (p.f.k === "s" && !!p.f.p && subsVisible.has(p.f.p)))
      .map((p) => ({ p, w: (p.box[2] - p.box[0]) * k, h: (p.box[3] - p.box[1]) * k, hasZone: zonesByPoly.has(p.f.id) }))
      .filter((c) => (c.p.f.k === "s" ? c.w >= 18 && c.h >= 8 : c.w >= 26 && c.h >= 14))
      .sort((a, b) => Number(b.hasZone) - Number(a.hasZone) || b.w * b.h - a.w * a.h);
    const placed: Array<[number, number, number, number]> = [];
    const out: Label[] = [];
    for (const { p } of cands) {
      const w = (p.f.n.length * 6.3 + 10) / k;
      const h = 17 / k;
      const b: [number, number, number, number] = [p.cx - w / 2, p.cy - h / 2, p.cx + w / 2, p.cy + h / 2];
      if (placed.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
      placed.push(b);
      out.push({ id: p.f.id, n: p.f.n, x: p.cx, y: p.cy });
    }
    return out;
  }, [polys, kq, showBarrios, zonesByPoly, subsVisible]);

  // ── Calles: teselas OSM del encuadre actual ─────────────────────────
  const tiles = useMemo(() => {
    if (!streets || size.w <= 0) return [];
    const m = 128; // medio tesela de margen para que no se vea el borde al arrastrar
    const lonW = xToLon((-m - view.x) / view.k);
    const lonE = xToLon((size.w + m - view.x) / view.k);
    const latN = yToLat((-m - view.y) / view.k);
    const latS = yToLat((size.h + m - view.y) / view.k);
    const zIdeal = Math.log2((view.k * COS * S * 360) / TILE_SIZE);
    const z0 = clamp(Math.round(zIdeal), TILE_MIN_Z, TILE_MAX_Z);
    const out: Array<{ key: string; src: string; l: number; t: number; w: number; h: number }> = [];
    // Nivel actual y, debajo, el anterior (casi siempre ya en caché): sin parpadeos al cambiar de zoom.
    for (const z of z0 > TILE_MIN_Z ? [z0 - 1, z0] : [z0]) {
      const n = 2 ** z;
      const a = latLngToTile(latN, lonW, z);
      const b = latLngToTile(latS, lonE, z);
      const x0 = Math.floor(a.x);
      const x1 = Math.floor(b.x);
      const y0 = Math.max(0, Math.floor(a.y));
      const y1 = Math.min(n - 1, Math.floor(b.y));
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 30) continue; // salvaguarda: nunca una avalancha de teselas
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const nw = worldPixelToLatLng(tx * TILE_SIZE, ty * TILE_SIZE, z);
          const se = worldPixelToLatLng((tx + 1) * TILE_SIZE, (ty + 1) * TILE_SIZE, z);
          const l = lonToX(nw.lng) * view.k + view.x;
          const t = latToY(nw.lat) * view.k + view.y;
          const r = lonToX(se.lng) * view.k + view.x;
          const bo = latToY(se.lat) * view.k + view.y;
          const tileX = ((tx % n) + n) % n;
          out.push({ key: `${z}/${tileX}/${ty}`, src: TILE_URL(z, tileX, ty), l: Math.floor(l), t: Math.floor(t), w: Math.ceil(r) - Math.floor(l) + 1, h: Math.ceil(bo) - Math.floor(t) + 1 });
        }
      }
    }
    return out;
  }, [streets, view, size.w, size.h]);

  // ── Teclado: flechas recorren las zonas con posición; Enter/Espacio marca; +/− zoom ──
  const navigable = useMemo(
    () => zones.filter((z) => placement.get(z.zone_key)).sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" })),
    [zones, placement],
  );
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") zoomAt(1.4, size.w / 2, size.h / 2, true);
    else if (e.key === "-") zoomAt(1 / 1.4, size.w / 2, size.h / 2, true);
    else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && navigable.length) {
      e.preventDefault();
      const i = navigable.findIndex((z) => z.zone_key === selected);
      const n = (i + (e.key === "ArrowRight" ? 1 : -1) + navigable.length) % navigable.length;
      setSelected(navigable[n].zone_key);
    } else if ((e.key === "Enter" || e.key === " ") && selected) {
      e.preventDefault();
      toggle(selected);
    }
  };

  // ── Panel de la zona elegida ───────────────────────────────────────────────
  const sel = selected ? zoneByKey.get(selected) ?? null : null;
  const buildNode = useMemo(() => {
    const kids = new Map<string, ScraperZone[]>();
    for (const z of zones) if (z.parent_key) kids.set(z.parent_key, [...(kids.get(z.parent_key) ?? []), z]);
    const build = (z: ScraperZone, depth = 0): TreeNode => ({ z, children: depth > 8 ? [] : (kids.get(z.zone_key) ?? []).map((c) => build(c, depth + 1)) });
    return build;
  }, [zones]);
  const selNode = sel ? buildNode(sel) : null;
  const selFamily = selNode ? family(selNode) : [];
  const parent = sel?.parent_key ? zoneByKey.get(sel.parent_key) ?? null : null;
  const parentFamily = parent ? family(buildNode(parent)) : [];
  const selPlace = sel ? placement.get(sel.zone_key) : undefined;
  const shared = selPlace?.poly ? (zonesByPoly.get(selPlace.poly) ?? []).filter((z) => z.zone_key !== sel?.zone_key) : [];
  const selectedPoly = selPlace?.poly ?? null;
  const trail: string[] = [];
  for (let z: ScraperZone | null | undefined = parent, i = 0; z && i < 6; z = z.parent_key ? zoneByKey.get(z.parent_key) : null, i++) trail.unshift(z.label);

  const marked = zones.filter((z) => z.priority !== "off").length;

  // Subzonas del municipio activo: lista de chips (con o sin contorno), siempre marcables.
  const muniRoot = activeMuni ? primaryOf(activeMuni) : undefined;
  const muniKids = muniRoot ? family(buildNode(muniRoot)).filter((z) => z.zone_key !== muniRoot.zone_key) : [];
  const muniKidsSorted = muniKids.slice().sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base", numeric: true }));
  const muniMarked = muniKids.filter((z) => z.priority !== "off").length;
  const where = (z: ScraperZone) => {
    const pl = placement.get(z.zone_key);
    return pl?.poly && polyById.get(pl.poly)?.f.k === "s" ? "contorno en el mapa" : pl?.poly ? "contorno del municipio" : pl?.pt ? "marcador en el mapa" : "solo en la lista";
  };

  if (loadErr) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">No se pudieron cargar los contornos del mapa. La lista funciona igual.</p>;
  if (!geo || !match)
    return (
      <p role="status" className="rounded-xl border border-ink/10 bg-white p-6 text-sm text-ink/70">
        Cargando contornos…
      </p>
    );

  const ctlBtn = "flex h-11 w-11 items-center justify-center rounded-xl border border-ink/15 bg-white shadow-sm hover:bg-cream-50";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">Al tocar una zona:</span>
        <Segmented
          value={tapMode}
          onChange={setTapMode}
          ariaLabel="Qué hace un toque en el mapa"
          options={[
            { value: "toggle", label: "Marcar / desmarcar" },
            { value: "view", label: "Solo ver datos" },
          ]}
        />
        <label className="ml-auto inline-flex h-11 cursor-pointer items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={streets} onChange={(e) => setStreets(e.target.checked)} className="h-5 w-5 accent-[#3a7d68]" />
          Ver calles
        </label>
      </div>

      <div
        ref={boxRef}
        tabIndex={0}
        role="group"
        aria-label={`Mapa de zonas de ${PORTAL_LABEL[portal]}. Flechas izquierda y derecha para recorrer las zonas, Intro para marcar o desmarcar, más y menos para el zoom. También puedes usar la vista Lista.`}
        onKeyDown={onKey}
        className={cn("relative overflow-hidden rounded-xl border border-ink/15 bg-[#fbf9f4]", FOCUS_RING)}
        style={{ height: size.h, touchAction: "none" }}
      >
        {streets && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {tiles.map((t) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={t.key}
                src={t.src}
                alt=""
                draggable={false}
                decoding="async"
                referrerPolicy="strict-origin-when-cross-origin"
                className="absolute max-w-none select-none"
                style={{ left: t.l, top: t.t, width: t.w, height: t.h }}
              />
            ))}
          </div>
        )}
        <svg
          ref={svgRef}
          width="100%"
          height={size.h}
          className="relative block select-none"
          style={{ touchAction: "none", cursor: "grab" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          onClick={onClick}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <PolyLayer polys={polys} zonesByPoly={zonesByPoly} showBarrios={showBarrios} selectedPoly={selectedPoly} subsVisible={subsVisible} />
            <LabelLayer labels={labels} k={view.k} />
            {/* Marcadores de zonas sin contorno propio: en la mediana de sus anuncios */}
            <g>
              {markers.map((z) => {
                const pt = placement.get(z.zone_key)!.pt!;
                const r = (view.k < kCap * 1.5 ? 4.5 : 8) / view.k;
                const isSel = z.zone_key === selected;
                return (
                  <g key={z.zone_key} data-zk={z.zone_key} transform={`translate(${px(pt[0])} ${py(pt[1])})`} style={{ cursor: "pointer" }} role="button" aria-label={`${z.label}: ${stateWord(z.priority)}`}>
                    <circle r={r * 2.2} fill="transparent" />
                    <circle r={r} fill={FILL[z.priority]} stroke={isSel ? "#0a0a0a" : "#ffffff"} strokeWidth={isSel ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" />
                    {z.priority !== "off" ? null : <circle r={r * 0.35} fill="#8a8170" />}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        <div className="absolute right-2 top-2 flex flex-col gap-1.5">
          <button type="button" aria-label="Acercar" onClick={() => zoomAt(1.6, size.w / 2, size.h / 2, true)} className={cn(ctlBtn, FOCUS_RING)}>
            <Plus size={18} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Alejar" onClick={() => zoomAt(1 / 1.6, size.w / 2, size.h / 2, true)} className={cn(ctlBtn, FOCUS_RING)}>
            <Minus size={18} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Ver toda la Comunidad de Madrid" title="Toda la Comunidad" onClick={() => goTo(viewFor(bounds.all))} className={cn(ctlBtn, FOCUS_RING)}>
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </div>
        <span className="pointer-events-none absolute bottom-0 right-0 rounded-tl-lg bg-white/85 px-1.5 py-0.5 text-[11px] leading-tight text-ink/80">
          ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="pointer-events-auto underline">
            OpenStreetMap contributors
          </a>
        </span>
        <button type="button" onClick={() => goTo(viewFor(bounds.capital))} className={cn("absolute bottom-2 left-2 h-11 rounded-xl border border-ink/15 bg-white px-3 text-sm font-semibold shadow-sm hover:bg-cream-50", FOCUS_RING)}>
          Ver todo
        </button>

        {snack && (
          <div role="status" aria-live="polite" className="absolute left-2 right-14 top-2 z-10 flex items-center justify-between gap-2 rounded-xl bg-ink px-3 py-1 text-sm text-cream-50 shadow-lg">
            <span className="min-w-0 leading-tight">{snack.text}</span>
            <button type="button" onClick={snack.undo} className={cn("h-11 shrink-0 rounded-lg px-3 text-sm font-bold text-gold underline-offset-2 hover:underline", FOCUS_RING)}>
              Deshacer
            </button>
          </div>
        )}
      </div>

      {muniRoot && muniKidsSorted.length > 0 && (
        <section className="mt-3 rounded-xl border border-ink/15 bg-white p-3" aria-label={`Barrios y subzonas de ${stripParen(muniRoot.label)}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-bold text-ink">
                Barrios y subzonas de {stripParen(muniRoot.label)} ({muniKidsSorted.length})
              </h4>
              <p className="text-sm text-ink/70">
                {muniMarked} de {muniKidsSorted.length} marcadas. Toca un barrio, en el mapa o aquí, para marcarlo o desmarcarlo.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" disabled={disabled} onClick={() => onFamily(muniKidsSorted, true)} className={cn(BTN_SECONDARY, FOCUS_RING)}>
                Marcar todos
              </button>
              <button type="button" disabled={disabled} onClick={() => onFamily(muniKidsSorted, false)} className={cn(BTN_SECONDARY, FOCUS_RING)}>
                Desmarcar todos
              </button>
              <button type="button" onClick={() => zoomToZone(muniRoot)} className={cn(BTN_SECONDARY, FOCUS_RING)}>
                Acercar al municipio
              </button>
            </div>
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {muniKidsSorted.map((z) => {
              const on = z.priority !== "off";
              return (
                <li key={z.zone_key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    title={`${z.label}: ${stateWord(z.priority)} (${where(z)})`}
                    onClick={() => toggle(z.zone_key)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-sm disabled:opacity-60",
                      on ? "border-[#1f5a48] bg-[#3a7d68]/15 font-semibold text-ink" : "border-ink/20 bg-white text-ink/80 hover:bg-cream-50",
                      z.zone_key === selected && "ring-2 ring-ink",
                      FOCUS_RING,
                    )}
                  >
                    <span aria-hidden="true" className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm border" style={{ background: FILL[z.priority], opacity: on ? 1 : 0.6, borderColor: STROKE[z.priority] }} />
                    <span>
                      {stripParen(z.label)}
                      <span className="block text-xs font-normal text-ink/65">
                        {stateWord(z.priority)} · {where(z)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/80" aria-label="Leyenda">
        {(["normal", "alta", "off"] as const).map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-sm border border-ink/20" style={{ background: FILL[p], borderColor: STROKE[p] }} />
            {p === "normal" ? "Marcada" : p === "alta" ? "Alta" : "Sin marcar"}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-sm border border-ink/20" style={{ background: NEUTRAL_FILL }} />
          Sin zona del crawler
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border border-white bg-ink/60 ring-1 ring-ink/30" />
          Marcador (subzona sin contorno)
        </span>
      </div>
      <ul className="mt-2 space-y-0.5 text-sm text-ink/80">
        <li>
          <strong>Marcada</strong>: se revisa a su ritmo normal.
        </li>
        <li>
          <strong>Alta</strong>: marcada y se revisa el doble de seguido (cuesta el doble de créditos).
        </li>
        <li>
          <strong>Sin marcar</strong>: no se revisa nada.
        </li>
      </ul>
      <p className="mt-2 text-sm text-ink/80" aria-live="polite">
        <strong>
          {marked} de {zones.length} zonas marcadas
        </strong>
        {unplaced.length > 0 && <> · {unplaced.length} sin posición en el mapa (más abajo)</>}
        {markers.length > 0 && <> · {markers.length} marcadores</>}
      </p>
      <p className="text-xs text-ink/65">
        Un toque marca o desmarca (para «Alta», usa el panel de abajo). Mantén pulsado para ver solo los datos. Arrastra para mover; pellizca, usa la rueda, doble toque o los botones para el zoom. Acerca el mapa o elige un municipio para ver y marcar sus barrios.
      </p>

      {sel ? (
        <div className="mt-3 rounded-xl border border-ink/15 bg-white p-4" role="region" aria-label={`Zona elegida: ${sel.label}`}>
          {trail.length > 0 && <p className="text-sm text-ink/65">{trail.join(" › ")}</p>}
          <div className="flex items-start justify-between gap-3">
            <h4 className="break-words text-base font-bold text-ink">{sel.label}</h4>
            <button type="button" onClick={() => setSelected(null)} className={cn("h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-ink/70 hover:bg-ink/5", FOCUS_RING)}>
              Cerrar
            </button>
          </div>
          <ZoneInfo z={sel} hasKids={selFamily.length > 1} />
          {selFamily.length > 1 && (
            <p className="mt-1 text-sm text-ink/75">
              {selFamily.filter((z) => z.priority !== "off").length} de {selFamily.length} marcadas contando sus barrios o subzonas.
            </p>
          )}
          {selPlace?.pt && <p className="mt-1 text-sm text-ink/65">Esta zona no tiene contorno oficial: el marcador está en el centro de sus anuncios.</p>}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <PrioritySelect value={sel.priority} onChange={(p) => onSet(sel, p)} label={`Estado de ${sel.label}`} disabled={disabled} />
            {selPlace && (
              <button type="button" onClick={() => zoomToZone(sel)} className={cn(BTN_SECONDARY, FOCUS_RING)}>
                Acercar aquí
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {selFamily.length > 1 && (
              <>
                <button type="button" disabled={disabled} onClick={() => onFamily(selFamily, true)} className={cn(BTN_SECONDARY, FOCUS_RING)}>
                  Marcar {sel.label} con todos sus barrios ({selFamily.length})
                </button>
                <button type="button" disabled={disabled} onClick={() => onFamily(selFamily, false)} className={cn(BTN_SECONDARY, FOCUS_RING)}>
                  Desmarcar todo
                </button>
              </>
            )}
            {parent && parentFamily.length > 1 && (
              <button type="button" disabled={disabled} onClick={() => onFamily(parentFamily, true)} className={cn(BTN_SECONDARY, FOCUS_RING)}>
                Marcar todo {stripParen(parent.label)} ({parentFamily.length})
              </button>
            )}
          </div>
          {shared.length > 0 && (
            <p className="mt-3 text-sm text-ink/75">
              Este contorno también corresponde a:{" "}
              {shared.map((z, i) => (
                <span key={z.zone_key}>
                  {i > 0 && ", "}
                  <button type="button" className={cn("rounded font-semibold underline", FOCUS_RING)} onClick={() => setSelected(z.zone_key)}>
                    {z.label}
                  </button>
                </span>
              ))}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-ink/20 bg-cream-50/60 p-4 text-sm text-ink/70">Toca una zona del mapa para marcarla o desmarcarla; aquí verás sus datos.</p>
      )}

      {unplaced.length > 0 && (
        <details className="mt-4 rounded-xl border border-ink/10 bg-white p-3">
          <summary className={cn("cursor-pointer text-sm font-bold text-ink", FOCUS_RING)}>Sin posición en el mapa ({unplaced.length})</summary>
          <p className="mt-2 text-sm text-ink/70">Zonas que no tienen contorno oficial ni anuncios suficientes para colocarlas. Se pueden marcar igual desde aquí o desde la lista.</p>
          <ul className="mt-2">
            {unplaced.slice(0, more).map((z) => (
              <li key={z.zone_key} className="flex flex-col gap-1.5 border-t border-ink/10 py-2 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0 break-words">
                  <p className="text-sm font-medium text-ink">{z.label}</p>
                  {z.parent_key && zoneByKey.get(z.parent_key) && <p className="text-sm text-ink/65">en {zoneByKey.get(z.parent_key)!.label}</p>}
                  <p className="text-sm text-ink/65">{(z.listings_sale ?? 0) + (z.listings_rent ?? 0) > 0 ? `${fmt((z.listings_sale ?? 0) + (z.listings_rent ?? 0))} anuncios` : "Anuncios: aún sin contar"}</p>
                </div>
                <PrioritySelect value={z.priority} onChange={(p) => onSet(z, p)} label={`Estado de ${z.label}`} disabled={disabled} />
              </li>
            ))}
          </ul>
          {unplaced.length > more && (
            <button type="button" onClick={() => setMore((m) => m + 60)} className={cn(BTN_SECONDARY, "mt-2 w-full", FOCUS_RING)}>
              Mostrar más ({unplaced.length - more} restantes)
            </button>
          )}
        </details>
      )}

      <p className="mt-3 text-xs text-ink/60">
        {geo.attribution}. Datos del {geo.generated}. Mapa de calles © colaboradores de OpenStreetMap.
      </p>
    </div>
  );
}
