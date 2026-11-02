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
  // El texto de orden dice el orden que de verdad se aplica.
  const orderText = async (q: string) => {
    await page.goto(`${BASE}/es/admin/solicitudes?${q}`, { waitUntil: "networkidle" });
    return page.getByText(/Primero /).first().textContent();
  };
  check("Orden · «Todas» sin elegir: más recientes", /más recientes/.test((await orderText("view=all")) ?? ""));
  check("Orden · «Más antiguas» elegido: el texto lo dice", /más antiguas/.test((await orderText("view=all&sort=oldest")) ?? ""));
  check("Orden · cola de atención: pendientes de atención", /pendientes de atención/.test((await orderText("")) ?? ""));
  check("Orden · «Última actividad» en la cola de atención", /actividad más reciente/.test((await orderText("sort=activity")) ?? ""));
  // Solicitud con cliente vinculado (cuenta como «converted»): se sigue
  // pudiendo registrar el contacto.
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(8)}`, { waitUntil: "networkidle" });
  check("Ficha con cliente vinculado · «Registrar contacto» disponible", (await page.getByRole("button", { name: "Registrar contacto" }).count()) > 0);
  await page.goto(`${BASE}/es/admin/solicitudes?view=all`, { waitUntil: "networkidle" });
  check("A · pendiente de reparto visible", (await page.getByText("Pendiente de reparto").count()) > 0);
  await shot(page, "01-tarjetas-escritorio");

  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(1)}`, { waitUntil: "networkidle" });
  check("Ficha · responsable y origen", (await page.getByText("Reparto automático por inmueble").count()) > 0);
  check("Ficha · Zinto separado del responsable", (await page.getByText("Zinto: pendiente").count()) > 0);
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
  check("Ficha · evidencia del origen", (await page.getByText("Evidencia del origen").count()) > 0);
  await shot(page, "05-ficha-cliente-datos");

  // Republicación: la consulta conserva su código anterior y la ficha lo dice.
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(4)}`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Cliente y datos/ }).click();
  check("Evidencia · consulta por una publicación anterior del anuncio", (await page.getByText(/Publicación anterior: el anuncio se republicó con el código 900210/).count()) === 1);
  await shot(page, "05b-publicacion-anterior");
  // Caso 3 de Codex: código desconocido con otro anuncio guardado → sin «Publicación anterior».
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(13)}`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Cliente y datos/ }).click();
  check("Evidencia · «Cod.» desconocido con otro anuncio guardado: sin «Publicación anterior»", (await page.getByText(/Publicación anterior/).count()) === 0
    && (await page.getByText("900777").count()) > 0);

  // Asignar una pendiente (sin cliente)
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(2)}`, { waitUntil: "networkidle" });
  check("Ficha pendiente · motivo del reparto", (await page.getByText(/ese piso no tiene asesor asignado/).count()) > 0);
  await page.getByRole("button", { name: "Cambiar" }).click();
  check("Asignar · diálogo para administradora", await page.getByRole("dialog", { name: "Asignar solicitud" }).isVisible());
  await shot(page, "06-asignar-solicitud");
  await page.keyboard.press("Escape");

  // Reasignar cliente (con cliente vinculado y conflicto)
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(8)}`, { waitUntil: "networkidle" });
  check("Conflicto de responsable visible", (await page.getByText("Dos responsables posibles").count()) > 0);
  await page.getByRole("button", { name: "Reasignar cliente" }).click();
  await page.getByText("Qué se traslada").waitFor({ timeout: 5000 }).catch(() => {});
  check("Reasignar cliente · alcance antes de confirmar", (await page.getByText(/solicitudes abiertas/i).count()) > 0);
  await shot(page, "07-reasignar-cliente");
  await page.keyboard.press("Escape");

  // Vínculo por verificar: no se ofrece preparar visita
  await page.goto(`${BASE}/es/admin/solicitudes?view=all&lead=${LEAD(5)}`, { waitUntil: "networkidle" });
  check("Vínculo sin verificar · visita bloqueada", (await page.getByText("Para preparar una visita, confirma antes el anuncio.").count()) > 0);
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
  check("R02 · asesor: sin botón para cambiar responsable", (await page.getByRole("button", { name: /^Cambiar$|Reasignar cliente/ }).count()) === 0);
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
  await page.locator(`[data-lead-id="${LEAD(3)}"]`).first().click();
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
