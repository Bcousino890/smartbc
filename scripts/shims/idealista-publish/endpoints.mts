// SOLO PRUEBAS LOCALES. Sustituye partner-api/endpoints.ts: no hay red. Cada
// llamada queda en globalThis.__idealista.calls (nombre + argumentos sin la
// configuración) y su respuesta la decide globalThis.__idealista.respond.
/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
g.__idealista ??= { calls: [] as any[], respond: (_n: string, _a: unknown[]) => ({}) };
function rec(name: string, args: unknown[]) {
  g.__idealista.calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
  g.__idealista.events?.push(`idealista:${name}`);
  const r = g.__idealista.respond(name, args);
  if (r instanceof Error) return Promise.reject(r);
  return Promise.resolve(r);
}
const NAMES = ["findAllContacts", "findEveryContact", "findContact", "createContact", "updateContact", "findAllProperties",
  "findEveryProperty", "findProperty", "createProperty", "updateProperty", "deactivateProperty", "reactivateProperty",
  "cloneProperty", "putImages", "findImages", "deleteAllImages", "createVideo", "findVideos", "findVideo", "updateVideo",
  "deleteVideo", "createVirtualTour", "findVirtualTours", "deactivateVirtualTour", "getPublishInfo"];
// El último argumento de cada endpoint real es la configuración: no se graba.
const wrap = (name: string) => (...args: unknown[]) => rec(name, args.slice(0, -1));
export const findAllContacts = wrap(NAMES[0]);
export const findEveryContact = wrap(NAMES[1]);
export const findContact = wrap(NAMES[2]);
export const createContact = wrap(NAMES[3]);
export const updateContact = wrap(NAMES[4]);
export const findAllProperties = wrap(NAMES[5]);
export const findEveryProperty = wrap(NAMES[6]);
export const findProperty = wrap(NAMES[7]);
export const createProperty = wrap(NAMES[8]);
export const updateProperty = wrap(NAMES[9]);
export const deactivateProperty = wrap(NAMES[10]);
export const reactivateProperty = wrap(NAMES[11]);
export const cloneProperty = wrap(NAMES[12]);
export const putImages = wrap(NAMES[13]);
export const findImages = wrap(NAMES[14]);
export const deleteAllImages = wrap(NAMES[15]);
export const createVideo = wrap(NAMES[16]);
export const findVideos = wrap(NAMES[17]);
export const findVideo = wrap(NAMES[18]);
export const updateVideo = wrap(NAMES[19]);
export const deleteVideo = wrap(NAMES[20]);
export const createVirtualTour = wrap(NAMES[21]);
export const findVirtualTours = wrap(NAMES[22]);
export const deactivateVirtualTour = wrap(NAMES[23]);
export const getPublishInfo = wrap(NAMES[24]);
