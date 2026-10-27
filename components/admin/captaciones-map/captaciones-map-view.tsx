"use client";

/**
 * Vista «Mapa» de Captaciones: orquesta las piezas del mapa (Leaflet, editor
 * de zonas, embudo, ficha del pin, lista lateral, selector de cliente y
 * búsqueda con IA) y es la ÚNICA que habla con los endpoints. Las piezas son
 * presentacionales; aquí se decide qué datos reciben.
 *
 * Solo cliente: el editor de zonas importa Leaflet, que toca `window` al
 * cargarse. Quien la monte debe usar `next/dynamic` con `ssr: false` (como
 * ParticularesClient).
 *
 * Seguridad: nada de lo que se oculta o deshabilita aquí es una barrera. Los
 * endpoints exigen `particulares.view` y las acciones de servidor aplican sus
 * propios gates (cliente, alcance de cartera); esta vista solo evita ofrecer
 * botones que de todas formas fallarían.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type L from "leaflet";
import { AlertTriangle, Check, Loader2, Moon, RotateCw, Sun } from "lucide-react";
import { captureForClient, getCapturedPinIds, saveClientZone } from "@/app/[country]/(admin)/admin/captaciones/captacion-actions";
import { getCountryConfig, isCountry } from "@/lib/country-config";
import { polygonBounds, polygonsAreaKm2 } from "@/lib/geo/zone-geometry";
import { encodeZonePolygons, isPointInAnyPolygon, type ZonePolygon } from "@/lib/zone-polygon";
import { classifyPin, computeFunnel, type MapPin, type PinTier } from "@/lib/captaciones-map/pins";
import { buildScoreMap } from "@/lib/captaciones-map/scores";
import type { MapBrief } from "@/lib/captaciones-map/brief-summary";
import type { ListFilter } from "@/lib/captaciones-map/panels";
import type { SuggestedParticular } from "@/lib/db/queries/suggested-particulares";
import AiBar, { type AiBarResult } from "./ai-bar";
import ClientPicker, { type PickedClient } from "./client-picker";
import { FunnelPanel } from "./funnel-panel";
import { MapResultsList } from "./map-results-list";
import { readStoredTheme, storeTheme, type MapTheme } from "./map-theme";
import MapToolbar, { TOOL_HINTS } from "./map-toolbar";
import { PinCard } from "./pin-card";
import { useZoneEditor, type ZoneRejectReason } from "./use-zone-editor";

// Leaflet toca `window` al importarse: el mapa solo se carga en el navegador.
const CaptacionesMap = dynamic(() => import("./captaciones-map"), {
  ssr: false,
  loading: () => <div className="cmv-map-ph" aria-hidden />,
});

type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** Acciones de servidor; inyectables para poder probar la vista sin sesión ni BD. */
export type MapViewActions = {
  captureForClient: typeof captureForClient;
  saveClientZone: typeof saveClientZone;
  getCapturedPinIds: typeof getCapturedPinIds;
};
const DEFAULT_ACTIONS: MapViewActions = { captureForClient, saveClientZone, getCapturedPinIds };

export interface CaptacionesMapViewProps {
  initialPolygons: ZonePolygon[];
  filters: { operation?: "rent" | "sale"; advertiser: "particular" | "all" };
  /**
   * Quien monta la vista y ya es dueño de la URL (los filtros de la lista)
   * recibe aquí la zona para escribir `zonePoly`. Sin él, la vista hace su
   * propio `router.replace`.
   */
  onZoneChange?: (polygons: ZonePolygon[]) => void;
  /** Abre la ficha completa del anuncio (la del listado, con teléfono y WhatsApp). */
  onOpenFicha?: (id: string) => void;
  actions?: MapViewActions;
}

type ClientState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "not_available" }
  | { status: "no_preferences" }
  | { status: "insufficient"; brief: MapBrief | null }
  | { status: "ok"; brief: MapBrief | null; suggestions: SuggestedParticular[] };

type PinsState = { pins: MapPin[]; truncated: boolean; withoutLocation: number };

const MATCH_SCORE = 80;
const AI_BOOST = 12;
const AI_MAX_IDS = 200;
/** Mismo tope que la acción de servidor y que `addPortalLinks`. */
const MAX_CAPTURE = 300;
const NOTICE_MS = 3500;

const REJECT_TEXT: Record<ZoneRejectReason, string> = {
  invalid: "La zona no es válida: los lados no pueden cruzarse.",
  max: "Máximo 5 zonas. Borra alguna para dibujar otra.",
};

/** El primer nombre para los textos («Dibuja la zona de María»). */
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

export function CaptacionesMapView({
  initialPolygons,
  filters,
  onZoneChange,
  onOpenFicha,
  actions = DEFAULT_ACTIONS,
}: CaptacionesMapViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ country?: string }>();
  const prefix = getCountryConfig(isCountry(params?.country) ? params.country : "es").prefix;

  // ── Tema (recordado entre visitas; se lee tras montar para no desajustar la hidratación) ──
  const [theme, setTheme] = useState<MapTheme>("light");
  useEffect(() => setTheme(readStoredTheme()), []);
  const toggleTheme = () => {
    const t: MapTheme = theme === "dark" ? "light" : "dark";
    setTheme(t);
    storeTheme(t);
  };

  // ── Zona ──
  const [map, setMap] = useState<L.Map | null>(null);
  const [polygons, setPolygons] = useState<ZonePolygon[]>(() => initialPolygons.slice(0, 5));
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  // La URL guarda la zona (`zonePoly`) para compartir el enlace o recargar.
  // replace (no push) y scroll:false: cada retoque de la zona no es una
  // entrada del historial ni debe mover la página.
  const searchRef = useRef(searchParams);
  searchRef.current = searchParams;
  const writeZoneToUrl = useCallback(
    (p: ZonePolygon[]) => {
      if (onZoneChange) {
        onZoneChange(p);
        return;
      }
      const qs = new URLSearchParams(searchRef.current.toString());
      if (p.length) qs.set("zonePoly", encodeZonePolygons(p));
      else qs.delete("zonePoly");
      const s = qs.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [onZoneChange, pathname, router],
  );

  const onEditorChange = useCallback(
    (p: ZonePolygon[]) => {
      setPolygons(p);
      writeZoneToUrl(p);
    },
    [writeZoneToUrl],
  );
  const editor = useZoneEditor(map, initialPolygons, onEditorChange, {
    onReject: (r) => flashNotice(REJECT_TEXT[r]),
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  // Sin zona se empieza dibujando; con zona (enlace con ?zonePoly=), editando.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!map || startedRef.current) return;
    startedRef.current = true;
    if (initialPolygons.length === 0) editor.setTool("draw");
    else {
      const b = polygonBounds(initialPolygons);
      if (b) map.fitBounds([[b.minLat, b.minLng], [b.maxLat, b.maxLng]], { padding: [60, 60], animate: false });
    }
  }, [map, initialPolygons, editor]);

  const clearZone = () => {
    editor.clear();
    editor.setTool("draw");
  };

  // ── Pines del mapa ──
  const [viewBbox, setViewBbox] = useState<Bbox | null>(null);
  const [data, setData] = useState<PinsState>({ pins: [], truncated: false, withoutLocation: 0 });
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // Con zona se piden los pines de la caja de la zona (el servidor recorta
  // exacto); sin zona, los de la vista actual (todos «fuera»).
  const zoneParam = polygons.length ? encodeZonePolygons(polygons) : "";
  const queryBbox = polygons.length ? polygonBounds(polygons) : viewBbox;
  const bboxParam = queryBbox
    ? [queryBbox.minLng, queryBbox.minLat, queryBbox.maxLng, queryBbox.maxLat].map((n) => n.toFixed(5)).join(",")
    : null;

  useEffect(() => {
    if (!bboxParam) return;
    // Cada cambio cancela la petición anterior: una respuesta lenta de una
    // zona vieja no puede pisar la de la zona actual.
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ bbox: bboxParam, advertiser: filters.advertiser });
    if (zoneParam) qs.set("zonePoly", zoneParam);
    if (filters.operation) qs.set("operation", filters.operation);
    setLoading(true);
    fetch(`/api/admin/particulares/map?${qs.toString()}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as Partial<PinsState> & { ok?: boolean };
        setData({
          pins: Array.isArray(j.pins) ? j.pins : [],
          truncated: j.truncated === true,
          withoutLocation: typeof j.withoutLocation === "number" ? j.withoutLocation : 0,
        });
        setFetchError(false);
        setLoading(false);
      })
      .catch((e) => {
        if (ctrl.signal.aborted || (e as Error)?.name === "AbortError") return;
        // Se conservan los pines anteriores: el mapa no se queda en blanco.
        setFetchError(true);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [bboxParam, zoneParam, filters.operation, filters.advertiser, reloadTick]);

  const pins = data.pins;
  const inZoneIds = useMemo(() => {
    const s = new Set<string>();
    if (!polygons.length) return s;
    for (const p of pins) if (isPointInAnyPolygon([p.lng, p.lat], polygons)) s.add(p.id);
    return s;
  }, [pins, polygons]);
  const inZonePins = useMemo(() => pins.filter((p) => inZoneIds.has(p.id)), [pins, inZoneIds]);

  // ── Cliente ──
  const [client, setClient] = useState<PickedClient | null>(null);
  const [clientState, setClientState] = useState<ClientState>({ status: "idle" });
  useEffect(() => {
    if (!client) {
      setClientState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setClientState({ status: "loading" });
    fetch(`/api/admin/clientes/${encodeURIComponent(client.id)}/suggested-particulares?limit=1000`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as {
          suggestions?: SuggestedParticular[];
          reason?: string;
          brief?: MapBrief;
        };
        const brief = j.brief ?? null;
        // La zona guardada del cliente solo entra si el mapa aún no tiene una:
        // nunca se pisa lo que la captadora ya ha dibujado.
        if (brief?.polygons?.length && editorRef.current.state.polygons.length === 0) {
          editorRef.current.setPolygons(brief.polygons);
          editorRef.current.setTool("edit");
          const b = polygonBounds(brief.polygons);
          if (b && map) map.fitBounds([[b.minLat, b.minLng], [b.maxLat, b.maxLng]], { padding: [60, 60] });
        }
        if (j.reason === "not_available") setClientState({ status: "not_available" });
        else if (j.reason === "no_preferences") setClientState({ status: "no_preferences" });
        else if (j.reason === "insufficient_brief") setClientState({ status: "insufficient", brief });
        else setClientState({ status: "ok", brief, suggestions: Array.isArray(j.suggestions) ? j.suggestions : [] });
      })
      .catch((e) => {
        if (ctrl.signal.aborted || (e as Error)?.name === "AbortError") return;
        setClientState({ status: "error" });
      });
    return () => ctrl.abort();
    // `map` no es dependencia: cambiar de mapa no debe volver a pedir el encargo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const brief = clientState.status === "ok" || clientState.status === "insufficient" ? clientState.brief : null;
  const hasScores = clientState.status === "ok";
  const suggestionById = useMemo(() => {
    const m = new Map<string, SuggestedParticular>();
    if (clientState.status === "ok") for (const s of clientState.suggestions) m.set(s.id, s);
    return m;
  }, [clientState]);
  const baseScores = useMemo(
    () => (clientState.status === "ok" ? buildScoreMap(clientState.suggestions) : new Map<string, number>()),
    [clientState],
  );
  // Un cliente de otro país no puede recibir anuncios de España.
  const canActForClient = !!client && clientState.status !== "not_available" && clientState.status !== "loading";

  // ── IA ──
  const [ai, setAi] = useState<AiBarResult>({ criteria: [], matches: [] });
  const aiById = useMemo(() => new Map(ai.matches.map((m) => [m.id, m])), [ai]);
  const aiIdSet = useMemo(() => new Set(ai.matches.map((m) => m.id)), [ai]);

  // Puntuación mostrada: la del encargo, +12 si la IA dice que encaja (tope 99).
  const scores = useMemo(() => {
    if (aiById.size === 0) return baseScores;
    const out = new Map(baseScores);
    for (const [id, s] of baseScores) if (aiById.has(id)) out.set(id, Math.min(99, s + AI_BOOST));
    return out;
  }, [baseScores, aiById]);

  // Anuncios de la zona por puntuación (y, a igualdad, más nuevos: el
  // servidor ya los manda del más nuevo al más antiguo y el orden es estable).
  const rankedInZone = useMemo(
    () =>
      inZonePins
        .map((p, i) => ({ p, i, s: scores.get(p.id) ?? -1 }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .map((x) => x.p),
    [inZonePins, scores],
  );
  const aiIds = useMemo(() => rankedInZone.slice(0, AI_MAX_IDS).map((p) => p.id), [rankedInZone]);
  const inZoneRef = useRef(inZoneIds);
  inZoneRef.current = inZoneIds;
  const onAiResult = useCallback((r: AiBarResult) => {
    // La zona pudo cambiar mientras la IA pensaba: solo valen los anuncios que
    // siguen en ella (si no, se marcarían pines que ya no se ven).
    const live = inZoneRef.current;
    setAi({ criteria: r.criteria, matches: r.matches.filter((m) => live.has(m.id)) });
  }, []);

  // ── Ya captados ──
  const [captured, setCaptured] = useState<Set<string>>(new Set());
  const capturedReq = useRef(0);
  const checkIds = useMemo(() => rankedInZone.slice(0, MAX_CAPTURE).map((p) => p.id), [rankedInZone]);
  const checkKey = checkIds.join(",");
  useEffect(() => {
    // Cambiar de cliente empieza de cero: lo captado era para el anterior.
    setCaptured(new Set());
    setCaptureMsg(null);
    setConfirming(null);
  }, [client]);
  useEffect(() => {
    if (!client || !canActForClient || checkIds.length === 0) return;
    const req = ++capturedReq.current;
    const t = setTimeout(async () => {
      try {
        const r = await actions.getCapturedPinIds(client.id, checkIds);
        if (req !== capturedReq.current || !r.ok) return;
        setCaptured((prev) => new Set([...prev, ...r.captured]));
      } catch {
        /* sin dato del servidor: se quedan solo los captados en esta sesión */
      }
    }, 400);
    return () => clearTimeout(t);
    // checkKey resume checkIds; actions es estable por diseño.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, canActForClient, checkKey]);

  // ── Tiers, embudo, superficie ──
  const tiers = useMemo(() => {
    const m = new Map<string, PinTier>();
    for (const p of pins) {
      const inZone = inZoneIds.has(p.id);
      // Con encargo puntuado, un anuncio que el cruce descartó es «no encaja» (0), no «sin dato».
      const score = hasScores ? (scores.get(p.id) ?? 0) : null;
      m.set(p.id, classifyPin({ inZone, score }));
    }
    return m;
  }, [pins, inZoneIds, scores, hasScores]);

  const funnel = useMemo(
    () =>
      computeFunnel(pins, inZoneIds, scores, {
        maxPrice: brief?.maxPrice ?? null,
        operation: brief?.operation ?? null,
        withoutLocation: data.withoutLocation,
      }),
    [pins, inZoneIds, scores, brief, data.withoutLocation],
  );
  const areaKm2 = polygons.length ? polygonsAreaKm2(polygons) : null;
  const capturedInZone = useMemo(() => inZonePins.filter((p) => captured.has(p.id)).length, [inZonePins, captured]);

  // ── Lista y selección ──
  const [filter, setFilter] = useState<ListFilter>("all");
  useEffect(() => setFilter(hasScores ? "match" : "all"), [hasScores]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPin = selectedId ? (pins.find((p) => p.id === selectedId) ?? null) : null;

  // Elegir en la lista un anuncio que no se ve en el mapa lo trae a la vista
  // (sin cambiar el zoom); al revés no hace falta: la lista ya se desplaza sola.
  const selectFromList = (id: string) => {
    setSelectedId(id);
    const p = pins.find((x) => x.id === id);
    if (map && p && !map.getBounds().contains([p.lat, p.lng])) map.panTo([p.lat, p.lng]);
  };

  // Esc con el foco en un pin cierra la ficha, salvo que haya un borrador de
  // zona a medias: ese Esc es del editor (cancela el borrador). Con el foco
  // dentro de la ficha lo atiende la propia ficha.
  const onMapKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || !selectedId) return;
    if (editor.state.draft.length > 0) return;
    if ((e.target as HTMLElement).closest?.(".leaflet-marker-icon")) setSelectedId(null);
  };

  // ── Captar y guardar zona ──
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<"batch" | "single" | "zone" | null>(null);
  const [captureMsg, setCaptureMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [zoneMsg, setZoneMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const zoneMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (zoneMsgTimer.current) clearTimeout(zoneMsgTimer.current);
  }, []);

  const toCapture = useMemo(
    () => rankedInZone.filter((p) => (scores.get(p.id) ?? -1) >= MATCH_SCORE && !captured.has(p.id)),
    [rankedInZone, scores, captured],
  );
  const nToCapture = toCapture.length;

  async function runCapture(ids: string[], kind: "batch" | "single") {
    if (!client) return;
    setBusy(kind);
    setCaptureMsg(null);
    try {
      const rec: Record<string, number> = {};
      for (const id of ids) {
        const s = scores.get(id);
        if (s !== undefined) rec[id] = s;
      }
      const r = await actions.captureForClient(client.id, ids, rec);
      if (r.ok) {
        // Insertados y «ya estaban» quedan en la ficha: todos cuentan como captados.
        const withUrl = ids.filter((id) => pins.find((p) => p.id === id)?.sourceUrl);
        setCaptured((prev) => new Set([...prev, ...withUrl]));
        setCaptureMsg({ kind: "ok", text: `Captados ${r.inserted} · ${r.skipped} ya estaban` });
      } else {
        setCaptureMsg({ kind: "error", text: r.error });
      }
    } catch {
      setCaptureMsg({ kind: "error", text: "No se pudo captar. Revisa la conexión e inténtalo de nuevo." });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  async function runSaveZone() {
    if (!client) return;
    setBusy("zone");
    setZoneMsg(null);
    try {
      const r = await actions.saveClientZone(client.id, polygons);
      setZoneMsg(r.ok ? { kind: "ok", text: "Zona guardada" } : { kind: "error", text: r.error });
    } catch {
      setZoneMsg({ kind: "error", text: "No se pudo guardar la zona. Inténtalo de nuevo." });
    } finally {
      setBusy(null);
      if (zoneMsgTimer.current) clearTimeout(zoneMsgTimer.current);
      zoneMsgTimer.current = setTimeout(() => setZoneMsg(null), NOTICE_MS);
    }
  }

  const clientLabel = client ? firstName(client.name) : null;
  const notSpain = clientState.status === "not_available";
  const captureReason = !client
    ? "Elige un cliente para captar"
    : notSpain
      ? "Este cliente no es de España"
      : clientState.status === "loading"
        ? "Cargando el encargo del cliente…"
        : !hasScores
          ? "Completa el encargo del cliente para saber qué encaja"
          : nToCapture === 0
            ? "No hay anuncios nuevos que encajen en la zona"
            : undefined;
  const saveReason = !client
    ? "Elige un cliente para guardar la zona"
    : notSpain
      ? "Este cliente no es de España"
      : clientState.status === "no_preferences"
        ? "El cliente no tiene encargo todavía"
        : polygons.length === 0
          ? "Dibuja una zona primero"
          : undefined;

  const selScore = selectedPin ? (scores.get(selectedPin.id) ?? null) : null;
  const selSuggestion = selectedPin ? suggestionById.get(selectedPin.id) : undefined;
  const selAi = selectedPin ? aiById.get(selectedPin.id) : undefined;

  const hint = notice ?? TOOL_HINTS[editor.state.tool];
  const fileHref = client ? `${prefix}/clientes/${client.id}?encargo=editar` : "#";

  return (
    <section className="cmv font-crm-sans" aria-label="Mapa de captación">
      <header className="cmv-top">
        <div className="cmv-title">
          <h2>Mapa de captación</h2>
          <p>
            {clientLabel && !notSpain
              ? `Dibuja la zona de ${clientLabel} y capta lo que encaja`
              : "Dibuja una zona, elige un cliente y capta lo que encaja"}
          </p>
        </div>
        <ClientPicker
          value={client}
          onChange={(c) => {
            setClient(c);
            setSelectedId(null);
          }}
          subtitle={
            clientState.status === "loading"
              ? "Cargando encargo…"
              : notSpain
                ? "Cliente de fuera de España"
                : brief?.summary || (clientState.status === "ok" ? "Encargo sin resumen" : undefined)
          }
        />
      </header>

      {client && notSpain && (
        <p className="cmv-banner cmv-banner-warn" role="status">
          <AlertTriangle size={15} aria-hidden />
          Este cliente no es de España: no se pueden cruzar anuncios.
        </p>
      )}
      {client && (clientState.status === "insufficient" || clientState.status === "no_preferences") && (
        <p className="cmv-banner" role="status">
          <AlertTriangle size={15} aria-hidden />
          {clientState.status === "no_preferences"
            ? `${clientLabel} aún no tiene encargo: el mapa funciona, pero sin puntuar los anuncios.`
            : `El encargo de ${clientLabel} está incompleto: el mapa funciona, pero sin puntuar los anuncios.`}{" "}
          <Link href={fileHref}>Completar el encargo</Link>
        </p>
      )}
      {client && clientState.status === "error" && (
        <p className="cmv-banner cmv-banner-warn" role="alert">
          <AlertTriangle size={15} aria-hidden />
          No se pudo cargar el encargo de {clientLabel}.
          <button type="button" onClick={() => setClient({ ...client })}>Reintentar</button>
        </p>
      )}

      <div className="cmv-work">
        <div
          className={`cmv-mapwrap ${theme === "dark" ? "cm-theme-dark cmv-dark" : ""}`}
          onKeyDown={onMapKeyDown}
          aria-busy={loading}
        >
          <CaptacionesMap
            pins={pins}
            tiers={tiers}
            scores={scores}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onBoundsChange={setViewBbox}
            onMapReady={setMap}
            theme={theme}
          />

          <div className="cmv-bar">
            <div className="cmv-left">
              <MapToolbar
                tool={editor.state.tool}
                onTool={editor.setTool}
                onClear={clearZone}
                hint={hint}
                disabled={{ barrio: "Barrios: próximamente", iso: "Minutos a pie: próximamente" }}
              />
              {notice && <span className="cmv-sr" role="alert">{notice}</span>}
              {polygons.length === 0 && (
                <p className="cmv-note">Dibuja una zona en el mapa para ver los anuncios que caen dentro</p>
              )}
              {fetchError && (
                <p className="cmv-note cmv-note-err" role="alert">
                  No se pudieron cargar los anuncios.
                  <button type="button" onClick={() => setReloadTick((t) => t + 1)}>
                    <RotateCw size={13} aria-hidden /> Reintentar
                  </button>
                </p>
              )}
              {data.truncated && !fetchError && (
                <p className="cmv-note" role="status">Hay más de 2000 anuncios: acerca el mapa o dibuja una zona más pequeña</p>
              )}
              {loading && (
                <p className="cmv-note cmv-note-load" role="status">
                  <Loader2 size={13} className="cmv-spin" aria-hidden /> Cargando anuncios…
                </p>
              )}
            </div>
            <div className="cmv-ai">
              <AiBar disabled={polygons.length === 0 || aiIds.length === 0} ids={aiIds} onResult={onAiResult} />
            </div>
            <div className="cmv-glass cmv-theme">
              <button
                type="button"
                onClick={toggleTheme}
                aria-pressed={theme === "dark"}
                aria-label="Cambiar mapa claro / oscuro"
                title="Cambiar mapa claro / oscuro"
              >
                {theme === "dark" ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
              </button>
            </div>
          </div>

          <div className="cmv-glass cmv-legend" aria-label="Leyenda de los pines">
            <div><span className="cmv-lp cmv-lp-hi">1.350€</span>Encaja</div>
            <div><span className="cmv-lp cmv-lp-mid">1.480€</span>En parte</div>
            <div><span className="cmv-lp cmv-lp-lo"><i /></span>No encaja</div>
            <div><span className="cmv-lp cmv-lp-out">1.200€</span>Fuera</div>
          </div>

          <FunnelPanel
            funnel={funnel}
            areaKm2={areaKm2}
            clientName={client && hasScores ? client.name : null}
            captured={client && canActForClient ? capturedInZone : null}
            theme={theme}
            className="cmv-funnel"
          />

          {selectedPin && (
            <PinCard
              key={selectedPin.id}
              pin={selectedPin}
              score={selScore}
              reasons={[...(selSuggestion?.matchReasons ?? []), ...(selAi?.satisfied ?? [])]}
              warnings={[...(selSuggestion?.matchWarnings ?? []), ...(selAi?.missing ?? [])]}
              clientName={canActForClient ? clientLabel : null}
              captureDisabledReason={notSpain ? "Este cliente no es de España" : "Elige un cliente para captar"}
              captured={captured.has(selectedPin.id)}
              ai={!!selAi}
              onCapture={() => void runCapture([selectedPin.id], "single")}
              capturing={busy === "single"}
              onOpen={onOpenFicha ? () => onOpenFicha(selectedPin.id) : undefined}
              onClose={() => setSelectedId(null)}
              theme={theme}
              className="cmv-card"
            />
          )}
        </div>

        <aside className="cmv-side">
          <MapResultsList
            pins={inZonePins}
            scores={scores}
            selectedId={selectedId}
            filter={filter}
            onFilter={setFilter}
            onSelect={selectFromList}
            captured={captured}
            aiIds={aiIdSet}
            emptyText={
              polygons.length === 0
                ? "Dibuja una zona en el mapa para ver los anuncios que caen dentro."
                : loading
                  ? "Cargando anuncios…"
                  : "No hay anuncios en esta zona con los filtros elegidos."
            }
          />
          <div className="cmv-foot">
            {confirming ? (
              <div className="cmv-confirm" role="group" aria-label="Confirmar captación">
                <p>
                  Se añadirán {confirming.length} anuncios a la ficha de {client?.name}
                  {nToCapture > MAX_CAPTURE ? ` (los ${MAX_CAPTURE} que mejor encajan)` : ""}.
                </p>
                <div>
                  <button type="button" className="cmv-btn cmv-btn-dark" onClick={() => void runCapture(confirming, "batch")} disabled={busy !== null} aria-busy={busy === "batch" || undefined}>
                    {busy === "batch" && <Loader2 size={13} className="cmv-spin" aria-hidden />}
                    Confirmar
                  </button>
                  <button type="button" className="cmv-btn cmv-btn-line" onClick={() => setConfirming(null)} disabled={busy === "batch"}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="cmv-btn cmv-btn-dark"
                disabled={!!captureReason || busy !== null}
                title={captureReason}
                onClick={() => setConfirming(toCapture.slice(0, MAX_CAPTURE).map((p) => p.id))}
              >
                Captar los {nToCapture} que encajan
              </button>
            )}
            {captureMsg && (
              <p className={`cmv-msg ${captureMsg.kind === "error" ? "cmv-msg-err" : ""}`} role={captureMsg.kind === "error" ? "alert" : "status"}>
                {captureMsg.kind === "ok" && <Check size={14} aria-hidden />}
                {captureMsg.text}
              </p>
            )}
            <button
              type="button"
              className="cmv-btn cmv-btn-line"
              disabled={!!saveReason || busy !== null}
              title={saveReason}
              onClick={() => void runSaveZone()}
              aria-busy={busy === "zone" || undefined}
            >
              {busy === "zone" ? <Loader2 size={13} className="cmv-spin" aria-hidden /> : zoneMsg?.kind === "ok" ? <Check size={14} aria-hidden /> : null}
              {zoneMsg?.kind === "ok" ? zoneMsg.text : `Guardar zona en el encargo de ${clientLabel ?? "un cliente"}`}
            </button>
            {zoneMsg?.kind === "error" && <p className="cmv-msg cmv-msg-err" role="alert">{zoneMsg.text}</p>}
            {zoneMsg?.kind === "ok" && <span className="cmv-sr" role="status">{zoneMsg.text}</span>}
          </div>
        </aside>
      </div>
      <style>{CSS}</style>
    </section>
  );
}

/*
 * Maqueta v4: mapa a la izquierda con piezas de cristal flotando encima y
 * columna de 380 px a la derecha (debajo del mapa en pantallas estrechas).
 * Todas las clases llevan el prefijo `cmv-` para no chocar con las de las
 * piezas (`cm-`/`cmp-`/`cpk-`).
 */
const CSS = `
.cmv{--cmv-line:#e8e0d0;--cmv-muted:#7d766c;margin-top:16px;color:#0a0a0a}
.cmv-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:12px}
.cmv-title{flex:1;min-width:220px}
.cmv-title h2{margin:0;font:500 22px/1.15 var(--crm-font-display,Optima,Candara,"Segoe UI",Lato,sans-serif)}
.cmv-title p{margin:3px 0 0;font-size:13px;color:var(--cmv-muted)}
.cmv-top .cpk-pill{background:#fff;border-color:var(--cmv-line);box-shadow:none}
.cmv-banner{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0 0 12px;padding:9px 14px;border-radius:12px;font-size:13px;
  background:#f5f0e8;border:1px solid #e1d5bd;color:#5c4a24}
.cmv-banner a,.cmv-banner button{font-weight:700;color:#0a0a0a;text-decoration:underline;text-underline-offset:2px;background:none;border:0;padding:0;cursor:pointer;font-size:13px}
.cmv-banner-warn{background:#fdf1ec;border-color:#f1cfc2;color:#8a3a1f}
.cmv-work{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px;height:min(760px,calc(100vh - 150px));min-height:600px}
.cmv-mapwrap{position:relative;overflow:hidden;border-radius:16px;border:1px solid var(--cmv-line);background:#efe9dd;isolation:isolate}
.cmv-mapwrap.cmv-dark{background:#1c1915;border-color:#2c2823}
.cmv-mapwrap>.cm-root{position:absolute;inset:0}
.cmv-map-ph{position:absolute;inset:0;background:#efe9dd}
.cmv-glass{background:rgba(255,255,255,.74);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);
  border:1px solid rgba(255,255,255,.7);border-radius:14px;box-shadow:0 10px 30px rgba(40,30,10,.16);color:#0a0a0a}
.cmv-dark .cmv-glass{background:rgba(24,22,19,.66);border-color:rgba(255,255,255,.09);color:#f3eee6}
/* barra superior: herramientas · IA · tema (los huecos dejan pasar el ratón al mapa) */
.cmv-bar{position:absolute;z-index:1000;top:14px;left:14px;right:14px;display:flex;gap:10px;align-items:flex-start;pointer-events:none}
.cmv-bar>*{pointer-events:auto}
.cmv-left{display:flex;flex-direction:column;gap:8px;max-width:300px}
.cmv-ai{flex:1;min-width:0}
.cmv-ai .cm-ai-wrap{min-width:0}
.cmv-theme{padding:4px;flex:none}
.cmv-theme button{border:0;background:none;padding:8px 9px;border-radius:10px;cursor:pointer;color:inherit;display:grid;place-items:center}
.cmv-theme button:hover{background:rgba(201,169,110,.18)}
.cmv-theme button:focus-visible{outline:2px solid #c9a96e;outline-offset:2px}
.cmv-note{margin:0;padding:8px 12px;border-radius:12px;font-size:12.5px;line-height:1.4;display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  background:rgba(255,255,255,.86);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.7);
  box-shadow:0 10px 30px rgba(40,30,10,.12);color:#3a352f}
.cmv-dark .cmv-note{background:rgba(24,22,19,.78);border-color:rgba(255,255,255,.09);color:#e8e1d6}
.cmv-note-err{color:#8a2f1f}
.cmv-dark .cmv-note-err{color:#f0a090}
.cmv-note button{display:inline-flex;align-items:center;gap:5px;border:0;border-radius:8px;padding:5px 9px;background:#0a0a0a;color:#fff;font:700 12px Lato,sans-serif;cursor:pointer}
.cmv-dark .cmv-note button{background:#c9a96e;color:#0a0a0a}
.cmv-note-load{width:max-content}
.cmv-legend{position:absolute;z-index:900;right:14px;top:72px;padding:10px 12px;font-size:12px;display:grid;gap:7px}
.cmv-legend div{display:flex;gap:8px;align-items:center}
.cmv-lp{display:inline-grid;place-items:center;min-width:44px;height:18px;text-align:center;border-radius:999px;font:700 10.5px Lato,sans-serif;padding:0 7px;box-sizing:border-box}
.cmv-lp-hi{background:#0a0a0a;color:#fff}
.cmv-dark .cmv-lp-hi{background:#c9a96e;color:#0a0a0a}
.cmv-lp-mid{background:#fff;color:#0a0a0a;border:1.5px solid #c9a96e}
.cmv-dark .cmv-lp-mid{background:#26221d;color:#f3eee6}
.cmv-lp-lo{background:#f5f0e8;border:1px solid #e1d5bd}
.cmv-lp-lo i{display:block;width:8px;height:8px;border-radius:50%;background:#9a917f}
.cmv-dark .cmv-lp-lo{background:#2a2622;border-color:#3a352f}
.cmv-lp-out{border:1px dashed #b3aa98;color:#a89f8b}
.cmv-funnel{position:absolute;z-index:900;left:14px;bottom:14px}
.cmv-card{position:absolute!important;z-index:950;right:58px;bottom:14px}
.cmv-side{display:flex;flex-direction:column;min-height:0;overflow:hidden;background:#fff;border:1px solid var(--cmv-line);border-radius:16px}
.cmv-side>.cmp-list{flex:1;border:0;border-radius:0}
.cmv-foot{padding:12px;border-top:1px solid var(--cmv-line);display:grid;gap:8px;background:#fff}
.cmv-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:0;border-radius:10px;padding:10px 16px;font:700 13px Lato,sans-serif;cursor:pointer;min-height:40px}
.cmv-btn:disabled{opacity:.45;cursor:not-allowed}
.cmv-btn[aria-busy]{cursor:progress}
.cmv-btn:focus-visible{outline:2px solid #c9a96e;outline-offset:2px}
.cmv-btn-dark{background:#0a0a0a;color:#fff}.cmv-btn-dark:hover:not(:disabled){background:#1a1a1a}
.cmv-btn-line{background:#fff;border:1px solid var(--cmv-line);color:#0a0a0a}.cmv-btn-line:hover:not(:disabled){border-color:#c9a96e}
.cmv-confirm{display:grid;gap:8px;padding:10px;border-radius:12px;background:#f5f0e8;border:1px solid #e1d5bd}
.cmv-confirm p{margin:0;font-size:13px}
.cmv-confirm div{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cmv-msg{margin:0;display:flex;gap:6px;align-items:center;font-size:12.5px;color:#0f6b4f}
.cmv-msg-err{color:#9a2f1f}
.cmv-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cmv-spin{animation:cmv-spin .9s linear infinite}
@keyframes cmv-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.cmv-spin{animation:none}}
@media (max-width:980px){
  .cmv-work{grid-template-columns:1fr;height:auto;min-height:0}
  .cmv-mapwrap{height:640px}
  .cmv-side{max-height:560px}
  .cmv-legend{display:none}
}
/* Móvil: el mapa necesita aire. El embudo pasa DEBAJO del mapa (no flota
   encima) y la barra ocupa dos filas: herramientas + tema, y la IA debajo. */
@media (max-width:640px){
  .cmv-mapwrap{height:auto;display:flex;flex-direction:column}
  .cmv-mapwrap>.cm-root{position:relative;inset:auto;height:480px;flex:none}
  .cmv-bar{top:10px;left:10px;right:10px;flex-wrap:wrap;gap:8px}
  .cmv-left{flex:1;min-width:0;max-width:none}
  .cmv-left .cm-toolbar{width:auto;max-width:none}
  .cmv-left .cm-toolbar button{padding:8px 9px}
  .cmv-left .cm-hint{padding:6px 8px 4px;font-size:11.5px}
  .cmv-ai{order:3;flex-basis:100%}
  .cmv-funnel{position:static;width:auto;margin:10px;box-shadow:none}
  .cmv-card{left:10px;right:10px;bottom:calc(100% - 470px);width:auto;z-index:1001}
}
`;
