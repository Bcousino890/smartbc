"use client";

/**
 * Editor de zonas sobre el mapa de captaciones. Capas Leaflet PROPIAS (no
 * leaflet-draw): el polígono, los vértices y los puntos medios se pintan en
 * dos panes nuestros. La lógica de estado vive en el reductor puro
 * (lib/captaciones-map/zone-editor-reducer.ts); aquí solo se traducen gestos
 * a acciones y estado a capas.
 *
 * Capas (z-index): velo 250 < zonas 350 < overlayPane 400 (pines de canvas)
 * < markerPane 600 (pines con precio) < asas 650. Los polígonos no son
 * interactivos, así que los pines siguen siendo pulsables; solo las asas
 * (vértices y puntos medios) tienen prioridad sobre ellos.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import L from "leaflet";
import type { ZonePolygon, ZonePolygonPoint } from "@/lib/zone-polygon";
import { isValidZoneRing } from "@/lib/geo/zone-geometry";
import {
  MAX_POLYGONS,
  MIN_RADIUS_M,
  initialEditorState,
  zoneEditorReducer,
  type EditorState,
  type EditorTool,
} from "@/lib/captaciones-map/zone-editor-reducer";

export type { EditorTool, EditorState };

/** Texto compartido con la tarjeta de ayuda (misma frase en el título del primer vértice). */
export const CROSS_TITLE = "El trazado se cruza: deshaz el último punto o empieza de nuevo";

/** Por qué el editor no ha aceptado un gesto (para avisar en la interfaz). */
export type ZoneRejectReason = "invalid" | "max";

/** Radio (px) en que el 2.º clic de un doble clic se considera el mismo punto. */
const DBLCLICK_PX = 8;
const WARN = "#c0392b";
const GOLD = "#c9a96e";
const GOLD_STROKE = "#b8954f";

const toLatLng = (p: ZonePolygonPoint): L.LatLngExpression => [p[1], p[0]];
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** ≥1 km se muestra en km con coma decimal, como el resto del CRM. */
function formatRadius(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2).replace(".", ",")} km` : `${Math.round(m)} m`;
}

export function useZoneEditor(
  map: L.Map | null,
  initial: ZonePolygon[],
  onChange: (p: ZonePolygon[]) => void,
  /**
   * Opcional (no cambia el contrato de quien ya lo usa): avisa cuando un gesto
   * se descarta en silencio — cerrar una zona que se cruza consigo misma o
   * pasar de MAX_POLYGONS —, porque el reductor devuelve el mismo estado y
   * desde fuera no se nota nada.
   */
  opts?: { onReject?: (reason: ZoneRejectReason) => void },
): {
  state: EditorState;
  setTool: (t: EditorTool) => void;
  clear: () => void;
  setPolygons: (p: ZonePolygon[]) => void;
  /** Cierra el borrador si es válido (≥3 puntos, sin cruces, < 5 zonas). */
  closeDraft: () => void;
  /** Quita el último vértice del borrador. */
  undoLastPoint: () => void;
  /**
   * Borrador con ≥3 puntos que NO se puede cerrar (se cruza o es degenerado).
   * Es estado derivado y persistente: la interfaz lo muestra mientras dure,
   * no como un aviso que se apaga solo.
   */
  draftInvalid: boolean;
} {
  const [state, dispatch] = useReducer(zoneEditorReducer, initial, initialEditorState);
  // Fuerza el redibujado al soltar un arrastre: si el reductor rechaza el
  // movimiento (lazo) devuelve el mismo estado, React no re-renderiza y las
  // capas se quedarían en la posición inválida.
  const [bump, setBump] = useState(0);
  const redraw = useCallback(() => setBump((b) => b + 1), []);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Siempre el callback vigente: los cierres de Leaflet viven más que el render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onRejectRef = useRef(opts?.onReject);
  onRejectRef.current = opts?.onReject;

  // Cursor del ratón en modo dibujo (para que la vista previa sobreviva a un redibujado).
  const cursorRef = useRef<L.LatLng | null>(null);
  const previewRef = useRef<L.Polyline | null>(null);

  const setTool = useCallback((tool: EditorTool) => dispatch({ type: "setTool", tool }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  /**
   * Único camino para cerrar (doble clic, primer vértice, Enter y botón).
   * Un cruce no avisa aquí: la tarjeta de ayuda ya lo explica en vivo y el
   * botón está deshabilitado; solo el tope de zonas es un aviso puntual.
   */
  const closeDraft = useCallback(() => {
    const s = stateRef.current;
    if (s.draft.length < 3) return;
    if (s.polygons.length >= MAX_POLYGONS) {
      onRejectRef.current?.("max");
      return;
    }
    if (!isValidZoneRing(s.draft)) return;
    dispatch({ type: "closeDraft" });
  }, []);
  const undoLastPoint = useCallback(() => dispatch({ type: "undoLastPoint" }), []);
  const draftInvalid = useMemo(
    () => state.draft.length >= 3 && !isValidZoneRing(state.draft),
    [state.draft],
  );
  const setPolygons = useCallback(
    (polygons: ZonePolygon[]) => dispatch({ type: "setPolygons", polygons }),
    [],
  );

  // --- onChange con la lista completa, vértices a 5 decimales ---
  const emittedRef = useRef<ZonePolygon[]>(state.polygons);
  useEffect(() => {
    if (emittedRef.current === state.polygons) return;
    emittedRef.current = state.polygons;
    onChangeRef.current(
      state.polygons.map((ring) => ring.map(([lng, lat]): ZonePolygonPoint => [round5(lng), round5(lat)])),
    );
  }, [state.polygons]);

  // --- panes y estilos (una vez por mapa) ---
  useEffect(() => {
    if (!map) return;
    ensureCss();
    const zones = map.getPane("cm-zones") ?? map.createPane("cm-zones");
    zones.style.zIndex = "350";
    zones.style.pointerEvents = "none";
    const handles = map.getPane("cm-zone-handles") ?? map.createPane("cm-zone-handles");
    handles.style.zIndex = "650";
  }, [map]);

  // --- Teclado del editor. Esc cancela el borrador (único dueño; el círculo en
  // curso se cancela al soltar fuera o cambiar de herramienta). Enter cierra y
  // Retroceso/Supr quitan el último punto, solo dibujando y sin escribir en un campo. ---
  useEffect(() => {
    if (!map) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dispatch({ type: "cancelDraft" });
        return;
      }
      if (stateRef.current.tool !== "draw" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      // Escribir en un input/área/select (p. ej. la barra de IA) no debe tocar el trazado;
      // y Enter sobre un botón/enlace enfocado ya hace su propia acción.
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "Enter") {
        if (t && /^(BUTTON|A|SUMMARY)$/.test(t.tagName)) return;
        if (stateRef.current.draft.length >= 3) {
          e.preventDefault();
          closeDraft();
        }
      } else if ((e.key === "Backspace" || e.key === "Delete") && stateRef.current.draft.length) {
        e.preventDefault();
        dispatch({ type: "undoLastPoint" });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [map, closeDraft]);

  // --- gestos según la herramienta ---
  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    container.classList.add("cm-tool-" + state.tool);
    const cleanups: Array<() => void> = [() => container.classList.remove("cm-tool-" + state.tool)];

    if (state.tool === "draw") {
      // Un doble clic cerraría el polígono Y haría zoom: el zoom se apaga mientras se dibuja.
      map.doubleClickZoom.disable();
      const onClick = (e: L.LeafletMouseEvent) => {
        // El 2º clic de un doble clic no es un vértice nuevo. Solo se descarta si
        // además cae pegado al último vértice: quien coloca puntos deprisa también
        // produce detail>=2 (clics a <500 ms) y no debe perderlos.
        if ((e.originalEvent as MouseEvent).detail >= 2) {
          const d = stateRef.current.draft;
          const last = d[d.length - 1];
          if (!last) return;
          const a = map.latLngToContainerPoint(toLatLng(last));
          if (a.distanceTo(e.containerPoint) < DBLCLICK_PX) return;
        }
        // Ya hay el máximo de zonas: se avisa en el primer clic, no al cerrar.
        if (stateRef.current.polygons.length >= MAX_POLYGONS && stateRef.current.draft.length === 0) {
          onRejectRef.current?.("max");
          return;
        }
        dispatch({ type: "addDraftPoint", point: [e.latlng.lng, e.latlng.lat] });
      };
      const onDbl = () => closeDraft();
      const onMove = (e: L.LeafletMouseEvent) => {
        cursorRef.current = e.latlng;
        const line = previewRef.current;
        const draft = stateRef.current.draft;
        if (line && draft.length) {
          line.setLatLngs([...draft.map(toLatLng), e.latlng]);
        }
      };
      map.on("click", onClick);
      map.on("dblclick", onDbl);
      map.on("mousemove", onMove);
      cleanups.push(() => {
        map.off("click", onClick);
        map.off("dblclick", onDbl);
        map.off("mousemove", onMove);
        map.doubleClickZoom.enable();
        cursorRef.current = null;
      });
    }

    if (state.tool === "circle") {
      const layer = L.layerGroup().addTo(map);
      let gesture: { center: L.LatLng; circle: L.Circle; label: L.Marker } | null = null;

      const finish = (commit: boolean, ev?: PointerEvent) => {
        if (!gesture) return;
        const g = gesture;
        gesture = null;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const radius = g.circle.getRadius();
        layer.clearLayers();
        map.dragging.enable();
        if (commit && ev) {
          dispatch({ type: "addCircle", center: [g.center.lng, g.center.lat], radiusM: radius });
        }
      };
      const onMove = (ev: PointerEvent) => {
        if (!gesture) return;
        const ll = map.mouseEventToLatLng(ev);
        const r = Math.max(map.distance(gesture.center, ll), 0);
        gesture.circle.setRadius(r);
        gesture.label.setLatLng(ll);
        const el = gesture.label.getElement();
        if (el) {
          el.textContent = r < MIN_RADIUS_M ? `mín. ${MIN_RADIUS_M} m` : formatRadius(r);
          el.classList.toggle("cm-radius-min", r < MIN_RADIUS_M);
        }
      };
      const onUp = (ev: PointerEvent) => finish(true, ev);
      // En fase de captura: el arrastre del mapa se desactiva ANTES de que
      // el manejador de arrastre de Leaflet reciba el mismo evento.
      const onDown = (ev: PointerEvent) => {
        if (ev.button !== 0 || gesture) return;
        const t = ev.target as HTMLElement;
        if (t.closest(".leaflet-marker-icon, .leaflet-control, .cm-toolbar")) return;
        if (stateRef.current.polygons.length >= MAX_POLYGONS) {
          onRejectRef.current?.("max");
          return;
        }
        map.dragging.disable();
        const center = map.mouseEventToLatLng(ev);
        const circle = L.circle(center, {
          radius: 0,
          pane: "cm-zones",
          interactive: false,
          color: GOLD_STROKE,
          weight: 2.5,
          dashArray: "8 6",
          fillColor: GOLD,
          fillOpacity: 0.14,
        }).addTo(layer);
        const label = L.marker(center, {
          pane: "cm-zone-handles",
          interactive: false,
          icon: L.divIcon({ className: "cm-radius-label", html: "", iconSize: undefined }),
        }).addTo(layer);
        gesture = { center, circle, label };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      };
      container.addEventListener("pointerdown", onDown, true);
      cleanups.push(() => {
        container.removeEventListener("pointerdown", onDown, true);
        if (gesture) finish(false);
        map.dragging.enable();
        layer.remove();
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, [map, state.tool, closeDraft]);

  // --- pintado: polígonos, asas y borrador (se reconstruye en cada cambio de estado) ---
  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    previewRef.current = null;
    const editing = state.tool === "edit";

    state.polygons.forEach((ring, pi) => {
      const latlngs = ring.map(toLatLng);
      // Brillo suave: el mismo contorno, más ancho y casi transparente, debajo del trazo.
      const glow = L.polygon(latlngs, {
        pane: "cm-zones", interactive: false, stroke: true, color: GOLD, weight: 9,
        opacity: 0.2, fill: false, lineJoin: "round",
      }).addTo(group);
      const poly = L.polygon(latlngs, {
        pane: "cm-zones", interactive: false, color: GOLD_STROKE, weight: 2.5,
        opacity: 1, fillColor: GOLD, fillOpacity: 0.16, lineJoin: "round",
      }).addTo(group);
      if (!editing) return;

      const mids: L.Marker[] = [];
      const setGeometry = (pts: ZonePolygon, withMids: boolean) => {
        const ll = pts.map(toLatLng);
        glow.setLatLngs(ll);
        poly.setLatLngs(ll);
        if (!withMids) return;
        mids.forEach((m, i) => {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          m.setLatLng(toLatLng([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]));
        });
      };

      ring.forEach((p, i) => {
        const q = ring[(i + 1) % ring.length];
        const mid = L.marker(toLatLng([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]), {
          pane: "cm-zone-handles", draggable: true, keyboard: false, autoPan: false,
          title: "Añadir vértice (clic o arrastrar)",
          icon: L.divIcon({ className: "cm-mid", html: "<i></i>", iconSize: [14, 14] }),
        }).addTo(group);
        mids.push(mid);
        // Arrastrar el punto medio: vista previa con el vértice nuevo ya insertado.
        mid.on("drag", () => {
          const ll = mid.getLatLng();
          const next = [...ring.slice(0, i + 1), [ll.lng, ll.lat] as ZonePolygonPoint, ...ring.slice(i + 1)];
          setGeometry(next, false);
        });
        mid.on("dragend", () => {
          const ll = mid.getLatLng();
          dispatch({ type: "insertMidpoint", polygon: pi, index: i });
          dispatch({ type: "moveVertex", polygon: pi, index: i + 1, point: [ll.lng, ll.lat] });
          redraw();
        });
        // Un clic sin arrastre inserta el vértice justo en el punto medio.
        mid.on("click", () => dispatch({ type: "insertMidpoint", polygon: pi, index: i }));
      });

      ring.forEach((p, i) => {
        const v = L.marker(toLatLng(p), {
          pane: "cm-zone-handles", draggable: true, keyboard: false, autoPan: false,
          title: "Arrastrar · doble clic para quitar",
          icon: L.divIcon({ className: "cm-vtx", html: "<i></i>", iconSize: [18, 18] }),
        }).addTo(group);
        v.on("drag", () => {
          const ll = v.getLatLng();
          setGeometry(ring.map((r, k) => (k === i ? ([ll.lng, ll.lat] as ZonePolygonPoint) : r)), true);
        });
        v.on("dragend", () => {
          const ll = v.getLatLng();
          dispatch({ type: "moveVertex", polygon: pi, index: i, point: [ll.lng, ll.lat] });
          redraw();
        });
        v.on("dblclick", () => dispatch({ type: "removeVertex", polygon: pi, index: i }));
      });
    });

    if (state.draft.length) {
      const pts: L.LatLngExpression[] = state.draft.map(toLatLng);
      const withCursor = state.tool === "draw" && cursorRef.current ? [...pts, cursorRef.current] : pts;
      previewRef.current = L.polyline(withCursor, {
        pane: "cm-zones", interactive: false, color: draftInvalid ? WARN : GOLD, weight: 3, dashArray: "8 6",
      }).addTo(group);
      const drawing = state.tool === "draw";
      state.draft.forEach((p, i) => {
        // Con ≥3 puntos el primero es el botón de cerrar: interactivo, con zona de
        // pulsación de 26 px (el anillo visible sigue siendo de 18) y resaltado.
        const closable = drawing && i === 0 && state.draft.length >= 3;
        const cls = `cm-vtx cm-vtx-draft${closable ? " cm-vtx-first" : ""}${draftInvalid ? " cm-vtx-bad" : ""}`;
        const m = L.marker(toLatLng(p), {
          pane: "cm-zone-handles", interactive: closable, keyboard: false,
          title: closable ? (draftInvalid ? CROSS_TITLE : "Cerrar zona") : undefined,
          icon: L.divIcon({ className: cls, html: "<i></i>", iconSize: closable ? [26, 26] : [18, 18] }),
        }).addTo(group);
        // Un clic en el primer vértice cierra; el marcador no deja pasar el clic al mapa
        // (bubblingMouseEvents por defecto en false), así que no añade un punto encima.
        if (closable) m.on("click", () => closeDraft());
      });
    }

    return () => {
      previewRef.current = null;
      group.remove();
    };
  }, [map, state.polygons, state.draft, state.tool, bump, redraw, draftInvalid, closeDraft]);

  return { state, setTool, clear, setPolygons, closeDraft, undoLastPoint, draftInvalid };
}

// Estilos de las asas del editor: se inyectan una sola vez (el hook no tiene JSX).
function ensureCss() {
  if (document.getElementById("cm-zone-editor-css")) return;
  const el = document.createElement("style");
  el.id = "cm-zone-editor-css";
  el.textContent = ZONE_CSS;
  document.head.appendChild(el);
}

const ZONE_CSS = `
.leaflet-container.cm-tool-draw,.leaflet-container.cm-tool-circle{cursor:crosshair}
.leaflet-container.cm-tool-draw .leaflet-interactive,.leaflet-container.cm-tool-circle .leaflet-interactive{cursor:crosshair}
.cm-vtx,.cm-mid{background:none;border:0}
/* anillo blanco con borde dorado oscuro (maqueta v4: .vtx) */
.cm-vtx i{display:block;width:100%;height:100%;box-sizing:border-box;border-radius:50%;background:#fff;
  border:2.5px solid #a88a52;box-shadow:0 1px 4px rgba(40,30,10,.35);cursor:grab;transition:transform .12s}
.cm-vtx:hover i{transform:scale(1.2)}
.cm-vtx.leaflet-drag-target i,.cm-mid.leaflet-drag-target i{cursor:grabbing}
.cm-vtx-draft i{cursor:crosshair}
/* Primer vértice = botón "Cerrar zona": zona de pulsación de 26 px, relleno dorado y halo */
.cm-vtx-first{display:flex;align-items:center;justify-content:center}
.cm-vtx-first i{width:18px;height:18px;background:#c9a96e;border-color:#0a0a0a;cursor:pointer!important;
  box-shadow:0 0 0 4px rgba(201,169,110,.45),0 1px 4px rgba(40,30,10,.35)}
.cm-vtx-first:hover i{transform:scale(1.25)}
.cm-vtx-bad i{border-color:#c0392b}
.cm-vtx-first.cm-vtx-bad i{background:#fff;cursor:not-allowed!important;box-shadow:0 0 0 4px rgba(192,57,43,.35)}
/* Dibujando o trazando un radio, los pines NO capturan el clic: pasa al mapa
   (si no, un clic sobre un pin selecciona el anuncio y no añade vértice). Los pines
   con precio son DivIcon (.cm-pin); los puntos de fuera de zona viven en un canvas. */
.leaflet-container.cm-tool-draw .leaflet-marker-icon.cm-pin,.leaflet-container.cm-tool-circle .leaflet-marker-icon.cm-pin{pointer-events:none}
.leaflet-container.cm-tool-draw .leaflet-overlay-pane canvas,.leaflet-container.cm-tool-circle .leaflet-overlay-pane canvas{pointer-events:none}
/* punto medio dorado (maqueta v4: .mid) */
.cm-mid i{display:block;width:10px;height:10px;margin:2px;box-sizing:border-box;border-radius:50%;background:#c9a96e;
  border:1.5px solid #fff;opacity:.85;cursor:copy;transition:transform .12s,opacity .12s}
.cm-mid:hover i{transform:scale(1.4);opacity:1}
.cm-radius-label{background:#0a0a0a;color:#fff;font:700 12px Lato,Arial,sans-serif;padding:3px 8px;border-radius:8px;
  white-space:nowrap;width:auto!important;height:auto!important;margin:14px 0 0 14px!important;box-shadow:0 3px 8px rgba(0,0,0,.3)}
.cm-radius-label.cm-radius-min{background:#6f685d}
@media (prefers-reduced-motion:reduce){.cm-vtx i,.cm-mid i{transition:none}}
`;
