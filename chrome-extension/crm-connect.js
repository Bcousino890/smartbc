/*
 * SmartBC — puente entre la página "Extensión de Chrome" del CRM y la
 * extensión. © Benjamín Cousiño Propiedades. Uso exclusivo del equipo.
 *
 * Solo se inyecta en https://portal.bcousinoprop.com/{país}/admin/extension.
 * La página pide el token al servidor con la sesión del CRM y nos lo pasa por
 * window.postMessage; aquí se valida el origen y se entrega a background.js.
 * El protocolo está documentado en extension-client.tsx (lado del CRM).
 */
(function () {
  "use strict";

  const ORIGIN = location.origin;
  const K = { token: "smartbcLeadsToken", user: "smartbcUser", authError: "smartbcAuthError" };

  function post(msg) {
    window.postMessage(Object.assign({ source: "smartbc-extension" }, msg), ORIGIN);
  }

  async function announce() {
    let connectedAs = null;
    try {
      const d = await chrome.storage.local.get([K.token, K.user, K.authError]);
      // Si la última llamada se rechazó (sesión revocada o caducada), la
      // extensión NO está conectada aunque guarde un token: no se anuncia.
      if (d[K.token] && /^sbx_/.test(d[K.token]) && d[K.user] && !d[K.authError]) {
        connectedAs = d[K.user].name || null;
      }
    } catch {
      /* contexto perdido tras actualizar la extensión: se anuncia sin estado */
    }
    post({
      type: "present",
      extensionId: chrome.runtime.id,
      version: chrome.runtime.getManifest().version,
      connectedAs,
    });
  }

  window.addEventListener("message", (event) => {
    // Solo la propia página del CRM, nunca un iframe ni otra ventana.
    if (event.source !== window || event.origin !== ORIGIN) return;
    const data = event.data;
    if (!data || data.source !== "smartbc-crm") return;

    if (data.type === "ping") {
      announce();
    } else if (data.type === "connect") {
      chrome.runtime.sendMessage(
        { type: "smartbc:setToken", token: data.token, user: data.user || null },
        (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) {
            post({ type: "error", error: (res && res.error) || "La extensión no pudo guardar la conexión." });
            return;
          }
          post({ type: "connected", user: data.user || null });
        },
      );
    }
  });

  announce();
})();
