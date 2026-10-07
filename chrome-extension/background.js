/*
 * SmartBC — extensión de Chrome · service worker.
 * © Benjamín Cousiño Propiedades. Todos los derechos reservados. Uso
 * exclusivo del equipo de SmartBC; prohibida su copia o redistribución.
 *
 * Todas las llamadas al CRM salen de aquí, no de las páginas de los portales:
 *   · salen con el origen de la extensión (chrome-extension://<id>), que pone
 *     Chrome y que el servidor comprueba — una copia de la extensión tiene
 *     otro ID y el CRM la rechaza aunque lleve un token;
 *   · el token del usuario nunca pasa por la página de Idealista/Fotocasa…
 *
 * Mensajes que atiende (solo de los scripts de esta misma extensión):
 *   smartbc:api          {path, method, body}  → {ok, status, data, error}
 *   smartbc:whoami                             → igual, de /api/extension/me
 *   smartbc:setToken     {token, user}         → guarda la conexión nueva
 *   smartbc:disconnect                         → revoca en el CRM y olvida
 *   smartbc:openConnect                        → abre la página de conectar
 */

const PORTAL = "https://portal.bcousinoprop.com";
const K = { token: "smartbcLeadsToken", user: "smartbcUser", authError: "smartbcAuthError" };
const SESSION_TOKEN_RE = /^sbx_[A-Za-z0-9]{8}_[A-Za-z0-9]{40}$/;

async function read(keys) {
  return chrome.storage.local.get(keys);
}

async function callApi(path, method, body, tokenOverride) {
  // Solo las rutas de la extensión: nada de usar este puente para otra cosa.
  if (typeof path !== "string" || !path.startsWith("/api/extension/")) {
    return { ok: false, status: 400, data: null, error: "Ruta no permitida" };
  }
  const token = tokenOverride || (await read(K.token))[K.token];
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: { error: "La extensión no está conectada con tu usuario del CRM.", code: "missing" },
      error: "La extensión no está conectada con tu usuario del CRM.",
    };
  }
  try {
    // SIEMPRE POST, aunque la ruta sea de lectura: Chrome solo pone
    // `Origin: chrome-extension://<id>` en las peticiones POST del service
    // worker (comprobado: en GET no manda Origin). Sin ese Origin el servidor
    // no puede comprobar que quien llama es ESTA extensión y no una copia.
    void method;
    const res = await fetch(PORTAL + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body === undefined ? {} : body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const error = res.ok ? null : (data && data.error) || "Error " + res.status;
    if (!tokenOverride) {
      // El popup enseña este aviso ("se desconectó desde el CRM…") sin tener
      // que adivinar por qué falló el último envío.
      if (res.status === 401) await chrome.storage.local.set({ [K.authError]: error });
      else if (res.ok) await chrome.storage.local.remove(K.authError);
    }
    return { ok: res.ok, status: res.status, data, error };
  } catch {
    return { ok: false, status: 0, data: null, error: "No se pudo conectar con SmartBC (¿sin red?)" };
  }
}

async function connectUrl() {
  const { [K.user]: user } = await read(K.user);
  const country = user && Array.isArray(user.countries) && user.countries[0] === "cl" ? "cl" : "es";
  return `${PORTAL}/${country}/admin/extension?conectar=1`;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== "string") return false;

  switch (msg.type) {
    case "smartbc:api":
      callApi(msg.path, msg.method, msg.body).then(sendResponse);
      return true;

    case "smartbc:whoami":
      callApi("/api/extension/me", "GET").then(async (res) => {
        if (res.ok && res.data && res.data.user) {
          await chrome.storage.local.set({ [K.user]: res.data.user });
        }
        sendResponse(res);
      });
      return true;

    case "smartbc:setToken":
      (async () => {
        if (typeof msg.token !== "string" || !SESSION_TOKEN_RE.test(msg.token)) {
          sendResponse({ ok: false, error: "Token con un formato inesperado" });
          return;
        }
        // Reconectar no debe dejar viva la sesión anterior de este navegador.
        const { [K.token]: old } = await read(K.token);
        if (old && old !== msg.token && SESSION_TOKEN_RE.test(old)) {
          await callApi("/api/extension/disconnect", "POST", {}, old);
        }
        await chrome.storage.local.set({ [K.token]: msg.token, [K.user]: msg.user || null });
        await chrome.storage.local.remove(K.authError);
        sendResponse({ ok: true });
      })();
      return true;

    case "smartbc:disconnect":
      (async () => {
        const { [K.token]: token } = await read(K.token);
        if (token && SESSION_TOKEN_RE.test(token)) {
          await callApi("/api/extension/disconnect", "POST", {}, token);
        }
        await chrome.storage.local.remove([K.token, K.user, K.authError]);
        sendResponse({ ok: true });
      })();
      return true;

    case "smartbc:openConnect":
      connectUrl().then((url) => chrome.tabs.create({ url }));
      return false;

    default:
      return false;
  }
});
