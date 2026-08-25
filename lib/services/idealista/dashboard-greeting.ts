import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { generateDashboardGreeting } from "./ai-suggestions";

// El saludo con IA del Dashboard (ver generateDashboardGreeting) hace una
// llamada real a la IA, y el Dashboard es la página que el equipo carga más
// veces al día — sin caché, cada carga dispararía una llamada nueva. Se
// guarda en app_settings y se comparte entre todo el equipo (no es por
// usuario): el análisis de fichas/leads es el mismo para todos, el nombre en
// el saludo se antepone aparte, fuera de este texto cacheado.
const SETTINGS_KEY = "idealista.dashboard_greeting";
const CACHE_MS = 3 * 60 * 60 * 1000; // 3h — fresco sin regenerar en cada carga de página

type CachedGreeting = { text: string; generatedAt: string };

export type DashboardGreeting = { text: string; generatedAt: string } | null;

function isFresh(g: CachedGreeting): boolean {
  return Date.now() - new Date(g.generatedAt).getTime() < CACHE_MS;
}

export async function getCachedDashboardGreeting(): Promise<DashboardGreeting> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  const cached = (data?.value ?? null) as CachedGreeting | null;

  if (cached && isFresh(cached)) return cached;

  const fresh = await generateDashboardGreeting();
  if (fresh.ok) {
    const value: CachedGreeting = { text: fresh.text, generatedAt: fresh.generatedAt };
    await db
      .from("app_settings")
      .upsert({ key: SETTINGS_KEY, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    return value;
  }

  // La IA falló (no configurada, error de red...): mejor mostrar la última
  // versión cacheada aunque esté vieja que nada, y si no hay ninguna, no
  // romper el Dashboard por esto — el saludo es un extra, nunca un
  // bloqueante.
  return cached;
}
