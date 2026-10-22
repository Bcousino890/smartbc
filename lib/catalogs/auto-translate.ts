import { snapshotLang } from "./i18n";
import { esUnitOfItem, type InternalSnapshot } from "./to-public";
import { AUTO_LIMITS, isTargetLanguage, metaSig, translationCurrent, type AutoLimits, type TargetLanguage, type TrAiFn } from "./translations";
import { autoUnit, loadPanel, needsAutoWork, type AutoUnitResult, type TrBackend } from "./translation-service";

// ============================================================================
// Traducción AUTOMÁTICA del catálogo, «como en los itinerarios» (decisión de
// Fabricio del 22-10-2026; expediente 2026-10-21-bcp-01-ampliacion-textos-
// idiomas, result-traduccion-automatica.md). PURO e inyectable: la base de
// datos (o el almacén en memoria), la IA y el aviso al vigilante llegan como
// dependencias. La instancia de la app vive en auto-translate-instance.ts.
//
// · Disparo: una lectura pública en un idioma distinto del español (lector,
//   vista previa del dueño, estado, canal en vivo y PDF por token) llama a
//   `request(token, instantánea)`, que NO espera nada: mira (en memoria, sin
//   base de datos) si falta alguna traducción vigente y, si falta, programa
//   el trabajo en segundo plano. La respuesta sale ya con el aviso N5 para lo
//   pendiente; al publicarse cada traducción la huella cambia y el vigilante
//   actualiza los lectores abiertos (DA19: cada enlace con su idioma).
// · Idioma: SOLO el que el dueño eligió para ese catálogo o enlace: el de la
//   instantánea del token (de la base de datos), comprobado otra vez al
//   resolver el token. Nunca un idioma pedido por URL.
// · Límites (AUTO_LIMITS): una ejecución a la vez por catálogo e idioma en el
//   proceso; como mucho N trabajos a la vez por catálogo (aquí y, entre
//   procesos, en la base de datos), N llamadas a la vez en el proceso, un
//   tope de llamadas nuevas por visita, un tope diario por catálogo y espera
//   creciente tras un fallo (la base de datos). Una visita repetida no relanza
//   la comprobación antes de `requestThrottleMs`.
// · Publicación: sola si pasa los filtros deterministas; con un bloqueo
//   (contacto o precio) no se publica y el gestor la marca para corregir.
// ============================================================================

export interface AutoTarget {
  catalogId: string;
  /** El dueño del catálogo: el actor de las funciones SQL (como en el gestor). */
  ownerId: string;
  /** El idioma que el dueño eligió para ese enlace (o el del catálogo). */
  lang: TargetLanguage;
}

export interface AutoDeps {
  /** Token → catálogo, dueño e idioma vigentes (null si no vale). */
  resolve(token: string): Promise<AutoTarget | null>;
  backend(ownerId: string): Promise<TrBackend> | TrBackend;
  /** La IA configurada (null = no hay: solo se publica lo ya traducido). */
  ai: TrAiFn | null;
  isNotConfigured?: (e: unknown) => boolean;
  timeoutMs?: number;
  ttlSeconds?: number;
  /** Avisar al vigilante de que algo publicado cambió la huella. */
  notify(): void;
  now?: () => number;
  log?: (msg: string) => void;
  limits?: Partial<AutoLimits>;
  /** Programar la segunda mirada (por defecto setTimeout, sin retener el proceso). */
  schedule?: (fn: () => void, ms: number) => void;
}

export interface AutoRunSummary {
  catalogId: string;
  lang: TargetLanguage;
  manual: boolean;
  units: AutoUnitResult[];
  /** Llamadas a la IA lanzadas en esta ejecución (reservas obtenidas o no). */
  aiStarted: number;
  published: number;
}

/** ¿Falta alguna traducción vigente en esta instantánea? (sin base de datos:
 *  la misma regla que el lector). Fuera del español: una vivienda sin copia
 *  vigente, una característica sin traducir o el título del catálogo. */
export function translationGaps(snap: InternalSnapshot | null | undefined): boolean {
  if (!snap) return false;
  const lang = snapshotLang(snap.lang);
  if (lang === "es" || !isTargetLanguage(lang)) return false;
  const title = String(snap.title ?? "").trim();
  const intro = typeof snap.intro === "string" && snap.intro.trim() ? snap.intro.trim() : null;
  if (title && snap.trm?.s !== metaSig(title, intro)) return true;
  for (const it of snap.items ?? []) {
    if (!it || it.status === "sold" || it.status === "archived") continue;
    const es = esUnitOfItem(it);
    if (!translationCurrent(es, it.tr ?? null)) return true;
    const have = new Set((it.tr?.f ?? []).map((p) => (Array.isArray(p) ? p[0] : null)));
    if (es.features.some((f) => !have.has(f))) return true;
  }
  return false;
}

/** Semáforo pequeño (sin dependencias). */
class Gate {
  private n = 0;
  private q: Array<() => void> = [];
  private readonly max: number;
  constructor(max: number) {
    this.max = max;
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.n >= this.max) await new Promise<void>((r) => this.q.push(r));
    this.n++;
    try {
      return await fn();
    } finally {
      this.n--;
      this.q.shift()?.();
    }
  }
}

export class AutoTranslator {
  private readonly deps: AutoDeps;
  private readonly limits: AutoLimits;
  private readonly global: Gate;
  private readonly perCatalog = new Map<string, Gate>();
  private readonly running = new Map<string, Promise<AutoRunSummary | null>>();
  private readonly lastRequest = new Map<string, number>();
  private readonly pending = new Set<Promise<unknown>>();
  private followUps = new Map<string, number>();

  constructor(deps: AutoDeps) {
    this.deps = deps;
    this.limits = { ...AUTO_LIMITS, ...(deps.limits ?? {}) };
    this.global = new Gate(this.limits.globalConcurrency);
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private log(msg: string): void {
    this.deps.log?.(msg);
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.pending.add(p);
    p.finally(() => this.pending.delete(p)).catch(() => {});
    return p;
  }

  /** Para las pruebas: espera a que termine todo lo programado. */
  async whenIdle(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  /** Una lectura pública en un idioma: si falta algo, se traduce EN SEGUNDO
   *  PLANO. Síncrona, nunca lanza y nunca hace esperar a quien lee. */
  request(token: string, snap: InternalSnapshot | null | undefined): void {
    try {
      if (!snap || !translationGaps(snap)) return;
      const lang = snapshotLang(snap.lang);
      if (!isTargetLanguage(lang)) return;
      // Por enlace E idioma: si el dueño cambia el idioma, la siguiente visita
      // encarga el nuevo sin esperar.
      const now = this.now();
      const seen = `${token}:${lang}`;
      const last = this.lastRequest.get(seen);
      if (last !== undefined && now - last < this.limits.requestThrottleMs) return;
      this.lastRequest.set(seen, now);
      if (this.lastRequest.size > 5000) this.lastRequest.clear();
      this.track(
        (async () => {
          await Promise.resolve();
          const t = await this.deps.resolve(token);
          // El idioma lo decide la base de datos (el del enlace o el del
          // catálogo). Si cambió entre medias, esta visita no traduce nada.
          if (!t || t.lang !== lang) return;
          await this.run(t, { manual: false });
        })().catch((err) => this.log(`[catalogos] traducción automática: ${err instanceof Error ? err.message : String(err)}`)),
      );
    } catch (err) {
      this.log(`[catalogos] traducción automática: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** «Preparar ahora» del dueño (o lo que programa una visita). Una sola
   *  ejecución a la vez por catálogo e idioma en este proceso. */
  run(t: AutoTarget, opts: { manual: boolean; maxAi?: number }): Promise<AutoRunSummary | null> {
    const key = `${t.catalogId}:${t.lang}`;
    const cur = this.running.get(key);
    if (cur) return cur;
    const p = this.track(
      this.execute(t, opts).finally(() => {
        this.running.delete(key);
      }),
    );
    this.running.set(key, p);
    return p;
  }

  private gateFor(catalogId: string): Gate {
    let g = this.perCatalog.get(catalogId);
    if (!g) {
      g = new Gate(this.limits.maxActivePerCatalog);
      this.perCatalog.set(catalogId, g);
      if (this.perCatalog.size > 2000) this.perCatalog.clear();
    }
    return g;
  }

  private async execute(t: AutoTarget, opts: { manual: boolean; maxAi?: number }): Promise<AutoRunSummary> {
    const be = await this.deps.backend(t.ownerId);
    const panel = await loadPanel(be, t.catalogId, t.lang, this.now());
    const keys = panel.items.filter((it) => (opts.manual ? it.state !== "busy" : needsAutoWork(it, this.now()))).map((it) => it.key);
    const summary: AutoRunSummary = { catalogId: t.catalogId, lang: t.lang, manual: opts.manual, units: [], aiStarted: 0, published: 0 };
    const budget = opts.maxAi ?? this.limits.maxAiPerVisit;
    const gate = this.gateFor(t.catalogId);
    const ai = this.deps.ai;
    await Promise.all(
      keys.map((key) =>
        gate.run(async () => {
          let r: AutoUnitResult;
          try {
            r = await this.global.run(() =>
              autoUnit(
                be,
                {
                  ai: ai ?? (async () => { throw new Error("ai_unavailable"); }),
                  isNotConfigured: (e) => !ai || (e instanceof Error && e.message === "ai_unavailable") || (this.deps.isNotConfigured?.(e) ?? false),
                  timeoutMs: this.deps.timeoutMs,
                  ttlSeconds: this.deps.ttlSeconds,
                  limits: this.limits,
                  now: () => this.now(),
                  spend: () => {
                    if (!ai || summary.aiStarted >= budget) return false;
                    summary.aiStarted++;
                    return true;
                  },
                },
                { catalogId: t.catalogId, key, lang: t.lang, manual: opts.manual },
              ),
            );
          } catch (err) {
            this.log(`[catalogos] traducción automática (${key}): ${err instanceof Error ? err.message : String(err)}`);
            r = { key, kind: "skipped", reason: "error" };
          }
          summary.units.push(r);
          if (r.kind === "published" || (r.kind === "ai" && r.published)) {
            summary.published++;
            // Huella nueva: el vigilante actualiza los lectores abiertos.
            this.deps.notify();
          }
        }),
      ),
    );
    this.followUp(t, summary);
    return summary;
  }

  /** Si algo quedó «en preparación» en otro sitio o sin hueco (otro proceso),
   *  se mira otra vez un poco después (como mucho dos veces seguidas). */
  private followUp(t: AutoTarget, s: AutoRunSummary): void {
    const key = `${t.catalogId}:${t.lang}`;
    const again = s.units.some((u) => (u.kind === "ai" && (u.outcome === "busy" || u.outcome === "limit")) || (u.kind === "skipped" && u.reason === "busy"));
    const n = this.followUps.get(key) ?? 0;
    if (!again || s.manual || n >= 2) {
      this.followUps.delete(key);
      return;
    }
    this.followUps.set(key, n + 1);
    const go = () => void this.run(t, { manual: false }).catch((err) => this.log(`[catalogos] traducción automática: ${err instanceof Error ? err.message : String(err)}`));
    if (this.deps.schedule) this.deps.schedule(go, 20_000);
    else setTimeout(go, 20_000).unref?.();
  }
}
