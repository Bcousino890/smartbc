// ============================================================================
// CORS de las rutas que atiende la extensión de Chrome.
//
// El content script hace fetch DESDE la página del portal, así que el
// navegador aplica CORS con el origen del portal. La lista es explícita: se
// devuelve el origen recibido solo si está en ella, nunca "*" — estas rutas
// escriben en la ficha de un cliente.
// ============================================================================

const ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?idealista\.(com|it|pt)$/i,
  /^https:\/\/(www\.)?fotocasa\.es$/i,
  /^https:\/\/(www\.)?habitaclia\.com$/i,
  /^https:\/\/(www\.)?pisos\.com$/i,
];

export function resolveExtensionOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  return ALLOWED_ORIGINS.some((re) => re.test(origin)) ? origin : null;
}

export function extensionCorsHeaders(request: Request): Record<string, string> {
  const origin = resolveExtensionOrigin(request);
  return {
    // Sin origen reconocido se manda el de Idealista: el navegador rechazará
    // la respuesta, que es justo lo que queremos para un origen desconocido.
    "Access-Control-Allow-Origin": origin ?? "https://www.idealista.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}
