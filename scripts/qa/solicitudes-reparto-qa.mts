// SOLO PRUEBAS LOCALES. Recorrido visual de Solicitudes (tres vistas, ficha,
// registrar contacto, asignación) y de Reparto comercial sobre el build
// compilado (`next start`) contra scripts/sim/postgrest-sim.mts --auth con los
// datos de scripts/sim/fixtures/solicitudes-reparto.gen.mts.
//
//   BASE=http://127.0.0.1:3281 OUT_DIR=<carpeta> \
//   node --experimental-strip-types scripts/qa/solicitudes-reparto-qa.mts
//
// Hace capturas (escritorio 1440 y móvil 390) y comprueba lo que se puede
// comprobar sin base real: qué ve una administradora y qué ve un asesor, que
// los diálogos abren y cierran con Escape devolviendo el foco, y que no hay
// errores de consola. Ninguna petición sale de 127.0.0.1: el resto se aborta.
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3281";
const OUT = process.env.OUT_DIR ?? "./qa-out";
mkdirSync(OUT, { recursive: true });

const OWNER = "sim-token-owner-crm01";
const ADVISOR = "sim-token-advisor-crm01";
const JUNIOR = "sim-token-junior-crm01";
// Capturas de la ficha para enseñar (1440 × 900, oscuro): al expediente.
const FICHA_OUT = process.env.FICHA_OUT ?? OUT;
const CLIENT = "00000000-0000-4000-9006-000000000001";
const LEAD = (n: number) => `00000000-0000-4000-9003-${String(n).padStart(12, "0")}`;

const results: Array<{ ok: boolean; name: string; detail?: string }> = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ ok, name, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const cookie = (token: string) => {
  const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
  const session = { access_token: token, token_type: "bearer", expires_in: 30 * 86400, expires_at: exp, refresh_token: "sim-refresh", user: { id: "sim" } };
  return "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
};

async function context(token: string, mobile: boolean) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  // Nombre de la cookie de supabase-js: sb-<ref>-auth-token; ref = primer
  // segmento del host del NEXT_PUBLIC_SUPABASE_URL (127 en local).
  await ctx.addCookies([{ name: "sb-127-auth-token", value: cookie(token), url: BASE }]);
  await ctx.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return route.continue();
    return route.abort();
  });
  return { browser, ctx };
}

const errors: string[] = [];
function watch(page: Page, label: string) {
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED/.test(m.text())) {
      errors.push(`${label}: ${m.text().slice(0, 200)}`);
    }
  });
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

// ── Administradora, escritorio ───────────────────────────────────────────────
{
  const { browser, ctx } = await context(OWNER, false);
  const page = await ctx.newPage();
  watch(page, "admin");

  await page.goto(`${BASE}/es/admin/solicitudes?view=all`, { waitUntil: "networkidle" });
  const cards = await page.locator("[data-lead-id]").count();
  check("A · Tarjetas: se pintan las solicitudes", cards >= 10, `${cards} tarjetas`);
  check("A · vínculo visible en la tarjeta", (await page.getByText("Vínculo exacto").count()) > 0 && (await page.getByText("Por verificar").count()) > 0);
  // Extensión atrasada: aviso con el paquete para descargar (administradora).
  const notice = page.locator("[data-extension-notice]");
  check("Extensión · aviso de versión atrasada con descarga", (await notice.count()) === 1
    && /extension-download/.test((await notice.getByRole("link").first().getAttribute("href")) ?? ""));
  // El texto de orden dice el orden que de verdad se aplica.
  // Cabecera ligera (maqueta): sin línea de resultados/orden; el orden vive en
  // Filtros y el selector refleja el aplicado.
  const sortIn = async (q: string) => {
    await page.goto(`${BASE}/es/admin/solicitudes?${q}`, { waitUntil: "networkidle" });
    const noLine = (await page.getByText(/Primero /).count()) === 0;
    await page.getByRole("button", { name: /^Filtros/ }).click();
    const v = await page.getByRole("combobox", { name: "Orden" }).inputValue();
    return { noLine, v };
  };
  const s1 = await sortIn("view=all");
  check("Cabecera · sin línea de resultados; orden por defecto en Filtros", s1.noLine && s1.v === "");
  const s2 = await sortIn("view=all&sort=oldest");
  check("Cabecera · «Más antiguas» elegido se ve en Filtros", s2.noLine && s2.v === "oldest");
  const s3 = await sortIn("view=all&sort=activity");
  check("Cabecera · «Última actividad» elegido se ve en Filtros", s3.noLine && s3.v === "activity");
  const inboxLine = await page.getByRole("tab", { name: /^Todas/, selected: true }).locator("span[aria-hidden]").last()
    .evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, op: getComputedStyle(el).opacity }));
  check("Cabecera · la línea dorada de la pestaña activa se pinta", inboxLine.op === "1" && !/rgba\(0, 0, 0, 0\)|transparent/.test(inboxLine.bg), `${inboxLine.bg}`);
  check("Cabecera · pestañas ligeras: la activa lleva subrayado y aria-selected",
    (await page.getByRole("tab", { name: /^Todas/, selected: true }).count()) === 1
      && (await page.getByRole("tab", { name: /^Nuevas/, selected: false }).count()) === 1);
  // Solicitud con cliente vinculado (cuenta como «converted»): se sigue
  // pudiendo registrar el contacto.
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(8)}`, { waitUntil: "networkidle" });
  check("Ficha con cliente vinculado · «Registrar contacto» disponible", (await page.getByRole("button", { name: "Registrar contacto" }).count()) > 0);
  await page.goto(`${BASE}/es/admin/solicitudes?view=all`, { waitUntil: "networkidle" });
  check("A · pendiente de reparto visible", (await page.getByText("Pendiente de reparto").count()) > 0);
  await shot(page, "01-tarjetas-escritorio");

  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(1)}`, { waitUntil: "networkidle" });
  // Cabecera: «Responsable · nombre»; el motivo y Zinto, en el desplegable.
  const ownerSummary = page.locator("summary", { hasText: "Responsable" });
  check("Cabecera · línea discreta «Responsable · Asesor Sintético»", (await ownerSummary.count()) === 1
    && /Responsable\s*·\s*Asesor Sintético/.test((await ownerSummary.innerText()).replace(/\n/g, " ")));
  check("Cabecera · el motivo del reparto no se ve hasta abrir el detalle", !(await page.getByText("Reparto automático por inmueble").first().isVisible()));
  await ownerSummary.click();
  check("Ficha · responsable y origen", await page.getByText("Reparto automático por inmueble").first().isVisible());
  check("Ficha · Zinto separado del responsable", await page.getByText("Zinto: pendiente").first().isVisible());
  await page.keyboard.press("Escape");
  check("Cabecera · Escape cierra el detalle y devuelve el foco", !(await page.getByText("Zinto: pendiente").first().isVisible())
    && (await page.evaluate(() => document.activeElement?.tagName)) === "SUMMARY");
  check("Ficha · aviso de que abrir Zinto no es contactar", (await page.getByText("Abrir Zinto o llamar no marca el contacto como realizado.").count()) > 0);
  await shot(page, "02-ficha-resumen");

  // Registrar contacto: abre, Escape cierra (sin cambios) y el foco vuelve.
  const open = page.getByRole("button", { name: "Registrar contacto" }).first();
  await open.click();
  check("Registrar contacto · diálogo abierto", await page.getByRole("dialog", { name: "Registrar contacto" }).isVisible());
  await page.getByText("No contesta").click();
  await page.getByRole("button", { name: "Mañana" }).click();
  await page.getByLabel("Qué hay que hacer").fill("Volver a llamar para confirmar visita");
  check("Registrar contacto · fecha y hora de Madrid visibles antes de guardar", (await page.getByText(/hora de Madrid/).count()) > 0);
  await shot(page, "03-registrar-contacto");
  page.once("dialog", (d) => d.accept());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check("Registrar contacto · Escape cierra (avisando de cambios)", !(await page.getByRole("dialog", { name: "Registrar contacto" }).isVisible().catch(() => false)));
  const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
  check("Registrar contacto · el foco vuelve al botón", /Registrar contacto/.test(focused), focused.trim().slice(0, 40));

  // Pestañas
  await page.getByRole("tab", { name: /Actividad/ }).click();
  await shot(page, "04-ficha-actividad");
  await page.getByRole("tab", { name: /Cliente y datos/ }).click();
  await page.getByRole("button", { name: "Ver evidencia" }).click();
  check("Ficha · evidencia del origen bajo demanda", await page.getByRole("dialog", { name: "Evidencia del origen" }).isVisible());
  await page.keyboard.press("Escape");
  await shot(page, "05-ficha-cliente-datos");

  // Republicación: la consulta conserva su código anterior y la ficha lo dice.
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(4)}`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Cliente y datos/ }).click();
  await page.getByRole("button", { name: "Ver evidencia" }).click();
  check("Evidencia · consulta por una publicación anterior del anuncio", (await page.getByText(/Publicación anterior: el anuncio se republicó con el código 900210/).count()) === 1);
  await shot(page, "05b-publicacion-anterior");
  await page.keyboard.press("Escape");
  // Caso 3 de Codex: código desconocido con otro anuncio guardado → sin «Publicación anterior».
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(13)}`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Cliente y datos/ }).click();
  await page.getByRole("button", { name: "Ver evidencia" }).click();
  check("Evidencia · «Cod.» desconocido con otro anuncio guardado: sin «Publicación anterior»", (await page.getByText(/Publicación anterior/).count()) === 0
    && (await page.getByText("900777").count()) > 0);
  await page.keyboard.press("Escape");

  // Asignar una pendiente (sin cliente)
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(2)}`, { waitUntil: "networkidle" });
  check("Ficha pendiente · motivo del reparto", (await page.getByText(/ese piso no tiene asesor asignado/).count()) > 0);
  check("Cabecera · sin responsable: «Responsable · Por asignar»", (await page.locator("summary", { hasText: "Por asignar" }).count()) === 1);
  await page.getByRole("button", { name: "Asignar asesor" }).click();
  check("Asignar · diálogo para administradora", await page.getByRole("dialog", { name: "Asignar solicitud" }).isVisible());
  await shot(page, "06-asignar-solicitud");
  await page.keyboard.press("Escape");

  // Reasignar cliente (con cliente vinculado y conflicto)
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(8)}`, { waitUntil: "networkidle" });
  check("Conflicto de responsable visible", (await page.getByText("Dos responsables posibles").count()) > 0);
  // Con cliente vinculado, «Cambiar» reasigna el cliente completo.
  await page.getByRole("button", { name: "Cambiar", exact: true }).click();
  await page.getByText("Qué se traslada").waitFor({ timeout: 5000 }).catch(() => {});
  check("Reasignar cliente · alcance antes de confirmar", (await page.getByText(/solicitudes abiertas/i).count()) > 0);
  await shot(page, "07-reasignar-cliente");
  await page.keyboard.press("Escape");

  // Vínculo por verificar: no se ofrece preparar visita
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(5)}`, { waitUntil: "networkidle" });
  check("Vínculo sin verificar · visita bloqueada", (await page.getByText("Para preparar una visita, confirma antes el anuncio.").count()) > 0);
  // 0238 · sin vínculo exacto no se enseña ningún inmueble «parecido».
  check("0238 · sin vínculo exacto: «Anuncio sin identificar», sin foto ni ficha",
    (await page.getByText("Anuncio sin identificar").count()) > 0
      && (await page.getByRole("link", { name: /Ficha interna/ }).count()) === 0
      && (await page.getByRole("link", { name: /Ver anuncio original/ }).count()) === 0);
  // 0238 · con vínculo exacto, enlace al anuncio EXACTO por su código.
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(1)}`, { waitUntil: "networkidle" });
  const adLink = page.getByRole("link", { name: /Ver anuncio original/ });
  check("0238 · vínculo exacto: «Ver anuncio original» va al código del anuncio",
    (await adLink.count()) > 0 && /\/inmueble\/900210\//.test((await adLink.first().getAttribute("href")) ?? ""));
  // 0238 · «Cod.» de un anuncio publicado por API → exacto, con su enlace.
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(14)}`, { waitUntil: "networkidle" });
  const apiLink = page.getByRole("link", { name: /Ver anuncio original/ });
  check("0238 · anuncio publicado por API: vínculo exacto y enlace a su código",
    (await page.getByText("Vínculo exacto").count()) > 0 && /\/inmueble\/777001\//.test((await apiLink.first().getAttribute("href").catch(() => "")) ?? ""));
  // 0238 · caducada: la bandeja y la ficha no la enseñan.
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(15)}`, { waitUntil: "networkidle" });
  check("0238 · caducada: no aparece ni en la bandeja ni por URL",
    (await page.getByText("Caducada Prueba").count()) === 0 && (await page.locator(`[data-lead-id="${LEAD(15)}"]`).count()) === 0);
  // 0238 · tarjeta sin vínculo exacto: sin foto.
  await page.goto(`${BASE}/es/admin/solicitudes?view=all`, { waitUntil: "networkidle" });
  check("0238 · tarjeta sin vínculo exacto: sin foto", (await page.locator(`[data-lead-id="${LEAD(5)}"] img`).count()) === 0
    && (await page.locator(`[data-lead-id="${LEAD(1)}"] img`).count()) === 1);
  // 0238 · Por piso agrupa también el anuncio publicado por API.
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&mode=property`, { waitUntil: "networkidle" });
  check("0238 · Por piso: el anuncio publicado por API tiene su grupo", (await page.getByText("Piso API en Velázquez").count()) > 0);
  // Ruido fuera: sin segmento «Atención»; «Retirados» aparte; asesor del piso visible.
  check("Ruido · no hay segmento «Atención» y sí «Retirados»",
    (await page.getByRole("tab", { name: /^Atención/ }).count()) === 0 && (await page.getByRole("tab", { name: /^Retirados/ }).count()) === 1);
  check("Ruido · «Todas» no enseña el anuncio retirado; «Por piso» dice el asesor del piso",
    (await page.getByText("Piso en Goya").count()) === 0 && (await page.getByText("Asesor del piso").count()) > 0
      && (await page.getByText("Asesor Sintético").count()) > 0);
  await page.goto(`${BASE}/es/admin/solicitudes?view=retired&mode=property`, { waitUntil: "networkidle" });
  // 0241 · los anuncios retirados van aparte, después de los publicados.
  const retiredHeading = page.getByRole("heading", { name: "Anuncios retirados" });
  check("0241 · vista «Retirados» por piso: sección «Anuncios retirados» con su anuncio",
    (await retiredHeading.count()) === 1 && (await page.getByText("Piso en Goya").count()) > 0
      && ((await retiredHeading.boundingBox())?.y ?? 0) < ((await page.getByText("Piso en Goya").first().boundingBox())?.y ?? 0));
  await page.goto(`${BASE}/es/admin/solicitudes?view=retired`, { waitUntil: "networkidle" });
  check("0241 · tarjeta de un anuncio retirado lo dice y conserva su origen",
    (await page.locator(`[data-lead-id="${LEAD(3)}"]`).getByText("Anuncio retirado").count()) === 1
      && (await page.locator(`[data-lead-id="${LEAD(3)}"]`).getByText("BC-9011").count()) === 1);
  // Sugerencia por calle y precio: se ofrece, no se afirma.
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(16)}`, { waitUntil: "networkidle" });
  // Acotado al bloque del anuncio: la bandeja sigue montada (oculta) detrás de la ficha.
  const adPanel = page.locator("[data-crm-panel]", { hasText: "Anuncio consultado" });
  check("Sugerencia · sin anuncio identificado se ofrece el que coincide por calle y precio",
    (await adPanel.getByText("¿Es este anuncio?").count()) === 1 && (await adPanel.getByText("Ático en Castelló").count()) > 0
      && (await adPanel.getByRole("button", { name: "Sí, es este" }).count()) === 1 && (await adPanel.getByText("Vínculo exacto").count()) === 0
      && (await adPanel.getByText("Anuncio sin identificar").count()) === 1);
  await page.getByRole("button", { name: "No es este" }).click();
  check("Sugerencia · «No es este» la retira", (await page.getByText("¿Es este anuncio?").count()) === 0);
  await page.goto(`${BASE}/es/admin/solicitudes?view=all`, { waitUntil: "networkidle" });
  // Respuesta inmediata: con el servidor lento (1,5 s), el botón pulsado se
  // marca antes de que llegue la página.
  await page.route("**/es/admin/solicitudes**", async (route) => {
    if (route.request().headers()["rsc"]) await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.getByRole("button", { name: "Prioridades" }).click();
  await page.waitForTimeout(200);
  check("Botones · la vista pulsada se marca al instante aunque el servidor tarde",
    (await page.getByRole("button", { name: "Prioridades" }).getAttribute("aria-pressed")) === "true"
      && (await page.getByRole("button", { name: "Tarjetas" }).getAttribute("aria-pressed")) === "false");
  await page.unroute("**/es/admin/solicitudes**");
  await page.waitForLoadState("networkidle");
  await shot(page, "08-vinculo-por-verificar");

  // B y C
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&mode=property`, { waitUntil: "networkidle" });
  check("B · grupo «Por verificar» separado", (await page.getByText("Por verificar · anuncio sin identificar").count()) > 0);
  await shot(page, "09-por-inmueble");
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&mode=priorities`, { waitUntil: "networkidle" });
  check("C · tres columnas", (await page.getByRole("heading", { name: "Atender hoy" }).count()) === 1 && (await page.getByRole("heading", { name: "Programadas" }).count()) === 1);
  await shot(page, "10-prioridades");

  // Reparto comercial
  await page.goto(`${BASE}/es/admin/reparto`, { waitUntil: "networkidle" });
  check("Reparto · tabla visible para administradora", (await page.getByRole("table").count()) === 1);
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("checkbox").nth(2).check();
  await page.getByRole("checkbox").nth(3).check();
  check("Reparto · barra contextual con 3 seleccionados", (await page.getByText("Seleccionados: 3").count()) === 1);
  await page.getByRole("button", { name: "Asignar a ejecutivo" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Asesor").selectOption({ index: 2 });
  check("Reparto · revisión de lo que se sustituye antes de confirmar", (await dialog.getByText(/se sustituyen/).count()) + (await dialog.getByText("Sin asesor").count()) > 0);
  await shot(page, "11-reparto-asignar");
  await page.keyboard.press("Escape");
  await shot(page, "12-reparto-tabla");

  // Ficha del cliente: el asesor solo se cambia con «Reasignar cliente».
  await page.goto(`${BASE}/es/admin/clientes/${CLIENT}`, { waitUntil: "networkidle" });
  check("Cliente · administradora ve «Reasignar cliente»", (await page.getByRole("button", { name: "Reasignar cliente" }).count()) === 1);
  check("Cliente · ya no hay desplegable de asesor", (await page.locator("header select").count()) === 0);
  await page.getByRole("button", { name: "Reasignar cliente" }).click();
  await page.getByText("Qué se traslada").waitFor({ timeout: 5000 }).catch(() => {});
  check("Cliente · reasignar muestra el alcance", (await page.getByText(/solicitudes abiertas/i).count()) > 0);
  await shot(page, "12b-cliente-reasignar");
  await page.keyboard.press("Escape");
  await browser.close();
}

// ── Ficha por pestañas (maquetas del 4 de noviembre) ─────────────────────────
const TABS = ["Resumen", "Actividad", "Cliente y datos"] as const;
const TAB_FILE: Record<(typeof TABS)[number], string> = { "Resumen": "resumen", "Actividad": "actividad", "Cliente y datos": "cliente" };
/** El contenido inicial cabe en la ventana: ni la página ni ningún panel pasan del borde. */
async function fits(page: Page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const panels = [...document.querySelectorAll("[data-crm-panel]")].filter((el) => (el as HTMLElement).offsetParent !== null);
    const bottom = Math.max(0, ...panels.map((el) => el.getBoundingClientRect().bottom + window.scrollY));
    return { ok: doc.scrollHeight <= window.innerHeight + 1 && bottom <= window.innerHeight, scroll: doc.scrollHeight, bottom: Math.round(bottom), vh: window.innerHeight };
  });
}
async function setTheme(page: Page, theme: "dark" | "light") {
  await page.evaluate((th) => {
    if (th === "dark") document.documentElement.dataset.crmTheme = "dark";
    else delete document.documentElement.dataset.crmTheme;
  }, theme);
  await page.waitForTimeout(150);
}
{
  const { browser, ctx } = await context(OWNER, false);
  const page = await ctx.newPage();
  watch(page, "ficha");
  const lead = (n: number) => `${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(n)}`;

  // 1440 × 900: cada pestaña cabe sin desplazarse, en oscuro y en claro.
  await page.goto(lead(1), { waitUntil: "networkidle" });
  for (const theme of ["dark", "light"] as const) {
    await setTheme(page, theme);
    for (const tab of TABS) {
      await page.getByRole("tab", { name: tab }).click();
      await page.waitForTimeout(250);
      const f = await fits(page);
      check(`Ficha 1440×900 · ${theme === "dark" ? "oscuro" : "claro"} · «${tab}» cabe sin desplazamiento`, f.ok, `página ${f.scroll}px, último panel ${f.bottom}px de ${f.vh}`);
      if (theme === "dark") await page.screenshot({ path: `${FICHA_OUT}/A02_Ficha_${TAB_FILE[tab]}_oscuro.png` });
      else await shot(page, `20-ficha-${TAB_FILE[tab]}-claro`);
    }
  }
  await setTheme(page, "light");

  // Cabecera y pestañas.
  await page.getByRole("tab", { name: "Resumen" }).click();
  check("Cabecera · «Volver a tarjetas» y estado de la solicitud", (await page.getByRole("button", { name: "Volver a tarjetas" }).count()) > 0
    && (await page.locator("header", { has: page.getByRole("heading", { level: 1, name: "Lucía Prueba" }) }).getByText("Nueva", { exact: true }).count()) === 1);
  // La línea bajo la pestaña activa se pinta de verdad (no solo aria-selected).
  const underline = async (name: string) => page.getByRole("tab", { name, selected: true }).locator("span[aria-hidden]").last()
    .evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, op: getComputedStyle(el).opacity }));
  await page.waitForTimeout(400); // fin de la transición de opacidad
  const u = await underline("Resumen");
  check("Pestañas · la activa lleva una línea dorada visible", u.op === "1" && !/rgba\(0, 0, 0, 0\)|transparent/.test(u.bg), `${u.bg} · opacidad ${u.op}`);
  check("Pestañas · ligeras, la activa con aria-selected", (await page.getByRole("tab", { name: "Resumen", selected: true }).count()) === 1
    && (await page.getByRole("tab", { name: "Actividad", selected: false }).count()) === 1);
  await page.getByRole("tab", { name: "Resumen" }).focus();
  await page.keyboard.press("ArrowRight");
  check("Pestañas · flecha derecha pasa a «Actividad» con el foco", (await page.getByRole("tab", { name: "Actividad", selected: true }).count()) === 1
    && (await page.evaluate(() => document.activeElement?.textContent ?? "")) === "Actividad");

  // Resumen: secciones, acciones y conversación aparte del anuncio.
  await page.getByRole("tab", { name: "Resumen" }).click();
  const summaryPanels = await page.locator("[data-crm-panel] > header h2").allInnerTexts();
  check("Resumen · anuncio, pregunta, siguiente paso y actividad reciente",
    ["Anuncio consultado", "Lo que preguntó", "Siguiente paso", "Actividad reciente"].every((x) => summaryPanels.some((h) => h.trim().toLowerCase() === x.toLowerCase())),
    summaryPanels.join(" | "));
  check("Resumen · «Ver anuncio original» y «Abrir conversación en Idealista» son enlaces distintos",
    /\/inmueble\/900210\//.test((await page.getByRole("link", { name: /Ver anuncio original/ }).getAttribute("href")) ?? "")
      && /idealista\.com\/inbox\//.test((await page.getByRole("link", { name: /Abrir conversación en Idealista/ }).getAttribute("href")) ?? ""));
  check("Resumen · «Registrar contacto» principal, «Abrir Zinto» y «Llamar» secundarias",
    (await page.locator("[data-crm-panel]", { hasText: "Siguiente paso" }).getByRole("button", { name: "Registrar contacto" }).count()) === 1
      && (await page.locator("[data-crm-panel]", { hasText: "Siguiente paso" }).getByRole("button", { name: "Abrir Zinto" }).count()) === 1
      && (await page.locator("[data-crm-panel]", { hasText: "Siguiente paso" }).getByRole("link", { name: "Llamar" }).count()) === 1);
  await page.getByRole("button", { name: "Ver actividad" }).click();
  check("Resumen · «Ver actividad» lleva a la pestaña Actividad", (await page.getByRole("tab", { name: "Actividad", selected: true }).count()) === 1);

  // Actividad: historial bajo demanda, seguimiento y nota.
  const history = page.locator("[data-crm-panel]", { hasText: "Historial de la solicitud" });
  const before = await history.locator("li").count();
  await history.getByRole("button", { name: /Ver historial completo/ }).click();
  const after = await history.locator("li").count();
  check("Actividad · cuatro eventos a la vista y el historial completo bajo demanda", before === 4 && after > before, `${before} → ${after}`);
  check("Actividad · próximo seguimiento con fecha, hora y acción", (await page.getByText("Confirmar disponibilidad para la visita del jueves").count()) > 0
    && (await page.getByRole("button", { name: "Editar" }).count()) === 1 && (await page.getByRole("button", { name: "Marcar como hecho" }).count()) === 1);
  await page.getByRole("button", { name: "Editar" }).click();
  check("Actividad · «Editar» abre fecha, hora y acción", (await page.getByLabel("Hora").count()) === 1 && (await page.getByRole("button", { name: "Guardar seguimiento" }).count()) === 1);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Marcar como hecho" }).click();
  const dlg = page.getByRole("dialog", { name: "Registrar contacto" });
  check("Actividad · «Marcar como hecho» usa «Registrar contacto» con la tarea ya marcada",
    (await dlg.isVisible()) && (await dlg.getByRole("checkbox", { name: /Marcar como hecha la tarea pendiente/ }).isChecked()));
  await page.keyboard.press("Escape");
  check("Actividad · «Añadir nota» con su botón", (await page.getByRole("button", { name: "Guardar nota" }).count()) === 1);

  // Dos teléfonos distintos: cada acción usa el suyo y los dos persisten.
  const actions: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) actions.push(r.postData() ?? "");
  });
  await page.goto(lead(2), { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Cliente y datos" }).click();
  const zIn = page.getByLabel("WhatsApp · Zinto");
  const cIn = page.getByLabel("Llamadas");
  check("Contacto · sin configurar, los dos campos empiezan con el teléfono recibido",
    (await zIn.inputValue()) === "+34 600 102 202" && (await cIn.inputValue()) === "+34 600 102 202");
  await zIn.fill("+34 611 111 111");
  await cIn.fill("+34 622 222 222");
  await page.getByRole("button", { name: "Guardar teléfonos" }).click();
  await page.getByText("Teléfonos guardados.").waitFor({ timeout: 8000 }).catch(() => {});
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Cliente y datos" }).click();
  check("Contacto · los dos teléfonos persisten tras recargar",
    (await page.getByLabel("WhatsApp · Zinto").inputValue()) === "+34 611 111 111" && (await page.getByLabel("Llamadas").inputValue()) === "+34 622 222 222");
  check("Contacto · el teléfono recibido se conserva como evidencia", (await page.getByText(/Recibido de Idealista: \+34 600 102 202/).count()) === 1);
  const callHrefs = await page.getByRole("link", { name: "Llamar" }).evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  await page.getByRole("tab", { name: "Resumen" }).click();
  callHrefs.push(...(await page.getByRole("link", { name: "Llamar" }).evaluateAll((els) => els.map((e) => e.getAttribute("href")))));
  check("Contacto · «Llamar» usa el número de llamadas en toda la ficha", callHrefs.length >= 2 && callHrefs.every((h) => h === "tel:+34622222222"), callHrefs.join(", "));
  actions.length = 0;
  await page.locator("[data-crm-panel]", { hasText: "Siguiente paso" }).getByRole("button", { name: "Abrir Zinto" }).click();
  await page.waitForTimeout(1500);
  check("Contacto · «Abrir Zinto» usa el número de WhatsApp", actions.some((b) => b.includes("+34 611 111 111")) && !actions.some((b) => b.includes("+34 622 222 222")));
  await page.goto(lead(2), { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Actividad" }).click();
  const hist2 = page.locator("[data-crm-panel]", { hasText: "Historial de la solicitud" });
  check("Contacto · el cambio de teléfonos queda en el historial; abrir Zinto no registra contacto",
    (await hist2.getByText("Teléfonos actualizados").count()) === 1 && (await hist2.getByText(/^(Llamada|WhatsApp|Email)$/).count()) === 0);
  // Validación en el servidor: un número imposible no se guarda.
  await page.getByRole("tab", { name: "Cliente y datos" }).click();
  await page.getByLabel("Llamadas").fill("12");
  await page.getByRole("button", { name: "Guardar teléfonos" }).click();
  await page.getByText(/entre 7 y 15 cifras/).waitFor({ timeout: 8000 }).catch(() => {});
  check("Contacto · el servidor rechaza un número imposible", (await page.getByText(/Llamadas: el número debe tener entre 7 y 15 cifras/).count()) === 1);

  // Solicitud antigua (descartada hace semanas): los campos con su teléfono.
  await page.goto(lead(12), { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Cliente y datos" }).click();
  check("Antigua · los campos empiezan con el teléfono de siempre",
    (await page.getByLabel("WhatsApp · Zinto").inputValue()) === "+34 600 112 212" && (await page.getByLabel("Llamadas").inputValue()) === "+34 600 112 212");
  // Cliente vinculado: acceso a su ficha y correo.
  await page.goto(lead(8), { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Cliente y datos" }).click();
  check("Cliente vinculado · «Cliente vinculado», su ficha y su correo",
    (await page.locator("[data-crm-panel]", { hasText: "Cliente en el CRM" }).getByText("Cliente vinculado").count()) === 1
      && ((await page.getByRole("link", { name: /Abrir ficha del cliente/ }).getAttribute("href")) ?? "").endsWith(`/clientes/${CLIENT}`)
      && (await page.getByLabel("Correo electrónico").inputValue()) === "pedro@sim.invalid");
  await browser.close();
}

// ── Sin permiso de edición (agent_junior) ────────────────────────────────────
{
  const { browser, ctx } = await context(JUNIOR, false);
  const page = await ctx.newPage();
  watch(page, "lectura");
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(17)}`, { waitUntil: "networkidle" });
  check("Solo lectura · la ficha se abre", (await page.getByRole("heading", { name: "Laura Lectura" }).count()) === 1);
  check("Solo lectura · sin «Registrar contacto» ni asignación",
    (await page.getByRole("button", { name: /Registrar contacto|Asignar asesor|^Cambiar$/ }).count()) === 0);
  await page.getByRole("tab", { name: "Actividad" }).click();
  check("Solo lectura · seguimiento visible sin «Editar», «Marcar como hecho» ni nota",
    (await page.getByText("Llamar para concretar la visita").count()) > 0
      && (await page.getByRole("button", { name: /^(Editar|Marcar como hecho|Guardar nota)$/ }).count()) === 0);
  await page.getByRole("tab", { name: "Cliente y datos" }).click();
  check("Solo lectura · teléfonos sin editar ni guardar",
    (await page.getByLabel("WhatsApp · Zinto").getAttribute("readonly")) !== null
      && (await page.getByRole("button", { name: "Guardar teléfonos" }).count()) === 0
      && (await page.getByText("Solo lectura: no tienes permiso para editar esta solicitud.").count()) === 1);
  await shot(page, "21-ficha-solo-lectura");
  await browser.close();
}

// ── Asesor: no reparte ni reasigna ───────────────────────────────────────────
{
  const { browser, ctx } = await context(ADVISOR, false);
  const page = await ctx.newPage();
  watch(page, "asesor");
  await page.goto(`${BASE}/es/admin/reparto`, { waitUntil: "networkidle" });
  check("R02 · asesor: Reparto explica que es solo de administradores", (await page.getByText(/Solo un administrador puede ver y cambiar el reparto/).count()) === 1);
  check("R02 · asesor: sin tabla de reparto", (await page.getByRole("table").count()) === 0);
  await shot(page, "13-reparto-asesor");
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(1)}`, { waitUntil: "networkidle" });
  check("R02 · asesor: sin botón para cambiar responsable", (await page.getByRole("button", { name: /^Cambiar$|Reasignar cliente|Asignar asesor/ }).count()) === 0);
  check("R02 · asesor: se le explica por qué", (await page.getByText("Solo un administrador puede cambiarlo").count()) > 0);
  check("R02 · asesor: sin entrada de menú «Reparto comercial»", (await page.getByRole("link", { name: "Reparto comercial" }).count()) === 0);
  await shot(page, "14-ficha-asesor");
  await page.goto(`${BASE}/es/admin/clientes/${CLIENT}`, { waitUntil: "networkidle" });
  check("R02 · asesor: la ficha del cliente se carga (no es una redirección)", (await page.getByRole("heading", { name: "Pedro Ficticio" }).count()) > 0);
  check("R02 · asesor: en la ficha del cliente no puede reasignar", (await page.getByRole("button", { name: "Reasignar cliente" }).count()) === 0
    && (await page.locator("header select").count()) === 0);
  await browser.close();
}

// ── Móvil 390 ────────────────────────────────────────────────────────────────
{
  const { browser, ctx } = await context(OWNER, true);
  const page = await ctx.newPage();
  watch(page, "movil");
  await page.goto(`${BASE}/es/admin/solicitudes?view=all`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Móvil · sin scroll horizontal en la bandeja", overflow <= 1, `${overflow}px`);
  await shot(page, "15-movil-tarjetas");
  // La 3 es de un anuncio retirado y ya no sale en «Todas»: se abre la 1.
  await page.locator(`[data-lead-id="${LEAD(1)}"]`).first().click();
  await page.waitForURL(/lead=/);
  await page.waitForLoadState("networkidle");
  // La ficha es una página propia (Figma A02/D01): «Volver a tarjetas».
  check("Móvil · ficha a pantalla completa con «volver»", (await page.getByRole("button", { name: /Volver a (tarjetas|por piso|prioridades)/ }).count()) > 0);
  // Zinto y «Registrar contacto» a mano también con cliente vinculado y en
  // una descartada.
  for (const [n, label] of [[8, "con cliente vinculado"], [12, "descartada"]] as const) {
    await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(n)}`, { waitUntil: "networkidle" });
    // La barra fija de abajo (D01), no el panel «Siguiente paso».
    const bar = page.locator("div.fixed.bottom-0");
    const zinto = bar.getByRole("button", { name: "Abrir Zinto" });
    const reg = bar.getByRole("button", { name: "Registrar contacto" });
    check(`Móvil · ${label}: «Abrir Zinto» en la barra fija`, (await zinto.count()) > 0 && (await zinto.first().isVisible()));
    check(`Móvil · ${label}: «Registrar contacto» en la barra fija`, (await reg.count()) > 0 && (await reg.first().isVisible()));
  }
  await shot(page, "16-movil-ficha");
  // Ficha en móvil: secciones apiladas, sin scroll lateral, pestañas a 48 px.
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(1)}`, { waitUntil: "networkidle" });
  for (const tab of ["Resumen", "Actividad", "Cliente y datos"]) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => {
      const panels = [...document.querySelectorAll("[data-crm-panel]")].filter((el) => (el as HTMLElement).offsetParent !== null);
      const xs = panels.map((el) => Math.round(el.getBoundingClientRect().left));
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, stacked: xs.length > 1 && xs.every((x) => x === xs[0]) };
    });
    const tabH = (await page.getByRole("tab", { name: tab }).boundingBox())?.height ?? 0;
    check(`Móvil · ficha «${tab}»: apilada, sin scroll lateral, pestaña cómoda`, m.overflow <= 1 && m.stacked && tabH >= 44, `${m.overflow}px, pestaña ${Math.round(tabH)}px`);
    await shot(page, `22-movil-ficha-${tab === "Cliente y datos" ? "cliente" : tab.toLowerCase()}`);
  }
  await page.goto(`${BASE}/es/admin/reparto`, { waitUntil: "networkidle" });
  const overflowR = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Móvil · Reparto sin scroll horizontal", overflowR <= 1, `${overflowR}px`);
  await shot(page, "17-movil-reparto");
  await browser.close();
}

check("Sin errores de consola ni de página", errors.length === 0, errors.slice(0, 5).join(" | "));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones en verde`);
process.exit(failed ? 1 : 0);
