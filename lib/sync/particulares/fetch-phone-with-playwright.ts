import "server-only";
import type { Browser, Page, Response } from "playwright";
import { normalizeSpanishPhone } from "./idealista-advertiser-detector";

export type PlaywrightPhoneResult = {
  phone: string | null;
  phoneConfidence: "high" | null;
  contactName: string | null;
  error?: string;
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PHONE_ENDPOINTS = [
  "/contact-phones",
  "/contact-phone-numbers",
  "adContactInfoForDetail",
  "adContactInfoForMobileDevices",
];

// Extrae la URL del reto DataDome (geo.captcha-delivery.com/captcha/?...) de la
// página bloqueada. CapSolver la necesita como `captchaUrl` para resolver el
// slider; sin ella no puede (pasarle la URL de la ficha no sirve). La buscamos
// en los iframes cargados y, si no, en el HTML renderizado.
async function extractDatadomeCaptchaUrl(page: Page): Promise<string | null> {
  try {
    for (const frame of page.frames()) {
      const url = frame.url();
      if (url && url.includes("geo.captcha-delivery.com")) return url;
    }
  } catch {
    // ignorar
  }
  try {
    const html = await page.content();
    const m = html.match(/https?:\/\/geo\.captcha-delivery\.com\/captcha\/[^"'\s<>]+/);
    if (m?.[0]) return m[0].replace(/&amp;/g, "&");
  } catch {
    // ignorar
  }
  return null;
}

function parsePhoneFromAjaxBody(text: string): { phone: string | null; contactName: string | null } {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;

    // {"phone1":{"number":"+34696165042","formatted":"696 16 50 42",...},"phone2":null}
    const p1 = json.phone1 as Record<string, string> | null | undefined;
    const p2 = json.phone2 as Record<string, string> | null | undefined;
    const nestedPhone = p1?.number ?? p1?.formatted ?? p2?.number ?? p2?.formatted ?? null;

    // Flat structures: {"phone":"6XXXXXXXX"} or {"phoneNumber":"..."} etc.
    const flatPhone =
      (json.phone as string | undefined) ??
      (json.phoneNumber as string | undefined) ??
      (json.formattedPhone as string | undefined) ??
      null;

    const contactName = (json.contactName as string | undefined) ?? null;

    return { phone: nestedPhone ?? flatPhone, contactName };
  } catch {
    return { phone: null, contactName: null };
  }
}

/**
 * Extracts the phone number from an Idealista listing using a real headless
 * browser (playwright-extra + stealth plugin). This is the fallback for
 * listings where the phone is hidden behind "Ver teléfono" and the curl-based
 * cookie-jar approach fails because DataDome requires JS challenge completion.
 *
 * Flow:
 * 1. Launch Chromium with stealth + residential proxy
 * 2. Intercept network responses to capture the /contact-phones AJAX call
 * 3. Navigate to the listing page (DataDome JS challenge runs automatically)
 * 4. Click "Ver teléfono" to trigger the AJAX call
 * 5. Return the phone from the intercepted AJAX response or DOM
 */
export async function fetchIdealistaPhoneViaPlaywright(
  adId: string,
  options?: { proxyUrl?: string },
): Promise<PlaywrightPhoneResult> {
  let browser: Browser | undefined;
  let page: Page | undefined;

  const pageUrl = `https://www.idealista.com/inmueble/${adId}/`;
  console.log(`[playwright-phone] Iniciando para adId=${adId}`);

  try {
    // Use playwright-extra + stealth plugin to reduce headless detection.
    // (rebrowser-playwright was removed — incompatible with Ubuntu 26.04 on the VPS.)
    let chromium: { launch: (...args: unknown[]) => Promise<unknown> };
    const { chromium: pwChromium } = await import("playwright-extra");
    const stealthMod = await import("puppeteer-extra-plugin-stealth");
    const stealth = (stealthMod as unknown as { default: () => unknown }).default();
    (pwChromium as unknown as { use: (p: unknown) => void }).use(stealth);
    chromium = pwChromium as unknown as typeof chromium;
    console.log(`[playwright-phone] Using playwright-extra + stealth`);

    // Sticky session: TODO el flujo de este adId (navegación del browser +
    // los reintentos de CapSolver más abajo) debe salir por la MISMA IP
    // residencial. El navegador abre varias conexiones al proxy durante la
    // carga (documento + XHR de "Ver teléfono"); sin anclar la sesión, cada
    // conexión puede salir por una IP distinta si el endpoint es rotativo, y
    // DataDome rechaza la cookie emitida para otra IP con bloqueo duro. Y si
    // CapSolver resolviera el reto usando una IP DISTINTA a la que navegó el
    // browser, el token tampoco sería válido para esa sesión.
    //
    // Preferimos la Extracción API (app_key) con `life` corto: es el
    // mecanismo de sticky OFICIAL del proveedor (pedir una IP y reutilizarla),
    // sin usuario/contraseña. Solo si no hay app_key configurado caemos al
    // gateway estático + modificador de username (withStickySession, sticky
    // no confirmado oficialmente para esta cuenta). El componente aleatorio
    // en el sessionId del fallback evita que un reintento tras fallo quede
    // anclado para siempre a una IP que ya quedó marcada por DataDome.
    let stickyProxyUrl: string | undefined;
    try {
      const { getFreshResidentialProxyUrl } = await import("@/lib/sync/proxy-config");
      // life=3: la sesión de Playwright (navegación + posible CapSolver) es
      // algo más larga que el flujo curl puro; un poco de margen extra.
      stickyProxyUrl = await getFreshResidentialProxyUrl(3);
    } catch {
      // seguimos al fallback
    }
    if (!stickyProxyUrl) {
      const rawProxyUrl = options?.proxyUrl ?? process.env.SMARTPROXY_URL;
      const residentialProxyUrl = process.env.SMARTPROXY_RESIDENTIAL_URL
        ?? (rawProxyUrl?.includes("smartproxy.net") && rawProxyUrl.includes("@") ? rawProxyUrl : undefined)
        ?? rawProxyUrl;
      if (residentialProxyUrl) {
        const { withStickySession } = await import("@/lib/sync/proxy-config");
        const sessionId = `${adId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        stickyProxyUrl = withStickySession(residentialProxyUrl, sessionId);
      }
    }

    let proxyConfig: { server: string; username?: string; password?: string } | undefined;
    if (stickyProxyUrl) {
      try {
        const u = new URL(stickyProxyUrl);
        proxyConfig = {
          server: `${u.protocol}//${u.host}`,
          username: decodeURIComponent(u.username) || undefined,
          password: decodeURIComponent(u.password) || undefined,
        };
        console.log(`[playwright-phone] Proxy: ${u.host} (${u.username.slice(0, 20)}...)`);
      } catch {
        console.log(`[playwright-phone] Proxy URL inválida, sin proxy`);
      }
    }

    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
      ],
      proxy: proxyConfig,
    }) as unknown as Browser;

    // Use newContext for proper UA + locale (playwright-extra newPage doesn't support UA directly)
    const ctx = await (browser as unknown as {
      newContext: (opts: unknown) => Promise<{ newPage: () => Promise<Page> }>;
    }).newContext({
      userAgent: BROWSER_UA,
      locale: "es-ES",
      extraHTTPHeaders: {
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Sec-Ch-Ua": '"Google Chrome";v="120", "Chromium";v="120", "Not=A?Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
    });
    page = await ctx.newPage();

    // Phone AJAX capture state
    let phoneFromAjax: string | null = null;
    let contactNameFromAjax: string | null = null;
    let ajaxCaptured = false;

    page.on("response", async (response: Response) => {
      const url = response.url();
      if (!PHONE_ENDPOINTS.some((p) => url.includes(p))) return;
      if (response.status() !== 200) return;

      try {
        const text = await response.text();
        console.log(`[playwright-phone] AJAX: ${url.split("/").slice(-2).join("/")} → ${text.slice(0, 150)}`);
        const { phone, contactName } = parsePhoneFromAjaxBody(text);
        phoneFromAjax = phone;
        contactNameFromAjax = contactName;
        ajaxCaptured = true;
      } catch {
        // ignore response read errors
      }
    });

    // Navigate — DataDome's JS challenge runs as part of page load.
    // Use networkidle to wait for DataDome's c.js fingerprint POST to complete
    // and for the page to redirect from the challenge page to the real listing.
    console.log(`[playwright-phone] Navigating (networkidle wait)...`);
    let pageBlocked = false;
    try {
      const resp = await page.goto(pageUrl, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      const status = resp?.status() ?? 0;
      console.log(`[playwright-phone] Page status: ${status}`);
      if (status === 403 || status === 429) {
        pageBlocked = true;
        console.log(`[playwright-phone] DataDome hard-blocked page load (${status})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[playwright-phone] goto: ${msg}`);
    }

    const title = await page.title().catch(() => "");
    console.log(`[playwright-phone] Page title: "${title.slice(0, 60)}"`);

    // If still on DataDome challenge page, wait extra time for redirect
    if (title === "idealista.com" || title === "") {
      console.log(`[playwright-phone] DataDome challenge page — waiting 8s for redirect...`);
      await page.waitForTimeout(8000);
      const newTitle = await page.title().catch(() => "");
      console.log(`[playwright-phone] Title after extra wait: "${newTitle.slice(0, 60)}"`);
      if (newTitle === "idealista.com" || newTitle === "") {
        pageBlocked = true;
        console.log(`[playwright-phone] DataDome CAPTCHA/block — fingerprint rejected`);
      }
    }

    if (pageBlocked) {
      // Try CapSolver to solve DataDome CAPTCHA
      console.log(`[playwright-phone] Attempting DataDome CAPTCHA solution via CapSolver...`);
      const { solveDatadomeWithCapSolver } = await import("./solve-datadome-with-capsolver");

      try {
        // Reutilizar la MISMA IP sticky que navegó el browser — CapSolver
        // debe resolver el reto desde la misma IP que verá la cookie aplicada,
        // si no, el token no será válido para esta sesión.
        const captchaUrl = (await extractDatadomeCaptchaUrl(page)) ?? pageUrl;
        console.log(`[playwright-phone] DataDome captchaUrl: ${captchaUrl.slice(0, 80)}`);
        const solverResult = await solveDatadomeWithCapSolver(captchaUrl, BROWSER_UA, {
          proxyUrl: stickyProxyUrl,
          websiteURL: pageUrl,
        });

        if (solverResult.token) {
          // Use token as cookie. DataDome typically uses "dd" or similar cookie name
          // CapSolver returns the raw token; we store it as a datadome cookie
          await page
            .context()
            .addCookies([
              {
                name: "datadome",
                value: solverResult.token,
                domain: ".idealista.com",
                path: "/",
                expires: Date.now() / 1000 + 3600, // 1 hour
              },
            ])
            .catch(() => {
              // If cookie fails, continue anyway
            });

          console.log(`[playwright-phone] CAPTCHA token applied, reloading page...`);
          // Reload with CAPTCHA token
          await page.reload({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
          const reloadTitle = await page.title().catch(() => "");
          console.log(`[playwright-phone] Title after reload: "${reloadTitle.slice(0, 60)}"`);

          // If page still blocked after token, give up
          if (reloadTitle === "idealista.com" || reloadTitle === "") {
            console.log(`[playwright-phone] Page still blocked after token, giving up`);
            return {
              phone: null,
              phoneConfidence: null,
              contactName: null,
              error: "DataDome CAPTCHA not resolved",
            };
          }

          // Page loaded, continue to extract phone
          pageBlocked = false;
        } else {
          console.log(
            `[playwright-phone] CapSolver failed: ${solverResult.error}, giving up`,
          );
          return {
            phone: null,
            phoneConfidence: null,
            contactName: null,
            error: `CapSolver failed: ${solverResult.error}`,
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[playwright-phone] CapSolver error: ${msg}`);
        return {
          phone: null,
          phoneConfidence: null,
          contactName: null,
          error: `CapSolver error: ${msg}`,
        };
      }

      // If pageBlocked still true after trying CapSolver, fail
      if (pageBlocked) {
        return {
          phone: null,
          phoneConfidence: null,
          contactName: null,
          error: "DataDome blocked page load",
        };
      }
    }

    // Short wait for any post-load JS
    await page.waitForTimeout(2000);

    // Try to click "Ver teléfono" button with multiple selectors
    const selectors = [
      "button:has-text('Ver teléfono')",
      "a:has-text('Ver teléfono')",
      "span:has-text('Ver teléfono')",
      ".contact-method-telephone__call",
      "#btn-contact-phone",
      "[data-site-section*='phone']",
      "[data-ua-click*='phone']",
      "[data-ua-track*='phone']",
    ];

    let clicked = false;
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        const visible = await el.isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) {
          await el.click({ timeout: 5000 });
          clicked = true;
          console.log(`[playwright-phone] Clicked: ${sel}`);
          break;
        }
      } catch {
        // try next selector
      }
    }

    if (!clicked) {
      console.log(`[playwright-phone] No 'Ver teléfono' button found — checking static content`);
    }

    // Wait up to 10s for the AJAX response to arrive
    for (let i = 0; i < 20 && !ajaxCaptured; i++) {
      await page.waitForTimeout(500);
    }

    // If AJAX was blocked by DataDome (even after clicking), attempt CapSolver
    if (!phoneFromAjax && !clicked) {
      console.log(`[playwright-phone] AJAX blocked or not available. Attempting CapSolver to resolve CAPTCHA...`);
      const { solveDatadomeWithCapSolver } = await import("./solve-datadome-with-capsolver");

      try {
        // Misma IP sticky que el resto del flujo (ver comentario más arriba).
        const captchaUrl = (await extractDatadomeCaptchaUrl(page)) ?? pageUrl;
        const solverResult = await solveDatadomeWithCapSolver(captchaUrl, BROWSER_UA, {
          proxyUrl: stickyProxyUrl,
          websiteURL: pageUrl,
        });

        if (solverResult.token) {
          console.log(`[playwright-phone] CAPTCHA solved, applying token and retrying AJAX...`);
          await page
            .context()
            .addCookies([
              {
                name: "datadome",
                value: solverResult.token,
                domain: ".idealista.com",
                path: "/",
                expires: Date.now() / 1000 + 3600,
              },
            ])
            .catch(() => {});

          // Reload to apply cookie
          await page.reload({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});

          // Reset AJAX capture and try clicking again
          phoneFromAjax = null;
          ajaxCaptured = false;

          for (const sel of selectors) {
            try {
              const el = page.locator(sel).first();
              const visible = await el.isVisible({ timeout: 2000 }).catch(() => false);
              if (visible) {
                await el.click({ timeout: 5000 });
                console.log(`[playwright-phone] Clicked after CapSolver: ${sel}`);
                break;
              }
            } catch {}
          }

          // Wait for AJAX after CapSolver
          for (let i = 0; i < 20 && !ajaxCaptured; i++) {
            await page.waitForTimeout(500);
          }
        } else {
          console.log(`[playwright-phone] CapSolver failed: ${solverResult.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[playwright-phone] CapSolver fallback error: ${msg}`);
      }
    }

    // DOM fallback: check if phone was injected into the page after clicking
    if (!phoneFromAjax) {
      const domPhone = await page.evaluate(() => {
        // 1. appcallback_target_phone attribute (Idealista sets this after AJAX)
        const el = document.querySelector("[appcallback_target_phone]");
        if (el) {
          const v = el.getAttribute("appcallback_target_phone");
          if (v && /^\d{9}$/.test(v)) return v;
        }
        // 2. tel: links with real phone numbers (anywhere, not just contact-phones-container)
        const telLinks = document.querySelectorAll("a[href^='tel:']");
        for (const link of telLinks) {
          const href = link.getAttribute("href") ?? "";
          const num = href.replace("tel:", "").trim();
          if (/^[+\d][\d\s\-]{8,}$/.test(num)) {
            // Prefer visible links, but accept any valid phone
            return num;
          }
        }
        // 3. hidden-contact-phones class or other hidden phone elements
        const hiddenPhoneSelectors = [
          ".hidden-contact-phones-formatted-phone",
          "[class*='contact-phone']",
          "[class*='phone-link']",
          "[data-phone]",
          "[data-contact-phone]",
        ];
        for (const sel of hiddenPhoneSelectors) {
          const hiddenPhone = document.querySelector(sel);
          if (hiddenPhone) {
            const href = hiddenPhone.getAttribute("href") ?? "";
            const dataPhone = hiddenPhone.getAttribute("data-phone") ?? hiddenPhone.getAttribute("data-contact-phone") ?? "";
            const num = (href.replace("tel:", "").trim() || dataPhone).trim();
            if (num && /^[+\d][\d\s\-]{6,}$/.test(num)) return num;
          }
        }
        // 4. WhatsApp links (wa.me with embedded phone)
        const waLink = document.querySelector("a[href*='wa.me']");
        if (waLink) {
          const href = waLink.getAttribute("href") ?? "";
          const waMatch = href.match(/wa\.me\/(?:34)?([6789]\d{8})/);
          if (waMatch?.[1]) return waMatch[1];
        }
        // 5. Visible text patterns in contact section
        const contactSection = document.getElementById("contact-phones-container") ||
                               document.querySelector("[class*='contact']") ||
                               document.body;
        const text = contactSection?.innerText ?? "";
        const phoneMatch = text.match(/(?:Llamar|Tel|Teléfono)[\s:]*([+\d][\d\s\-()]{8,})/i);
        if (phoneMatch?.[1]) {
          const num = phoneMatch[1].replace(/\D/g, "");
          if (/^[34679]\d{8,}$/.test(num)) return num;
        }
        return null;
      }).catch(() => null);

      if (domPhone) {
        phoneFromAjax = domPhone as string;
        console.log(`[playwright-phone] Phone from DOM: ${phoneFromAjax}`);
      }
    }

    let normalizedPhone = normalizeSpanishPhone(phoneFromAjax);

    // Final fallback: search the entire rendered HTML (after JS execution)
    // If the phone is visible anywhere in the UI, it's in page.content()
    if (!normalizedPhone) {
      try {
        const fullHtml = await page.content();
        // Import the HTML extraction from the main detector
        const { extractPhoneWithConfidence } = await import("./idealista-advertiser-detector");
        const extracted = extractPhoneWithConfidence(fullHtml);
        if (extracted.phone) {
          normalizedPhone = extracted.phone;
          phoneFromAjax = extracted.phone;
          console.log(`[playwright-phone] Phone from full HTML content: ${normalizedPhone} (conf=${extracted.confidence})`);
        }
      } catch (err) {
        console.log(`[playwright-phone] Full HTML search failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log(`[playwright-phone] ${normalizedPhone ? `✓ ${normalizedPhone}` : "✗ sin teléfono"}`);

    return {
      phone: normalizedPhone,
      phoneConfidence: normalizedPhone ? "high" : null,
      contactName: contactNameFromAjax,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isNoChrome =
      errorMsg.includes("Executable doesn't exist") ||
      errorMsg.includes("Cannot find Chromium") ||
      errorMsg.includes("browserType.launch");
    console.error(
      isNoChrome
        ? `[playwright-phone] Chromium no instalado (playwright install chromium)`
        : `[playwright-phone] Error: ${errorMsg}`,
    );
    return {
      phone: null,
      phoneConfidence: null,
      contactName: null,
      error: isNoChrome ? "Chromium not installed" : errorMsg,
    };
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}
