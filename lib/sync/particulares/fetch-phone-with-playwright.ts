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
    // playwright-extra + stealth: patches navigator.webdriver, canvas, WebGL,
    // plugins, chrome.runtime, etc. to pass DataDome's headless detection.
    const { chromium } = await import("playwright-extra");
    const stealthMod = await import("puppeteer-extra-plugin-stealth");
    const stealth = (stealthMod as unknown as { default: () => unknown }).default();
    (chromium as unknown as { use: (p: unknown) => void }).use(stealth);

    const proxyUrl = options?.proxyUrl ?? process.env.SMARTPROXY_URL;
    let proxyConfig: { server: string; username?: string; password?: string } | undefined;
    if (proxyUrl) {
      try {
        const u = new URL(proxyUrl);
        proxyConfig = {
          server: `${u.protocol}//${u.host}`,
          username: decodeURIComponent(u.username) || undefined,
          password: decodeURIComponent(u.password) || undefined,
        };
        console.log(`[playwright-phone] Proxy: ${u.host}`);
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
      ],
      proxy: proxyConfig,
    }) as unknown as Browser;

    page = await (browser as unknown as { newPage: (opts: unknown) => Promise<Page> }).newPage({
      userAgent: BROWSER_UA,
    });

    await page.setExtraHTTPHeaders({
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    });

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

    // Navigate — DataDome's JS challenge runs as part of page load
    console.log(`[playwright-phone] Navigating...`);
    let pageBlocked = false;
    try {
      const resp = await page.goto(pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      const status = resp?.status() ?? 0;
      console.log(`[playwright-phone] Page status: ${status}`);
      if (status === 403 || status === 429) {
        pageBlocked = true;
        console.log(`[playwright-phone] DataDome blocked page load (${status})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Timeout on domcontentloaded can happen — not necessarily a failure
      console.log(`[playwright-phone] goto: ${msg}`);
    }

    if (pageBlocked) {
      return {
        phone: null,
        phoneConfidence: null,
        contactName: null,
        error: "DataDome blocked page load",
      };
    }

    // Allow DataDome challenge to complete (POST to dd.idealista.com sets cookie)
    await page.waitForTimeout(3000);

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

    // DOM fallback: check if phone was injected into the page after clicking
    if (!phoneFromAjax) {
      const domPhone = await page.evaluate(() => {
        // appcallback_target_phone attribute (Idealista sets this after AJAX)
        const el = document.querySelector("[appcallback_target_phone]");
        if (el) {
          const v = el.getAttribute("appcallback_target_phone");
          if (v && /^\d{9}$/.test(v)) return v;
        }
        // tel: links with real phone numbers in the contact container
        const telLinks = document.querySelectorAll(
          "#contact-phones-container a[href^='tel:+'], " +
          "#contact-phones-container a[href^='tel:6'], " +
          "#contact-phones-container a[href^='tel:7'], " +
          "#contact-phones-container a[href^='tel:8'], " +
          "#contact-phones-container a[href^='tel:9']",
        );
        for (const link of telLinks) {
          const href = link.getAttribute("href") ?? "";
          const num = href.replace("tel:", "").trim();
          if (/^[+\d][\d\s\-]{8,}$/.test(num)) return num;
        }
        // hidden-contact-phones class
        const hiddenPhone = document.querySelector(".hidden-contact-phones-formatted-phone");
        if (hiddenPhone) {
          const href = hiddenPhone.getAttribute("href") ?? "";
          const num = href.replace("tel:", "").trim();
          if (num) return num;
        }
        return null;
      }).catch(() => null);

      if (domPhone) {
        phoneFromAjax = domPhone as string;
        console.log(`[playwright-phone] Phone from DOM: ${phoneFromAjax}`);
      }
    }

    const normalizedPhone = normalizeSpanishPhone(phoneFromAjax);
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
