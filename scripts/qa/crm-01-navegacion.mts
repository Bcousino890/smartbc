// SOLO PRUEBAS LOCALES (CRM-01). Recorre el CRM compilado (`next build` +
// `next start`) con una sesión SINTÉTICA contra scripts/sim/postgrest-sim.mts
// (`--auth`, datos de scripts/sim/fixtures/crm-01-admin.gen.mts) y mide cada
// navegación. Ninguna petición sale de 127.0.0.1: las demás se abortan y se
// anotan.
//
//   BASE=http://127.0.0.1:3271 SIM_LOG=<sim.jsonl> OUT=<salida.json> \
//   VARIANT=escritorio|movil LABEL=<etiqueta> \
//   node --experimental-strip-types scripts/qa/crm-01-navegacion.mts
//
// Qué mide en cada navegación (todo LOCAL; si el simulador corre con
// `--latency`, la espera es SIMULADA y queda anotada en la salida):
//   · primerCambioMs: clic → primer nodo añadido o quitado en el DOM (indicio
//     de que la app reconoció el clic: esqueleto, indicador o destino).
//   · utilMs: clic → aparece el contenido que el recorrido necesita.
//   · completoMs: clic → la red queda en reposo (500 ms sin peticiones), con
//     un tope de 30 s (en móvil, con red limitada, puede llegar al tope).
//   · tareasLargasMs: suma de long tasks del navegador en la ventana.
//   · consultasVentana: peticiones al simulador (REST/auth) durante la ventana,
//     agrupadas por tabla. Incluyen precargas y llamadas a /api de la página.
//   · primerIndicadorMs: clic → aparece un indicador de carga explícito
//     (`[data-crm-pending="true"]` en la sidebar o `[data-crm-skeleton]`), medido
//     aparte del primer cambio y del contenido útil (CRM-02, E0).
//   · precargasAisladas / apisAisladas: las precargas RSC (`Next-Router-Prefetch`)
//     y las llamadas GET a /api (p. ej. /api/admin/notifications) de la ventana,
//     repetidas solas: consultas exactas de cada una (CRM-02, E0).
//   · navegacionAislada: la petición RSC de la navegación repetida sola, con
//     sus mismas cabeceras: consultas exactas de ESA petición y tamaño de la
//     respuesta (sin comprimir y gzip). Las consultas son exactas aunque los
//     tiempos no lo sean.
// Y comprueba el contrato de navegación (filtros, página y fila de origen al
// volver). En la línea base se esperan fallos: son la reproducción del defecto.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3271";
const SIM_LOG = process.env.SIM_LOG ?? "";
const OUT = process.env.OUT ?? "";
const LABEL = process.env.LABEL ?? "sin-etiqueta";
const VARIANT = (process.env.VARIANT ?? "escritorio") as "escritorio" | "movil";
const TOKEN = process.env.SIM_TOKEN ?? "sim-token-owner-crm01";
const COUNTRY = "es";
const LIST = `/${COUNTRY}/admin/propiedades`;

// ── Utilidades ───────────────────────────────────────────────────────────────
const checks: { recorrido: string; nombre: string; ok: boolean; detalle: string }[] = [];
let current = "";
const check = (nombre: string, ok: boolean, detalle = "") => {
  checks.push({ recorrido: current, nombre, ok, detalle });
  console.log(`  ${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
};
const section = (t: string) => {
  current = t;
  console.log(`\n· ${t}`);
};

const sessionCookie = (token: string) => {
  const b64u = (s: string) => Buffer.from(s).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
  const session = { access_token: token, token_type: "bearer", expires_in: 30 * 86400, expires_at: exp, refresh_token: "sim-refresh", user: { id: "sim" } };
  return "base64-" + b64u(JSON.stringify(session));
};

const simLines = (): string[] => {
  if (!SIM_LOG) return [];
  try {
    return readFileSync(SIM_LOG, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
};
const summarizeSim = (lines: string[]) => {
  const byTable: Record<string, number> = {};
  let simLatencyMs = 0;
  for (const l of lines) {
    const e = JSON.parse(l) as { kind?: string; table?: string; path?: string; fn?: string; simLatencyMs?: number };
    const key = e.kind === "auth" ? "auth:getUser" : e.kind === "rpc" ? `rpc:${e.fn}` : e.kind === "img" ? "img" : (e.table ?? e.path ?? "?");
    byTable[key] = (byTable[key] ?? 0) + 1;
    simLatencyMs = e.simLatencyMs ?? simLatencyMs;
  }
  const total = Object.entries(byTable).filter(([k]) => k !== "img").reduce((a, [, v]) => a + v, 0);
  return { total, porTabla: byTable, ...(simLatencyMs ? { latenciaSimuladaMs: simLatencyMs } : {}) };
};

type Net = {
  peticiones: number;
  // Peticiones a la app (documento y RSC), para saber qué disparó la navegación
  // y separar las precargas (`Next-Router-Prefetch`) de la navegación en sí.
  app: string[];
  // Peticiones de navegación (RSC sin precarga, o documento) con sus cabeceras, para
  // repetirlas aisladas: así se cuentan las consultas de ESA petición sola.
  navs: { url: string; headers: Promise<Record<string, string>> }[];
  prefetches: { url: string; headers: Promise<Record<string, string>> }[];
  apis: { url: string; headers: Promise<Record<string, string>> }[];
};
// Peticiones a /api/admin/notifications por recorrido (todas, no solo las de
// las ventanas medidas): la campana pide en cada navegación (CRM-02, D2).
const notificationsBySection: Record<string, number> = {};
function trackNetwork(page: Page) {
  let acc: Net = { peticiones: 0, app: [], navs: [], prefetches: [], apis: [] };
  let inflight = 0;
  let last = Date.now();
  page.on("request", (req) => {
    inflight++;
    acc.peticiones++;
    last = Date.now();
    const h = req.headers();
    const u = new URL(req.url());
    const isApp = (u.hostname === "127.0.0.1" || u.hostname === "localhost") && u.port === new URL(BASE).port;
    const rsc = h["rsc"] === "1" || u.searchParams.has("_rsc");
    if (isApp && (rsc || req.resourceType() === "document" || req.method() === "POST" || u.pathname.startsWith("/api/"))) {
      if ((rsc ? !h["next-router-prefetch"] : req.resourceType() === "document") && req.method() === "GET") acc.navs.push({ url: req.url(), headers: req.allHeaders() });
      if (rsc && h["next-router-prefetch"] && req.method() === "GET") acc.prefetches.push({ url: req.url(), headers: req.allHeaders() });
      if (!rsc && u.pathname.startsWith("/api/") && req.method() === "GET") acc.apis.push({ url: req.url(), headers: req.allHeaders() });
      if (u.pathname === "/api/admin/notifications" && req.method() === "GET") notificationsBySection[current] = (notificationsBySection[current] ?? 0) + 1;
      acc.app.push(`${req.method()} ${u.pathname}${rsc ? (h["next-router-prefetch"] ? " [rsc·precarga]" : " [rsc]") : req.resourceType() === "document" ? " [documento]" : ""}`);
    }
  });
  const done = () => {
    inflight = Math.max(0, inflight - 1);
    last = Date.now();
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return {
    reset: () => {
      acc = { peticiones: 0, app: [], navs: [], prefetches: [], apis: [] };
    },
    read: () => acc,
    idle: async (quietMs = 500, maxMs = 30000) => {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        if (inflight === 0 && Date.now() - last >= quietMs) return Date.now() - quietMs;
        await new Promise((r) => setTimeout(r, 50));
      }
      return Date.now();
    },
  };
}

const measurements: Record<string, unknown>[] = [];
async function measure(
  page: Page,
  net: ReturnType<typeof trackNetwork>,
  name: string,
  action: () => Promise<unknown>,
  ready: () => Promise<unknown>,
) {
  const before = simLines().length;
  net.reset();
  // Marca en la página: primer nodo añadido/quitado y long tasks desde ahora.
  await page.evaluate(() => {
    const w = window as unknown as { __crm01: { t0: number; first: number | null; indicator: number | null; lt: number } };
    w.__crm01 = { t0: performance.now(), first: null, indicator: null, lt: 0 };
    const INDICATOR = '[data-crm-pending="true"], [data-crm-skeleton]';
    new MutationObserver((_list, obs) => {
      if (w.__crm01.indicator === null && document.querySelector(INDICATOR)) {
        w.__crm01.indicator = performance.now() - w.__crm01.t0;
        obs.disconnect();
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-crm-pending", "data-crm-skeleton"] });
    new MutationObserver((list, obs) => {
      if (w.__crm01.first === null && list.some((m) => m.addedNodes.length || m.removedNodes.length)) {
        w.__crm01.first = performance.now() - w.__crm01.t0;
        obs.disconnect();
      }
    }).observe(document.body, { childList: true, subtree: true });
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__crm01.lt += e.duration;
      }).observe({ type: "longtask" });
    } catch {
      /* sin soporte: queda en 0 */
    }
  }).catch(() => undefined);
  const t0 = Date.now();
  await action();
  await ready();
  const utilMs = Date.now() - t0;
  const idleAt = await net.idle();
  const completoMs = Math.max(utilMs, idleAt - t0);
  // Si la navegación recargó el documento, el marcador se perdió.
  const marks = await page
    .evaluate(() => (window as unknown as { __crm01?: { first: number | null; indicator: number | null; lt: number } }).__crm01 ?? null)
    .catch(() => null);
  await new Promise((r) => setTimeout(r, 150));
  const sim = summarizeSim(simLines().slice(before));
  const aislada = [];
  for (const n of net.read().navs) {
    const headers = await n.headers;
    const b = simLines().length;
    const res = await fetch(n.url, { headers: { ...headers, "accept-encoding": "identity" } });
    const body = Buffer.from(await res.arrayBuffer());
    const { gzipSync } = await import("node:zlib");
    await new Promise((r) => setTimeout(r, 100));
    aislada.push({
      peticion: new URL(n.url).pathname,
      estado: res.status,
      bytesSinComprimir: body.length,
      bytesGzip: gzipSync(body).length,
      consultas: summarizeSim(simLines().slice(b)),
    });
  }
  const replayGroup = async (items: { url: string; headers: Promise<Record<string, string>> }[]) => {
    const out: { peticion: string; estado: number; consultas: ReturnType<typeof summarizeSim> }[] = [];
    for (const n of items) {
      const headers = await n.headers;
      const b = simLines().length;
      const res = await fetch(n.url, { headers: { ...headers, "accept-encoding": "identity" } });
      await res.arrayBuffer();
      await new Promise((r) => setTimeout(r, 60));
      out.push({ peticion: new URL(n.url).pathname, estado: res.status, consultas: summarizeSim(simLines().slice(b)) });
    }
    const total = out.reduce((a, x) => a + x.consultas.total, 0);
    return { peticiones: out.length, consultasTotal: total, consultasPorPeticion: out.length ? +(total / out.length).toFixed(1) : 0, detalle: out };
  };
  const precargasAisladas = await replayGroup(net.read().prefetches);
  const apisAisladas = await replayGroup(net.read().apis);
  const m = {
    recorrido: current,
    navegacion: name,
    url: new URL(page.url()).pathname + new URL(page.url()).search,
    primerCambioMs: marks?.first != null ? Math.round(marks.first) : null,
    primerIndicadorMs: marks?.indicator != null ? Math.round(marks.indicator) : null,
    documentoRecargado: marks === null,
    utilMs,
    completoMs,
    tareasLargasMs: marks ? Math.round(marks.lt) : null,
    red: { peticiones: net.read().peticiones, app: net.read().app },
    consultasVentana: sim,
    navegacionAislada: aislada,
    precargasAisladas,
    apisAisladas,
  };
  measurements.push(m);
  const iso = aislada.map((a) => `${a.peticion} ${a.consultas.total} consultas, ${(a.bytesSinComprimir / 1024).toFixed(0)} KB (${(a.bytesGzip / 1024).toFixed(0)} KB gzip)`).join(" · ");
  console.log(
    `  ⏱  ${name}: indicador ${m.primerIndicadorMs ?? "—"} ms · primer cambio ${m.primerCambioMs ?? "—"} ms · útil ${utilMs} ms · completo ${completoMs} ms · ventana ${sim.total} consultas${iso ? ` · aislada: ${iso}` : ""}${precargasAisladas.peticiones ? ` · ${precargasAisladas.peticiones} precargas = ${precargasAisladas.consultasTotal} consultas` : ""}${apisAisladas.peticiones ? ` · ${apisAisladas.peticiones} /api = ${apisAisladas.consultasTotal} consultas` : ""}`,
  );
  return m;
}

// ── Navegador ────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const blocked: string[] = [];
async function newContext(token: string | null): Promise<BrowserContext> {
  const ctx = await browser.newContext(
    VARIANT === "movil"
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1400, height: 1000 } },
  );
  await ctx.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    blocked.push(u.origin + u.pathname);
    return route.abort();
  });
  if (token) await ctx.addCookies([{ name: "sb-127-auth-token", value: sessionCookie(token), url: BASE }]);
  return ctx;
}
async function newPage(ctx: BrowserContext) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (VARIANT === "movil") {
    await cdp.send("Network.enable");
    // Red y CPU limitadas (perfil «móvil medio» de Lighthouse): SIMULADO.
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  return { page, net: trackNetwork(page) };
}

async function clickSidebar(page: Page, name: RegExp) {
  const nav = page.locator("aside").getByRole("link", { name }).first();
  // En móvil la sidebar está fuera de pantalla (translate) hasta abrir el menú;
  // tras navegar se cierra con una animación de 300 ms: si no está del todo
  // dentro, se abre y se espera a que termine de entrar.
  const box = await nav.boundingBox().catch(() => null);
  if (!box || box.x < 0) {
    // Solo si está a medio cerrar (parte visible); cerrado del todo, como siempre.
    if (box && box.x + box.width > 0) await page.waitForTimeout(350);
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.waitForFunction(
      (re) => {
        const a = [...document.querySelectorAll("aside a")].find((x) => new RegExp(re).test(x.textContent?.trim() ?? ""));
        return Boolean(a && a.getBoundingClientRect().x >= 0);
      },
      name.source,
      { timeout: 10000 },
    );
  }
  await page.locator("aside").getByRole("link", { name }).first().click();
}
// «Útil» = estamos en la ruta de destino, se ve lo que el recorrido necesita
// (no basta un enlace parecido de la pantalla anterior) y no queda ningún
// esqueleto de carga en pantalla (con un esqueleto, la URL puede cambiar antes
// de que llegue el contenido).
const noSkeleton = (page: Page) => page.locator("[data-crm-skeleton]").first().waitFor({ state: "detached", timeout: 60000 });
const listReady = async (page: Page) => {
  await page.waitForURL((u) => u.pathname === LIST, { timeout: 60000 });
  await page.locator("label", { hasText: "Operación" }).locator("select").first().waitFor({ timeout: 60000 });
  await page.locator(`a[href^="${LIST}/sim-propiedad-"]`).first().waitFor({ timeout: 60000 });
  await noSkeleton(page);
};
const detailReady = async (page: Page) => {
  await page.waitForURL((u) => u.pathname.startsWith(`${LIST}/sim-propiedad-`), { timeout: 60000 });
  await page.getByRole("link", { name: /Volver al listado/ }).waitFor({ timeout: 60000 });
  await noSkeleton(page);
};
const selectValue = (page: Page, label: string) =>
  page.locator("label", { hasText: label }).locator("select").first().inputValue().catch(() => "(no visible)");
const activePage = (page: Page) =>
  page.locator("nav button.bg-ink, nav button[class*='bg-ink ']").first().textContent().catch(() => null);
const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

// ── Recorridos ───────────────────────────────────────────────────────────────
const ctx = await newContext(TOKEN);
const { page, net } = await newPage(ctx);

section("R1 · Sidebar → Propiedades → filtrar → página 2 → ficha → «Volver»");
await page.goto(`${BASE}/${COUNTRY}/admin`, { waitUntil: "domcontentloaded" });
await page.locator("aside").first().waitFor();
await net.idle();
await measure(page, net, "sidebar→propiedades (1.ª vez)", () => clickSidebar(page, /^Propiedades$/), () => listReady(page));
await page.locator("label", { hasText: "Operación" }).locator("select").selectOption("alquiler");
await page.locator("label", { hasText: "Distrito" }).locator("select").selectOption("Salamanca");
await page.locator("nav").getByRole("button", { name: "2", exact: true }).click();
await page.waitForTimeout(300);
const listUrl = page.url();
const listParams = params(listUrl);
check("la lista escribe filtros y página en la URL", listParams.operacion === "alquiler" && listParams.distrito === "Salamanca" && listParams.pagina === "2", new URL(listUrl).search);
const firstRow = page.locator(`a[href^="${LIST}/sim-propiedad-"]`).first();
const originHref = (await firstRow.getAttribute("href")) ?? "";
const originSlug = originHref.split("/").pop()!.split("?")[0];
check("el enlace de la fila lleva contexto de regreso", originHref.includes("volver="), originHref);
await measure(page, net, "lista→ficha", () => firstRow.click(), () => detailReady(page));
const backHref = (await page.getByRole("link", { name: /Volver al listado/ }).getAttribute("href")) ?? "";
await measure(page, net, "ficha→«Volver»", () => page.getByRole("link", { name: /Volver al listado/ }).click(), () => listReady(page));
{
  const p = params(page.url());
  check("«Volver» conserva operación y distrito en la URL", p.operacion === "alquiler" && p.distrito === "Salamanca", `href=${backHref} · url=${new URL(page.url()).search || "(sin consulta)"}`);
  check("«Volver» conserva la página", p.pagina === "2", `página activa=${await activePage(page)}`);
  check("los controles muestran los filtros", (await selectValue(page, "Operación")) === "alquiler" && (await selectValue(page, "Distrito")) === "Salamanca", `operación=${await selectValue(page, "Operación")} distrito=${await selectValue(page, "Distrito")}`);
  const rowVisible = await page.locator(`#propiedad-${originSlug}`).isVisible().catch(() => false);
  check("vuelve a la fila de origen (ancla visible)", rowVisible, `#propiedad-${originSlug}`);
}
await measure(page, net, "sidebar→propiedades (repetida)", async () => {
  await page.goto(`${BASE}/${COUNTRY}/admin`, { waitUntil: "domcontentloaded" });
  await page.locator("aside").first().waitFor();
  await net.idle();
  await clickSidebar(page, /^Propiedades$/);
}, () => listReady(page));

section("R2 · El mismo recorrido con Atrás/Adelante del navegador");
await measure(page, net, "carga completa de la lista filtrada (documento)", () => page.goto(listUrl, { waitUntil: "commit" }), () => listReady(page));
check("una URL explícita reconstruye los filtros al cargar", (await selectValue(page, "Operación")) === "alquiler" && (await selectValue(page, "Distrito")) === "Salamanca");
await measure(page, net, "lista→ficha", () => page.locator(`a[href^="${LIST}/sim-propiedad-"]`).first().click(), () => detailReady(page));
await measure(page, net, "ficha→Atrás", () => page.goBack(), () => listReady(page));
{
  const p = params(page.url());
  check("Atrás vuelve a la URL filtrada", p.operacion === "alquiler" && p.distrito === "Salamanca" && p.pagina === "2", new URL(page.url()).search);
  check("Atrás: los controles coinciden con la URL", (await selectValue(page, "Operación")) === "alquiler" && (await selectValue(page, "Distrito")) === "Salamanca", `operación=${await selectValue(page, "Operación")}`);
  check("Atrás: la página coincide con la URL", (await activePage(page)) === "2", `página activa=${await activePage(page)}`);
}
await measure(page, net, "lista→Adelante", () => page.goForward(), () => detailReady(page));
await page.goBack();
await listReady(page);
// Misma ruta, otra consulta, sin remontar: el menú lleva a la lista sin filtros.
await clickSidebar(page, /^Propiedades$/);
await page.waitForTimeout(800);
{
  const p = params(page.url());
  const op = await selectValue(page, "Operación");
  check("menú «Propiedades» desde una lista filtrada: URL y controles no se contradicen", (p.operacion ?? "") === op, `url=${new URL(page.url()).search || "(sin consulta)"} operación=${op || "(vacía)"}`);
}

section("R3 · Ficha por enlace directo y en pestaña nueva → «Volver»");
{
  const direct = await ctx.newPage();
  await direct.goto(`${BASE}${LIST}/sim-propiedad-7`, { waitUntil: "domcontentloaded" });
  await detailReady(direct);
  await direct.getByRole("link", { name: /Volver al listado/ }).click();
  await listReady(direct);
  check("entrada directa: «Volver» lleva a la lista del mismo país", new URL(direct.url()).pathname === LIST, direct.url());
  await direct.close();
  const tab = await ctx.newPage();
  await tab.goto(BASE + originHref, { waitUntil: "domcontentloaded" });
  await detailReady(tab);
  await tab.getByRole("link", { name: /Volver al listado/ }).click();
  await listReady(tab);
  const p = params(tab.url());
  check("pestaña nueva desde la lista: «Volver» conserva los filtros", p.operacion === "alquiler" && p.distrito === "Salamanca" && p.pagina === "2", new URL(tab.url()).search || "(sin consulta)");
  await tab.close();
}

section("R4 · Archivadas sí/no conservando filtros");
await page.goto(listUrl, { waitUntil: "domcontentloaded" });
await listReady(page);
await net.idle();
await measure(page, net, "Ver archivadas", () => page.getByRole("link", { name: /Ver archivadas/ }).click(), () => page.getByRole("link", { name: /Ocultar archivadas/ }).waitFor({ timeout: 60000 }));
{
  const p = params(page.url());
  check("«Ver archivadas» conserva operación y distrito", p.operacion === "alquiler" && p.distrito === "Salamanca", new URL(page.url()).search);
  check("«Ver archivadas» activa archivadas=1", p.archivadas === "1", new URL(page.url()).search);
}
await page.getByRole("link", { name: /Ocultar archivadas/ }).click();
await page.getByRole("link", { name: /Ver archivadas/ }).waitFor({ timeout: 60000 });
{
  const p = params(page.url());
  check("«Ocultar archivadas» conserva los filtros", p.operacion === "alquiler" && p.distrito === "Salamanca", new URL(page.url()).search);
}

section("R8 · Página fuera de rango y borrar desde la ficha");
await page.goto(`${BASE}${LIST}?operacion=alquiler&distrito=Salamanca&pagina=999`, { waitUntil: "domcontentloaded" });
await listReady(page);
await page.waitForTimeout(300);
{
  const p = params(page.url());
  const shown = await activePage(page);
  check("una página que no existe se corrige a la última y la URL coincide", p.pagina === shown && p.pagina !== "999", `url pagina=${p.pagina} · activa=${shown}`);
}
await page.goto(listUrl, { waitUntil: "domcontentloaded" });
await listReady(page);
{
  const historyBefore = await page.evaluate(() => history.length);
  await page.locator(`a[href^="${LIST}/sim-propiedad-"]`).first().click();
  await detailReady(page);
  page.once("dialog", (d) => void d.accept());
  const del = page.getByRole("button", { name: /^Eliminar propiedad$/ });
  if (await del.count()) {
    await del.click();
    await page.waitForURL((u) => u.pathname === LIST, { timeout: 60000 }).catch(() => undefined);
    const p = params(page.url());
    check("borrar vuelve a la lista con sus filtros", new URL(page.url()).pathname === LIST && p.operacion === "alquiler" && p.pagina === "2", new URL(page.url()).search || page.url());
    const historyAfter = await page.evaluate(() => history.length);
    check("borrar no deja la ficha borrada en el historial (replace)", historyAfter === historyBefore + 1, `historial ${historyBefore} → ${historyAfter}`);
  } else check("la ficha tiene botón de borrar", false);
}

section("R9 · Lista filtrada → ficha → story → ficha → lista");
{
  const storyLink = (pg: Page) => pg.getByRole("link", { name: /Story del SmartLink/ });
  const storyReady = async (pg: Page) => {
    await pg.waitForURL((u) => /\/story$/.test(u.pathname), { timeout: 60000 });
    await pg.getByRole("link", { name: /Volver a la propiedad/ }).waitFor({ timeout: 60000 });
  };
  await page.goto(listUrl, { waitUntil: "domcontentloaded" });
  await listReady(page);
  const row = page.locator(`a[href^="${LIST}/sim-propiedad-"]`).first();
  const slug = ((await row.getAttribute("href")) ?? "").split("/").pop()!.split("?")[0];
  await row.click();
  await detailReady(page);
  const storyHref = (await storyLink(page).getAttribute("href")) ?? "";
  check("el enlace a la story lleva el contexto", storyHref.includes("volver="), storyHref);
  await storyLink(page).click();
  await storyReady(page);
  await page.getByRole("link", { name: /Volver a la propiedad/ }).click();
  await detailReady(page);
  check("la story vuelve a la misma ficha con contexto", new URL(page.url()).pathname === `${LIST}/${slug}` && page.url().includes("volver="), new URL(page.url()).pathname + new URL(page.url()).search);
  await page.getByRole("link", { name: /Volver al listado/ }).click();
  await listReady(page);
  const p = params(page.url());
  check("…y la ficha vuelve a la lista con filtros y página", p.operacion === "alquiler" && p.distrito === "Salamanca" && p.pagina === "2", new URL(page.url()).search || "(sin consulta)");
  check("…y a la fila de origen", await page.locator(`#propiedad-${slug}`).isVisible().catch(() => false), `#propiedad-${slug}`);

  // Pestaña nueva directamente en la story con contexto.
  const tab = await ctx.newPage();
  await tab.goto(BASE + storyHref, { waitUntil: "domcontentloaded" });
  await storyReady(tab);
  await tab.getByRole("link", { name: /Volver a la propiedad/ }).click();
  await detailReady(tab);
  await tab.getByRole("link", { name: /Volver al listado/ }).click();
  await listReady(tab);
  const q = params(tab.url());
  check("pestaña nueva en la story: el trayecto conserva los filtros", q.operacion === "alquiler" && q.distrito === "Salamanca" && q.pagina === "2", new URL(tab.url()).search || "(sin consulta)");
  // Story sin contexto, y con un volver manipulado que intenta salir del país.
  await tab.goto(`${BASE}${LIST}/${slug}/story?volver=${encodeURIComponent("redirect=//evil.example&q=x")}`, { waitUntil: "domcontentloaded" });
  await storyReady(tab);
  const back = (await tab.getByRole("link", { name: /Volver a la propiedad/ }).getAttribute("href")) ?? "";
  check("un volver manipulado en la story se sanea y la ruta sigue en el país", back === `${LIST}/${slug}?volver=q%3Dx`, back);
  await tab.goto(`${BASE}${LIST}/${slug}/story`, { waitUntil: "domcontentloaded" });
  await storyReady(tab);
  await tab.getByRole("link", { name: /Volver a la propiedad/ }).click();
  await detailReady(tab);
  await tab.getByRole("link", { name: /Volver al listado/ }).click();
  await listReady(tab);
  check("story sin contexto: salida segura a la lista del país", new URL(tab.url()).pathname === LIST && !new URL(tab.url()).search, tab.url());
  await tab.close();
}

section("R10 · Galería de fotos desde la lista (abrir, cerrar, reabrir, otra propiedad)");
{
  // «Lista» = el modal muestra sus miniaturas (o marca data-crm-gallery="ready").
  const modalTitle = page.getByText("Fotos de la propiedad", { exact: true });
  const thumbs = () => page.locator('[data-crm-gallery-item], div[draggable="true"]');
  const galleryReady = async () => {
    await modalTitle.waitFor({ timeout: 60000 });
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-crm-gallery="ready"]')) || document.querySelectorAll('[data-crm-gallery-item], div[draggable="true"]').length > 0,
      undefined,
      { timeout: 60000 },
    );
  };
  const closeModal = async () => {
    await page.keyboard.press("Escape");
    await modalTitle.waitFor({ state: "hidden", timeout: 10000 }).catch(async () => {
      await page.getByRole("button", { name: /Cerrar/ }).first().click();
      await modalTitle.waitFor({ state: "hidden", timeout: 10000 });
    });
  };
  // Número de fotos que anuncia la fila (insignia sobre la portada).
  const rowCount = async (i: number) =>
    Number((await page.locator('li[id^="propiedad-"]').nth(i).getByRole("button", { name: /Gestionar fotos/ }).textContent())?.match(/\d+/)?.[0] ?? NaN);
  await page.goto(listUrl, { waitUntil: "domcontentloaded" });
  await listReady(page);
  await net.idle();
  const manage = (i: number) => page.locator('li[id^="propiedad-"]').nth(i).getByRole("button", { name: /Gestionar fotos/ });
  const expected0 = await rowCount(0);
  await measure(page, net, "abrir galería (1.ª vez)", () => manage(0).click(), galleryReady);
  check("la galería muestra tantas fotos como anuncia la fila", (await thumbs().count()) === expected0, `fila=${expected0} galería=${await thumbs().count()}`);
  await closeModal();
  await measure(page, net, "reabrir la misma galería", () => manage(0).click(), galleryReady);
  await closeModal();
  const expected1 = await rowCount(1);
  await measure(page, net, "abrir la galería de otra propiedad", () => manage(1).click(), galleryReady);
  check("otra propiedad: la galería es la suya", (await thumbs().count()) === expected1, `fila=${expected1} galería=${await thumbs().count()}`);
  await closeModal();
}

section("R12 · Campana: una petición por pestaña y minuto, y al momento tras marcar leída");
{
  // Cuenta TODAS las peticiones GET/POST a la campana de esta pestaña desde aquí.
  const calls: string[] = [];
  const onReq = (req: import("playwright").Request) => {
    if (new URL(req.url()).pathname === "/api/admin/notifications") calls.push(`${req.method()} ${Date.now()}`);
  };
  page.on("request", onReq);
  await page.goto(`${BASE}/${COUNTRY}/admin`, { waitUntil: "domcontentloaded" });
  await page.locator("aside").first().waitFor();
  await net.idle();
  // El panel (/es/admin) no tiene campana: la primera petición sale al llegar
  // a la primera página que la tiene. Desde ahí, otras 3 navegaciones en menos
  // de un minuto no deben volver a pedir.
  // R12 no mide tiempos: entre pasos se espera a que el cajón del menú
  // termine de cerrarse (móvil, 300 ms) y a que la campana haya pedido.
  const settle = () => page.waitForTimeout(VARIANT === "movil" ? 400 : 0);
  await clickSidebar(page, /^Propiedades$/);
  await listReady(page);
  for (let i = 0; i < 100 && !calls.some((c) => c.startsWith("GET")); i++) await page.waitForTimeout(100);
  await net.idle();
  await settle();
  const afterFirst = calls.filter((c) => c.startsWith("GET")).length;
  for (const name of [/^Clientes$/, /^Solicitudes$/, /^Propiedades$/]) {
    await clickSidebar(page, name);
    await page.waitForLoadState("domcontentloaded");
    await net.idle();
    await settle();
  }
  const gets = calls.filter((c) => c.startsWith("GET")).length;
  check("3 navegaciones más en menos de un minuto: la campana no vuelve a pedir", afterFirst >= 1 && gets === afterFirst, `peticiones GET: ${afterFirst} tras la 1.ª página con campana → ${gets} tras 3 navegaciones más`);
  // Marcar leída: abrir la campana y pulsar un aviso de opinión de catálogo.
  const bell = page.getByRole("button", { name: /Notificaciones|Notifications/ }).first();
  if (VARIANT === "movil") {
    console.log("  (marcar leída: solo en escritorio)");
  } else if (await bell.count()) {
    await bell.click();
    const notice = page.getByRole("link", { name: /Opinión sintética/ }).first();
    if (await notice.count()) {
      const before = calls.length;
      await notice.click();
      await page.waitForTimeout(1500);
      const after = calls.slice(before);
      check("marcar leída: POST y nueva petición al momento", after.some((c) => c.startsWith("POST")) && after.some((c) => c.startsWith("GET")), after.map((c) => c.split(" ")[0]).join(","));
    } else check("hay avisos de opinión en los datos sintéticos", false);
  } else check("la cabecera tiene campana", false);
  page.off("request", onReq);
}

section("R11 · Galería bajo demanda: fallos, reintento, cierres, cambio de propiedad y ediciones");
{
  // Solo aplica cuando la lista pide la galería al abrir el modal (CRM-02 E1).
  // Las respuestas de la ruta de la galería se retrasan o fallan con
  // `page.route`: el servidor y los datos son los mismos.
  const GALLERY = "**/api/admin/properties/*/photos*";
  const modalTitle = page.getByText("Fotos de la propiedad", { exact: true });
  const rowAt = (i: number) => page.locator('li[id^="propiedad-"]').nth(i);
  const manage = (i: number) => rowAt(i).getByRole("button", { name: /Gestionar fotos/ });
  const rowCount = async (i: number) => Number((await manage(i).textContent())?.match(/\d+/)?.[0] ?? NaN);
  const rowSlug = async (i: number) => ((await rowAt(i).getAttribute("id")) ?? "").replace(/^propiedad-/, "");
  const items = () => page.locator("[data-crm-gallery-item]");
  // Las URLs sintéticas llevan `?p=<n.º de propiedad>-<foto>`: dicen de quién es cada foto.
  const owners = async () =>
    page.locator("[data-crm-gallery-item] img").evaluateAll((imgs) =>
      [...new Set(imgs.map((i) => decodeURIComponent((i as HTMLImageElement).src).match(/p=(\d+)-/)?.[1] ?? "?"))],
    );
  const closeModal = async () => {
    await page.keyboard.press("Escape");
    await modalTitle.waitFor({ state: "hidden", timeout: 10000 });
  };
  const ready = () => page.locator('[data-crm-gallery="ready"]').waitFor({ timeout: 30000 });
  const delayed = (ms: number, times = 1) =>
    page.route(GALLERY, async (route) => {
      await new Promise((r) => setTimeout(r, ms));
      await route.continue().catch(() => undefined);
    }, { times });

  await page.goto(listUrl, { waitUntil: "domcontentloaded" });
  await listReady(page);
  await net.idle();
  const n0 = (await rowSlug(0)).replace(/^sim-propiedad-/, "");
  const n1 = (await rowSlug(1)).replace(/^sim-propiedad-/, "");

  // 1 · Error y reintento.
  await page.route(GALLERY, (route) => route.fulfill({ status: 500, body: "{}" }), { times: 1 });
  await manage(0).click();
  await page.getByRole("alert").filter({ hasText: /No se pudieron cargar las fotos/ }).waitFor({ timeout: 30000 });
  check("si la galería falla se dice y no se enseña una galería vacía", (await items().count()) === 0);
  await page.getByRole("button", { name: "Reintentar" }).click();
  await ready();
  check("«Reintentar» carga la galería correcta", (await items().count()) === (await rowCount(0)) && (await owners()).join() === n0, `fotos=${await items().count()} de=${(await owners()).join()}`);
  await closeModal();

  // 2 · Cerrar con la petición en vuelo y reabrir.
  await delayed(1500);
  await manage(0).click();
  await closeModal();
  await manage(0).click();
  await ready();
  await page.waitForTimeout(1800); // la respuesta retrasada llega ahora
  check("cerrar y reabrir: la galería sigue siendo la suya y completa", (await items().count()) === (await rowCount(0)) && (await owners()).join() === n0, `fotos=${await items().count()} de=${(await owners()).join()}`);
  await closeModal();

  // 3 · Cambiar de propiedad con una respuesta tardía de la anterior.
  await delayed(2000);
  await manage(0).click();
  await closeModal();
  await manage(1).click();
  await ready();
  await page.waitForTimeout(2300);
  check("otra propiedad: una respuesta tardía de la anterior no la pisa", (await owners()).join() === n1 && (await items().count()) === (await rowCount(1)), `de=${(await owners()).join()} fotos=${await items().count()}`);
  await closeModal();

  // 4 · Edición mientras llega una respuesta más vieja: gana la edición.
  await delayed(2500);
  await manage(1).click(); // enseña lo último conocido y pide de nuevo (retrasado)
  await items().first().waitFor({ timeout: 30000 });
  const secondBefore = await items().nth(1).locator("img").getAttribute("src");
  await items().nth(1).hover();
  await items().nth(1).getByRole("button", { name: /Hacer principal/ }).click({ force: true });
  await page.waitForTimeout(3000); // la respuesta retrasada (orden antiguo) ya llegó
  const firstAfter = await items().first().locator("img").getAttribute("src");
  check("una edición hecha mientras llegaba la galería no se pierde", firstAfter === secondBefore, `primera=${firstAfter?.slice(-40)} esperada=${secondBefore?.slice(-40)}`);
  await closeModal();
}

section("R5 · Sidebar → Clientes → ficha → Atrás");
await page.goto(`${BASE}/${COUNTRY}/admin`, { waitUntil: "domcontentloaded" });
await page.locator("aside").first().waitFor();
await net.idle();
await measure(page, net, "sidebar→clientes", () => clickSidebar(page, /^Clientes$/), () => page.waitForURL((u) => u.pathname === `/${COUNTRY}/admin/clientes`, { timeout: 60000 }).then(() => page.locator("h1").first().waitFor({ timeout: 60000 })).then(() => noSkeleton(page)));
{
  const link = page.locator(`a[href^="/${COUNTRY}/admin/clientes/"]`).first();
  if (await link.count()) {
    await measure(page, net, "clientes→ficha", () => link.click(), () => page.waitForURL(/\/clientes\/[^/?]+/, { timeout: 60000 }).then(() => noSkeleton(page)));
    await measure(page, net, "ficha→Atrás", () => page.goBack(), () => page.waitForURL(/\/clientes(\?|$)/, { timeout: 60000 }).then(() => noSkeleton(page)));
  } else check("hay clientes que abrir en los datos sintéticos", false, "sin enlaces a fichas");
}

section("R6 · Sidebar → Solicitudes");
await measure(page, net, "sidebar→solicitudes", () => clickSidebar(page, /^Solicitudes$/), () => page.waitForURL(/\/solicitudes/, { timeout: 60000 }).then(() => page.locator("h1").first().waitFor({ timeout: 60000 })).then(() => noSkeleton(page)));

section("R7 · Clics rápidos: gana el último destino");
if (VARIANT === "movil") {
  // En móvil el menú se cierra al navegar: tres clics seguidos no son posibles.
  console.log("  (solo en escritorio)");
} else {
  await page.goto(`${BASE}/${COUNTRY}/admin`, { waitUntil: "domcontentloaded" });
  await page.locator("aside").first().waitFor();
  await net.idle();
  await clickSidebar(page, /^Propiedades$/);
  await clickSidebar(page, /^Clientes$/);
  await clickSidebar(page, /^Solicitudes$/);
  await net.idle(800);
  check("tras tres clics rápidos la URL es la del último", /\/solicitudes/.test(page.url()), page.url());
}

await ctx.close();

// CRM-03 (PR-C): el texto de varias fichas, para comparar la salida de dos
// builds sobre los mismos datos (etiquetas, SmartLinks con aperturas y medios).
// Los datos sintéticos enlazan etiquetas de `cl` a propiedades `es`: la ficha
// `es` no debe mostrarlas.
section("R13 · Ficha: etiquetas, SmartLinks, aperturas y medios (paridad)");
const fichas: Record<string, string> = {};
const salidas: Record<string, string> = {};
{
  const c = await newContext(TOKEN);
  const { page: p } = await newPage(c);
  for (const n of [1, 2, 4, 11, 19, 37]) {
    const slug = `sim-propiedad-${n}`;
    await p.goto(`${BASE}${LIST}/${slug}`, { waitUntil: "domcontentloaded" });
    await detailReady(p);
    await p.waitForLoadState("networkidle").catch(() => {});
    fichas[slug] = await p.locator("main").innerText();
  }
  check("ninguna ficha `es` muestra etiquetas de `cl`", Object.values(fichas).every((t) => !/Chile [AB]/.test(t)));
  check("la ficha 1 muestra sus dos etiquetas del país", /Destacada/.test(fichas["sim-propiedad-1"]) && /Lujo/.test(fichas["sim-propiedad-1"]));
  check("la ficha 1 muestra su plano y su SmartLink", /plano-sintetico-1\.pdf/.test(fichas["sim-propiedad-1"]) && /simtoken0x0/.test(fichas["sim-propiedad-1"]));
  check("una ficha sin enlaces ni medios no muestra los de otra", !/simtoken|plano-sintetico/.test(fichas["sim-propiedad-2"]));
  // Mismos resultados y errores en los otros usos de la lectura de la ficha:
  // story y PDF, con un slug que existe y con uno que no.
  for (const [nombre, ruta] of [
    ["ficha", `${LIST}/sim-propiedad-1`],
    ["ficha inexistente", `${LIST}/no-existe-crm03`],
    ["story", `${LIST}/sim-propiedad-1/story`],
    ["story inexistente", `${LIST}/no-existe-crm03/story`],
    ["PDF", `/api/admin/properties/sim-propiedad-1/pdf`],
    ["PDF inexistente", `/api/admin/properties/no-existe-crm03/pdf`],
  ] as const) {
    const r = await p.request.get(`${BASE}${ruta}`, { maxRedirects: 0 });
    salidas[nombre] = `${r.status()} ${(r.headers()["content-type"] ?? "").split(";")[0]}`;
  }
  check("ficha, story y PDF responden (estado y tipo anotados para comparar builds)", salidas["ficha"].startsWith("200") && salidas["story"].startsWith("200") && salidas["PDF"].startsWith("200"), JSON.stringify(salidas));
  await c.close();
}

section("Identidad (sin sesión, cuenta suspendida)");
for (const [name, token, expect] of [
  ["sin sesión", null, /\/login/],
  ["cuenta suspendida", "sim-token-suspended-crm01", /\/login\?suspended=1/],
] as const) {
  const c = await newContext(token);
  const { page: p } = await newPage(c);
  await p.goto(`${BASE}${LIST}?operacion=alquiler`, { waitUntil: "domcontentloaded" });
  check(`${name}: la lista redirige al login`, expect.test(p.url()), p.url());
  await c.close();
}

await browser.close();

const fails = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - fails}/${checks.length} comprobaciones del contrato en verde${blocked.length ? ` · ${blocked.length} peticiones externas abortadas` : ""}`);
if (OUT) {
  writeFileSync(
    OUT,
    JSON.stringify(
      { etiqueta: LABEL, variante: VARIANT, pasada: process.env.PASADA ?? null, base: BASE, fecha: new Date().toISOString(), nota: "Mediciones LOCALES contra el simulador; no son tiempos de producción.", comprobaciones: checks, mediciones: measurements, notificacionesPorRecorrido: notificationsBySection, externasAbortadas: [...new Set(blocked)], fichas, salidas },
      null,
      2,
    ),
  );
  console.log(`→ ${OUT}`);
}
process.exit(process.env.STRICT === "1" && fails ? 1 : 0);
