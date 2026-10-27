/**
 * Reductor PURO del editor de zonas del mapa de captaciones. Sin Leaflet ni
 * DOM a propósito: así se puede probar con strip-types y el hook de Leaflet
 * (use-zone-editor.ts) queda como una capa fina que solo traduce gestos a
 * acciones y estado a capas.
 */
import {
  circleToPolygon,
  insertMidpoint,
  isValidZoneRing,
  removeVertex,
} from "../geo/zone-geometry";
import type { ZonePolygon, ZonePolygonPoint } from "../zone-polygon";

export type EditorTool = "draw" | "edit" | "circle" | "barrio" | "iso";

export type EditorState = {
  tool: EditorTool;
  polygons: ZonePolygon[];
  /** Puntos del polígono que se está dibujando (aún sin cerrar). */
  draft: ZonePolygon;
};

export type EditorAction =
  | { type: "setTool"; tool: EditorTool }
  | { type: "addDraftPoint"; point: ZonePolygonPoint }
  | { type: "cancelDraft" }
  | { type: "closeDraft" }
  | { type: "moveVertex"; polygon: number; index: number; point: ZonePolygonPoint }
  | { type: "insertMidpoint"; polygon: number; index: number }
  | { type: "removeVertex"; polygon: number; index: number }
  | { type: "addCircle"; center: ZonePolygonPoint; radiusM: number }
  | { type: "setPolygons"; polygons: ZonePolygon[] }
  | { type: "clear" };

/** Más zonas por encargo no aportan y encarecen el recorte de pines. */
export const MAX_POLYGONS = 5;
/** Por debajo de esto un "círculo" es un clic sin querer. */
export const MIN_RADIUS_M = 50;

export function initialEditorState(initial: ZonePolygon[]): EditorState {
  return { tool: "edit", polygons: initial.slice(0, MAX_POLYGONS), draft: [] };
}

export function zoneEditorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "setTool":
      // Cambiar de herramienta abandona el borrador a medias.
      if (state.tool === action.tool && state.draft.length === 0) return state;
      return { ...state, tool: action.tool, draft: [] };

    case "addDraftPoint": {
      const last = state.draft[state.draft.length - 1];
      // Un punto repetido (p. ej. el 2º clic de un doble clic) no suma vértice.
      if (last && last[0] === action.point[0] && last[1] === action.point[1]) return state;
      return { ...state, draft: [...state.draft, action.point] };
    }

    case "cancelDraft":
      return state.draft.length ? { ...state, draft: [] } : state;

    case "closeDraft": {
      if (state.draft.length < 3) return state;
      if (state.polygons.length >= MAX_POLYGONS) return state;
      if (!isValidZoneRing(state.draft)) return state; // lazo o degenerado
      return { tool: "edit", polygons: [...state.polygons, state.draft], draft: [] };
    }

    case "moveVertex": {
      const ring = state.polygons[action.polygon];
      if (!ring || action.index < 0 || action.index >= ring.length) return state;
      const next = ring.map((p, i): ZonePolygonPoint => (i === action.index ? action.point : p));
      // Arrastrar hasta cruzar una arista dejaría un lazo: se queda donde era válido.
      if (!isValidZoneRing(next)) return state;
      return { ...state, polygons: state.polygons.map((r, i) => (i === action.polygon ? next : r)) };
    }

    case "insertMidpoint": {
      const ring = state.polygons[action.polygon];
      if (!ring || action.index < 0 || action.index >= ring.length) return state;
      const next = insertMidpoint(ring, action.index);
      return { ...state, polygons: state.polygons.map((r, i) => (i === action.polygon ? next : r)) };
    }

    case "removeVertex": {
      const ring = state.polygons[action.polygon];
      if (!ring || ring.length <= 3) return state;
      const next = removeVertex(ring, action.index);
      if (next === ring) return state;
      if (!isValidZoneRing(next)) return state;
      return { ...state, polygons: state.polygons.map((r, i) => (i === action.polygon ? next : r)) };
    }

    case "addCircle": {
      if (state.polygons.length >= MAX_POLYGONS) return state;
      if (!(action.radiusM >= MIN_RADIUS_M)) return state;
      const ring = circleToPolygon(action.center, action.radiusM, 48);
      if (!isValidZoneRing(ring)) return state;
      return { ...state, polygons: [...state.polygons, ring] };
    }

    case "setPolygons":
      return { ...state, polygons: action.polygons.slice(0, MAX_POLYGONS) };

    case "clear":
      return { ...state, polygons: [], draft: [] };
  }
}
