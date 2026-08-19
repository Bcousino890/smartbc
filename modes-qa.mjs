// Recorrido del brief: revisar de una en una → prioridades → resumen → enviar.
import { chromium } from "playwright";
import { execSync } from "child_process";
const SL="7792617f-1886-4148-b3dd-dffeef6a363c";
const sql=q=>execSync(`echo ${Buffer.from(q).toString("base64")} | ssh -o ConnectTimeout=15 root@178.105.185.125 "base64 -d | docker exec -i supabase-db psql -U postgres -d postgres -A -t"`).toString().trim();
const issues=[]; const bad=m=>issues.push(m); const ok=m=>console.log("  ✅ "+m);
sql(`UPDATE client_shortlist_items SET decision='undecided', rank=NULL WHERE shortlist_id='${SL}';
     UPDATE client_shortlists SET status='reviewing', submitted_at=NULL, revision=0 WHERE id='${SL}';`);

const b = await chromium.launch();
for (const [w,h,tag] of [[390,844,"movil"],[1440,900,"escritorio"]]) {
  const p = await (await b.newContext({viewport:{width:w,height:h},isMobile:w<500,hasTouch:w<500})).newPage();
  p.on("pageerror", e => bad(`${tag}: ${e.message}`));
  await p.goto("http://localhost:8099/s/qa7paulshortlist", { waitUntil:"networkidle" });
  await p.waitForTimeout(1800);

  // 1 · Abre en REVISAR con UNA sola residencia
  const stages = await p.locator("section[aria-label]").count();
  const heroes = await p.locator("section[aria-label] h2").count();
  if (heroes !== 1) bad(`${tag}: se ven ${heroes} residencias, debería ser una`);
  else ok(`${tag}: abre en revisar con una sola residencia`);

  // 2 · Cabe en el viewport (el objetivo del sprint)
  const fits = await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight * 1.6);
  if (!fits) {
    const hh = await p.evaluate(()=>document.documentElement.scrollHeight);
    bad(`${tag}: la composición ocupa ${hh}px (más de 1,6 pantallas)`);
  } else ok(`${tag}: la residencia cabe sin scroll infinito`);

  // 3 · Contador «revisar» = pendientes
  const nav = await p.locator("nav").first().innerText();
  if (!/29|28/.test(nav.replace(/\s/g,""))) bad(`${tag}: la barra no cuenta pendientes → ${nav.replace(/\n/g,' ')}`);
  else ok(`${tag}: la barra cuenta lo que falta por revisar`);

  // 4 · Decidir avanza sola
  const t1 = await p.locator("section[aria-label] h2").first().textContent();
  await p.getByRole("button", { name:/Quiero visitarla|I want to visit/i }).first().click();
  await p.waitForTimeout(1600);
  const t2 = await p.locator("section[aria-label] h2").first().textContent();
  if (t1 === t2) bad(`${tag}: al decidir no pasó a la siguiente`);
  else ok(`${tag}: al decidir pasa sola a la siguiente pendiente`);

  // 5 · Recorrer sin decidir no asigna nada
  const decididasAntes = Number(sql(`SELECT count(*) FROM client_shortlist_items WHERE shortlist_id='${SL}' AND decision<>'undecided';`));
  await p.getByRole("button", { name:/Siguiente|Next/i }).last().click();
  await p.waitForTimeout(900);
  const decididasDespues = Number(sql(`SELECT count(*) FROM client_shortlist_items WHERE shortlist_id='${SL}' AND decision<>'undecided';`));
  if (decididasDespues !== decididasAntes) bad(`${tag}: pasar de largo asignó un estado`);
  else ok(`${tag}: pasar de largo no asigna estado`);

  // 6 · Modo prioridades: lista compacta
  await p.locator("nav").getByRole("button", { name:/Prioridades|Priorities/i }).click();
  await p.waitForTimeout(1000);
  const rowH = await p.evaluate(() => {
    const a = document.querySelector("article");
    return a ? Math.round(a.getBoundingClientRect().height) : null;
  });
  if (!rowH) bad(`${tag}: prioridades vacío`);
  else if (rowH > 140) bad(`${tag}: la fila no es compacta (${rowH}px)`);
  else ok(`${tag}: prioridades en filas compactas (${rowH}px)`);

  // 7 · Resumen
  await p.locator("nav").getByRole("button", { name:/Resumen|Summary/i }).click();
  await p.waitForTimeout(800);
  if (!/Tu selección|Your selection/i.test(await p.locator("main").innerText()))
    bad(`${tag}: el resumen no aparece`);
  else ok(`${tag}: el resumen muestra la selección`);

  // 8 · Enviar con pendientes pregunta
  await p.getByRole("button", { name:/Enviar mis prioridades|Send my priorities/i }).click();
  await p.waitForTimeout(900);
  const asks = await p.locator("[role=dialog]").count();
  if (!asks) bad(`${tag}: envía sin preguntar habiendo pendientes`);
  else ok(`${tag}: con pendientes pregunta antes de enviar`);
  await p.keyboard.press("Escape").catch(()=>{});

  await p.screenshot({ path:`/tmp/shortlist/modes-${tag}.png` });
  await p.close();
}
sql(`UPDATE client_shortlist_items SET decision='undecided', rank=NULL WHERE shortlist_id='${SL}';
     UPDATE client_shortlists SET revision=0, client_updated_at=NULL, first_opened_at=NULL WHERE id='${SL}';`);
console.log(issues.length?"\nPROBLEMAS:\n- "+issues.join("\n- "):"\nTRES MODOS OK ✅");
await b.close(); process.exit(issues.length?1:0);
