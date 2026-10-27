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
import { useCallback, useEffect, useReducer, useRef } from "react";
import L from "leaflet";
import type { ZonePolygon, ZonePolygonPoint } from "@/lib/zone-polygon";
import {
  MIN_RADIUS_M,
  initialEditorState,
  zoneEditorReducer,
  type EditorState,
  type EditorTool,
} from "@/lib/captaciones-map/zone-editor-reducer";

export type { EditorTool, EditorState };

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
): {
  state: EditorState;
  setTool: (t: EditorTool) => void;
  clear: () => void;
  setPolygons: (p: ZonePolygon[]) => void;
} {
  const [state, dispatch] = useReducer(zoneEditorReducer, initial, initialEditorState);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Siempre el callback vigente: los cierres de Leaflet viven más que el render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Cursor del ratón en modo dibujo (para que la vista previa sobreviva a un redibujado).
  const cursorRef = useRef<L.LatLng | null>(null);
  const previewRef = useRef<L.Polyline | null>(null);

  const setTool = useCallback((tool: EditorTool) => dispatch({ type: "setTool", tool }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
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

  // --- Esc cancela el borrador (o un círculo a medias) mientras el editor está activo ---
  useEffect(() => {
    if (!map) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "cancelDraft" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [map]);

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
        // El 2º clic de un doble clic no es un vértice nuevo.
        if ((e.originalEvent as MouseEvent).detail >= 2) return;
        dispatch({ type: "addDraftPoint", point: [e.latlng.lng, e.latlng.lat] });
      };
      const onDbl = () => dispatch({ type: "closeDraft" });
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
  }, [map, state.tool]);

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
        });
        v.on("dblclick", () => dispatch({ type: "removeVertex", polygon: pi, index: i }));
      });
    });

    if (state.draft.length) {
      const pts: L.LatLngExpression[] = state.draft.map(toLatLng);
      const withCursor = state.tool === "draw" && cursorRef.current ? [...pts, cursorRef.current] : pts;
      previewRef.current = L.polyline(withCursor, {
        pane: "cm-zones", interactive: false, color: GOLD, weight: 3, dashArray: "8 6",
      }).addTo(group);
      state.draft.forEach((p) => {
        L.marker(toLatLng(p), {
          pane: "cm-zone-handles", interactive: false, keyboard: false,
          icon: L.divIcon({ className: "cm-vtx cm-vtx-draft", html: "<i></i>", iconSize: [18, 18] }),
        }).addTo(group);
      });
    }

    return () => {
      previewRef.current = null;
      group.remove();
    };
  }, [map, state.polygons, state.draft, state.tool]);

  return { state, setTool, clear, setPolygons };
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
/* punto medio dorado (maqueta v4: .mid) */
.cm-mid i{display:block;width:10px;height:10px;margin:2px;box-sizing:border-box;border-radius:50%;background:#c9a96e;
  border:1.5px solid #fff;opacity:.85;cursor:copy;transition:transform .12s,opacity .12s}
.cm-mid:hover i{transform:scale(1.4);opacity:1}
.cm-radius-label{background:#0a0a0a;color:#fff;font:700 12px Lato,Arial,sans-serif;padding:3px 8px;border-radius:8px;
  white-space:nowrap;width:auto!important;height:auto!important;margin:14px 0 0 14px!important;box-shadow:0 3px 8px rgba(0,0,0,.3)}
.cm-radius-label.cm-radius-min{background:#6f685d}
@media (prefers-reduced-motion:reduce){.cm-vtx i,.cm-mid i{transition:none}}
`;
