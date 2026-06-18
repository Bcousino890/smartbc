#!/usr/bin/env node
// Test directo de extracción de teléfono — corre en el VPS sin necesitar sesión web.
// Uso: node scripts/test-phone-vps.mjs [adId]
// Ejemplo: node scripts/test-phone-vps.mjs 111741746

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const adId = process.argv[2] ?? "111741746";
const pageUrl = `https://www.idealista.com/inmueble/${adId}/`;

// WhatsApp UA bypasses DataDome entirely (no challenge, no cookie needed).
// Browser UA gets blocked by DataDome when using datacenter IPs (Hetzner).
// Strategy: use WhatsApp UA for page load AND for AJAX calls.
// The DataDome pre-auth path is only viable with true residential IPs.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const WHATSAPP_UA = "WhatsApp/2.23.20.0";

console.log(`\n🔍 Test de extracción de teléfono — adId=${adId}`);
console.log("═".repeat(60));

// 1. Obtener IP fresca de Smartproxy
console.log("\n📡 Step 1: Obteniendo IP fresca de Smartproxy...");
let proxyUrl = null;
try {
  const { stdout } = await execFileAsync("curl", [
    "-s",
    "https://www.smartproxy.org/web_v1/ip/get-ip-v3?app_key=9cf8f476185ea51d90a811dfedf19974&pt=9&num=20&cc=ES&life=30&format=json&protocol=1",
    "--max-time", "10"
  ]);
  const data = JSON.parse(stdout);
  const list = data?.data?.list ?? [];
  if (list.length > 0) {
    const choice = list[Math.floor(Math.random() * list.length)];
    const [ip, port] = choice.split(":");
    proxyUrl = `http://${ip}:${port}`;
    console.log(`✅ IP obtenida: ${ip}:${port} (pool: ${list.length} IPs)`);
  } else {
    console.log(`⚠️  Sin IPs disponibles, sin proxy`);
  }
} catch (e) {
  console.log(`❌ Error Smartproxy: ${e.message}`);
}

// 2. Cargar página con WhatsApp UA (bypasea DataDome sin necesitar cookie).
// Browser UA se bloquea desde IPs de datacenter (Hetzner) que devuelve la API.
console.log(`\n🌐 Step 2: Cargando página con WhatsApp UA + proxy...`);
const dir = await mkdtemp(join(tmpdir(), "idealista-test-"));
const jar = join(dir, "cookies.txt");
const htmlFile = join(dir, "page.html");
const proxyArgs = proxyUrl ? ["--proxytunnel", "-x", proxyUrl] : [];

// Try WhatsApp UA first (reliable), fall back to Browser UA without proxy
let pageHtml = "";
try {
  await execFileAsync("curl", [
    "-sS", "-L", "-A", WHATSAPP_UA,
    "--max-time", "20",
    "-c", jar, "-o", htmlFile,
    ...proxyArgs,
    pageUrl
  ], { maxBuffer: 20 * 1024 * 1024 });
  pageHtml = await readFile(htmlFile, "utf8").catch(() => "");
  console.log(`📄 WhatsApp UA: ${pageHtml.length} chars`);
} catch (e) {
  console.log(`⚠️  curl page load warning: ${e.message}`);
}

if (pageHtml.length < 1000) {
  console.log("⚠️  WhatsApp UA falló, probando Browser UA sin proxy...");
  try {
    await execFileAsync("curl", [
      "-sS", "-L", "-A", BROWSER_UA,
      "--max-time", "20",
      "-c", jar, "-o", htmlFile,
      pageUrl
    ], { maxBuffer: 20 * 1024 * 1024 });
    pageHtml = await readFile(htmlFile, "utf8").catch(() => "");
    console.log(`📄 Browser UA sin proxy: ${pageHtml.length} chars`);
  } catch (e) {
    console.log(`⚠️  curl fallback warning: ${e.message}`);
  }
}

if (pageHtml.length < 1000) {
  console.log("❌ HTML demasiado corto — bloqueo total");
  process.exit(1);
}

// 3. Buscar teléfono directamente en HTML
console.log(`\n📞 Step 3: Buscando teléfono en HTML...`);
const phonePatterns = [
  /appcallback_target_phone="(\d{9,})"/,
  /hidden-contact-phones-formatted-phone[^>]*href=["']tel:([+\d][\d\s\-]{6,})["']/,
  /href=["']tel:([+\d][\d\s\-]{6,})["']/,
  /"type"\s*:\s*"PHONE"[^}]{0,80}"number"\s*:\s*"([+\d][\d\s\-]{6,18})"/s,
  /"phone"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
  /"phoneNumberForMobileDialing"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
];
let phoneInHtml = null;
for (const p of phonePatterns) {
  const m = pageHtml.match(p);
  if (m?.[1]) {
    const raw = m[1].replace(/[\s\-()]/g, "");
    if (/^[+]?34[6789]\d{8}$|^[6789]\d{8}$/.test(raw)) {
      phoneInHtml = raw.startsWith("+34") ? raw : raw.startsWith("34") ? `+${raw}` : `+34${raw}`;
      console.log(`✅ Teléfono en HTML: ${phoneInHtml} (patrón: ${p.toString().slice(0,40)}...)`);
      break;
    }
  }
}
if (!phoneInHtml) console.log("⚠️  Sin teléfono en HTML — necesita AJAX");

// 4. Extraer DataDome auth code
console.log(`\n🔑 Step 4: Buscando DataDome auth code...`);
let ddAuth = pageHtml.match(/dd\.idealista\.com\/tags\.js\?[^"']*auth=([A-Za-z0-9_-]{10,})/)?.[1]
  ?? pageHtml.match(/"auth"\s*:\s*"([A-Za-z0-9_-]{10,})"/)?.[1]
  ?? pageHtml.match(/[?&]auth=([A-Za-z0-9_-]{10,})/)?.[1];

if (ddAuth) {
  console.log(`✅ DataDome auth: ${ddAuth.slice(0, 20)}...`);
} else {
  console.log("❌ DataDome auth NO encontrado — WhatsApp UA bypasses DataDome (sin script inyectado)");
  console.log("   → Esto es normal: DataDome no inyecta JS con WhatsApp UA");
  console.log("   → Pero con Browser UA sí debería aparecer");
  const hasDDScript = pageHtml.includes("dd.idealista.com");
  console.log(`   → dd.idealista.com en HTML: ${hasDDScript ? "SÍ" : "NO"}`);
}

// 5. Probar endpoints AJAX con cookie jar (WhatsApp UA, mismo que cargó la página)
console.log(`\n🔄 Step 5: Probando endpoints AJAX con cookie jar (WhatsApp UA)...`);
const endpoints = [
  `https://www.idealista.com/es/ajax/ads/${adId}/contact-phone-numbers`,
  `https://www.idealista.com/es/ajax/ads/${adId}/contact-phones`,
  `https://www.idealista.com/es/ajax/ads/${adId}/contact`,
  `https://www.idealista.com/ajax/listingController/adContactInfoForMobileDevices.ajax?adId=${adId}`,
  `https://www.idealista.com/ajax/listingController/adContactInfoForDetail.ajax?adId=${adId}`,
];

async function tryAjax(endpoint, useProxy) {
  const args = [
    "-sS", "-L", "-A", WHATSAPP_UA,
    "--max-time", "15",
    "-b", jar, "-c", jar,
    "-w", "\n__CODE__:%{http_code}",
    "-H", "X-Requested-With: XMLHttpRequest",
    "-H", "Accept: application/json, */*; q=0.01",
    "-H", `Referer: ${pageUrl}`,
  ];
  if (useProxy) args.push(...proxyArgs);
  args.push(endpoint);
  const { stdout } = await execFileAsync("curl", args, { maxBuffer: 2 * 1024 * 1024 });
  const codeMatch = stdout.match(/\n__CODE__:(\d+)$/);
  const code = codeMatch ? parseInt(codeMatch[1]) : 0;
  const body = codeMatch ? stdout.slice(0, stdout.lastIndexOf("\n__CODE__:")) : stdout;
  return { code, body };
}

let ajaxPhone = null;
for (const endpoint of endpoints) {
  try {
    const name = endpoint.split("/").slice(-1)[0].split("?")[0];
    // Try with proxy first, then without if 403/blocked
    let { code, body } = await tryAjax(endpoint, !!proxyUrl);
    console.log(`   [proxy=${!!proxyUrl}] ${name}: HTTP ${code} | ${body.slice(0, 150)}`);

    if ((code === 403 || code === 0) && proxyUrl) {
      // Retry without proxy — Hetzner IPs might be blocked for AJAX too
      const r2 = await tryAjax(endpoint, false);
      console.log(`   [no-proxy]          ${name}: HTTP ${r2.code} | ${r2.body.slice(0, 150)}`);
      if (r2.code === 200) { code = r2.code; body = r2.body; }
    }

    if (code === 200 && body.length > 2) {
      const pm = body.match(/"(?:phoneNumberForMobileDialing|formattedPhone|number|phone|contactPhone)"\s*:\s*"([+\d][\d\s\-]{6,18})"/)
        ?? body.match(/([6789]\d{8})/);
      if (pm?.[1]) {
        ajaxPhone = pm[1].trim();
        console.log(`   ✅ TELÉFONO VÍA AJAX: ${ajaxPhone}`);
        break;
      } else {
        console.log(`   ⚠️  HTTP 200 pero sin teléfono en respuesta`);
      }
    }
  } catch (e) {
    console.log(`   ERROR: ${e.message.slice(0, 80)}`);
  }
}

// Resumen
await rm(dir, { recursive: true, force: true }).catch(() => {});
console.log("\n" + "═".repeat(60));
console.log("📊 RESUMEN:");
console.log(`   Proxy usado: ${proxyUrl ?? "ninguno"}`);
console.log(`   Teléfono en HTML: ${phoneInHtml ?? "NO"}`);
console.log(`   DataDome auth: ${ddAuth ? "SÍ" : "NO"}`);
console.log(`   Teléfono vía AJAX: ${ajaxPhone ?? "NO"}`);
console.log(`   Teléfono correcto esperado: +34696165042`);
const found = phoneInHtml || ajaxPhone;
console.log(found ? `\n✅ ÉXITO: ${found}` : "\n❌ FALLO: No se obtuvo teléfono");
