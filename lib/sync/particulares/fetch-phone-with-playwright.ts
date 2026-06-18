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
    // Try rebrowser-playwright first: patches CDP Runtime.Enable detection that
    // DataDome uses to identify headless Chrome. Falls back to playwright-extra
    // + stealth if rebrowser-playwright is not installed.
    let chromium: { launch: (...args: unknown[]) => Promise<unknown> };
    let usingRebrowser = false;
    try {
      const rb = await import("rebrowser-playwright");
      chromium = rb.chromium as unknown as typeof chromium;
      usingRebrowser = true;
      console.log(`[playwright-phone] Using rebrowser-playwright (anti-CDP-detection)`);
    } catch {
      const { chromium: pwChromium } = await import("playwright-extra");
      const stealthMod = await import("puppeteer-extra-plugin-stealth");
      const stealth = (stealthMod as unknown as { default: () => unknown }).default();
      (pwChromium as unknown as { use: (p: unknown) => void }).use(stealth);
      chromium = pwChromium as unknown as typeof chromium;
      console.log(`[playwright-phone] Using playwright-extra + stealth (rebrowser not available)`);
    }
    void usingRebrowser;

    // For Playwright we prefer the static residential proxy (eu.smartproxy.net)
    // because it uses real ISP IPs. The dynamic IP-list API returns datacenter
    // IPs (Hetzner) that DataDome flags even with a perfect browser fingerprint.
    const rawProxyUrl = options?.proxyUrl ?? process.env.SMARTPROXY_URL;
    const residentialProxyUrl = process.env.SMARTPROXY_RESIDENTIAL_URL
      ?? (rawProxyUrl?.includes("smartproxy.net") && rawProxyUrl.includes("@") ? rawProxyUrl : undefined)
      ?? rawProxyUrl;

    let proxyConfig: { server: string; username?: string; password?: string } | undefined;
    if (residentialProxyUrl) {
      try {
        const u = new URL(residentialProxyUrl);
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
      return {
        phone: null,
        phoneConfidence: null,
        contactName: null,
        error: "DataDome blocked page load",
      };
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
