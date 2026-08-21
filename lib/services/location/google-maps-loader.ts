// BCP ZONE EXPLORER · carga del SDK de Google Maps.
//
// Todo el contacto con `google.maps` vive dentro de esta capa: el renderer
// consume objetos de dominio de BCP, nunca objetos del proveedor (§38).
//
// Coste (§25 del brief): el SDK se carga BAJO DEMANDA, al pulsar "Explorar la
// zona", nunca al abrir el SmartLink. El módulo de ubicación está por debajo
// del pliegue y la mayoría de visitas no llegan a explorar: cargarlo siempre
// sería pagar un mapa dinámico por visita para nada.
//
// Fallo (§34): si el script no carga, esta capa devuelve null y el módulo se
// queda con el renderer actual. Google caído NUNCA rompe el SmartLink.
//
// Los tipos son propios y deliberadamente MÍNIMOS: describen exactamente la
// superficie de la API de la que dependemos, sin añadir una dependencia de
// tipos para código que todavía no se ha podido validar contra credenciales
// reales. Si algún día crece el uso, `@types/google.maps` es el paso natural.

export type GLatLngLiteral = { lat: number; lng: number };

export type GMapsApi = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  LatLngBounds: new () => GLatLngBounds;
  importLibrary?: (name: string) => Promise<unknown>;
};

export type GMap = {
  addListener: (event: string, cb: (e: GMapMouseEvent) => void) => { remove: () => void };
  setCenter: (c: GLatLngLiteral) => void;
  setZoom: (z: number) => void;
  fitBounds: (b: GLatLngBounds, padding?: number | Record<string, number>) => void;
  panTo: (c: GLatLngLiteral) => void;
  setOptions: (o: Record<string, unknown>) => void;
};

export type GLatLngBounds = { extend: (p: GLatLngLiteral) => void };

/** Evento de clic del mapa. En un POI del basemap trae `placeId`. */
export type GMapMouseEvent = {
  placeId?: string | null;
  latLng?: { lat: () => number; lng: () => number } | null;
  stop?: () => void;
};

let loadPromise: Promise<GMapsApi | null> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<GMapsApi | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const w = window as unknown as { google?: { maps?: GMapsApi } };
    if (w.google?.maps) return resolve(w.google.maps);

    const script = document.createElement("script");
    // `loading=async` es el patrón vigente; `libraries` pide SOLO lo que se
    // usa. Places entra porque el producto necesita resolver el sitio que el
    // cliente pulsa (§5); nada más se habilita (§4: "Do not enable APIs that
    // are not actually used").
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&v=weekly&loading=async&libraries=maps,marker,places&language=es&region=ES`;
    script.async = true;
    script.onerror = () => {
      // No se filtra el detalle del error de credencial al cliente (§34).
      console.warn("[zone-explorer] el mapa no está disponible ahora mismo");
      resolve(null);
    };
    script.onload = () => resolve(w.google?.maps ?? null);
    document.head.appendChild(script);
  });
  return loadPromise;
}

/** Solo para tests: olvida la carga en curso. */
export function __resetGoogleMapsLoaderForTests() {
  loadPromise = null;
}
