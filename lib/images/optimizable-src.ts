/**
 * Hosts que `next.config.ts` (images.remotePatterns) deja pasar por el
 * optimizador de imágenes. Si se añade uno allí, añadirlo aquí también.
 *
 * Las propiedades creadas desde un particular guardan las fotos con la URL de
 * ORIGEN del portal (img4.idealista.com…): ese dominio no está en la lista, el
 * optimizador contesta 400 ("url parameter is not allowed") y la imagen sale
 * rota. Lo que no es nuestro se carga directo, con `unoptimized`.
 */
const OPTIMIZABLE_HOSTS = [
  /\.supabase\.co$/,
  /^portal\.bcousinoprop\.com$/,
  /^crm\.bcousinoprop\.com$/,
  /^storage\.googleapis\.com$/,
  /^urbantechome\.com$/,
];

export function isOptimizableSrc(url: string): boolean {
  if (url.startsWith("/")) return true;
  try {
    const host = new URL(url).hostname;
    return OPTIMIZABLE_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}
