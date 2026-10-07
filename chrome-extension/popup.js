/*
 * SmartBC — popup de la extensión (también es su página de opciones).
 * © Benjamín Cousiño Propiedades. Uso exclusivo del equipo.
 *
 * Dice con quién está conectada la extensión y permite conectar o
 * desconectar. Conectar abre el CRM: es ahí donde se entra con la contraseña,
 * nunca aquí.
 */
(function () {
  "use strict";

  const PORTAL = "https://portal.bcousinoprop.com";
  const $ = (id) => document.getElementById(id);
  const statusEl = $("status");

  $("version").textContent = "Versión " + chrome.runtime.getManifest().version;

  function show(html, opts) {
    statusEl.innerHTML = html;
    $("connect").hidden = !opts.connect;
    $("connect-hint").hidden = !opts.connect;
    $("connect").textContent = opts.connectLabel || "Conectar con mi usuario";
    $("disconnect").hidden = !opts.disconnect;
    $("manage").hidden = !opts.manage;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  async function render() {
    const d = await chrome.storage.local.get(["smartbcLeadsToken", "smartbcUser"]);
    const token = d.smartbcLeadsToken;

    if (!token) {
      show(
        "<strong>Sin conectar</strong><span class='muted'>Conecta la extensión con tu usuario del CRM para mandar anuncios a las fichas de tus clientes.</span>",
        { connect: true },
      );
      return;
    }

    if (!/^sbx_/.test(token)) {
      // Token compartido de la 1.x: sigue funcionando mientras un admin no lo
      // apague, pero no dice quién eres.
      show(
        "<strong>Con el token antiguo</strong><span class='muted'>Funciona, pero no dice quién eres y pronto dejará de valer. Conecta con tu usuario.</span>",
        { connect: true },
      );
      return;
    }

    const res = await chrome.runtime.sendMessage({ type: "smartbc:whoami" });
    if (res && res.ok && res.data && res.data.user) {
      const u = res.data.user;
      show(
        `<strong class="ok">Conectada como ${escapeHtml(u.name)}</strong><span class="muted">${escapeHtml(u.email || "")}</span>`,
        { disconnect: true, manage: true },
      );
    } else if (res && res.status === 0) {
      const name = d.smartbcUser && d.smartbcUser.name;
      show(
        `<strong>${name ? "Conectada como " + escapeHtml(name) : "Conectada"}</strong><span class="muted">Sin conexión con el CRM ahora mismo.</span>`,
        { disconnect: true, manage: true },
      );
    } else {
      show(
        `<strong class="error">La conexión ya no vale</strong><span class="muted">${escapeHtml((res && res.error) || "Vuelve a conectar la extensión.")}</span>`,
        { connect: true, connectLabel: "Volver a conectar" },
      );
    }
  }

  async function crmUrl(path) {
    const d = await chrome.storage.local.get("smartbcUser");
    const u = d.smartbcUser;
    const country = u && Array.isArray(u.countries) && u.countries[0] === "cl" ? "cl" : "es";
    return `${PORTAL}/${country}${path}`;
  }

  // La pestaña se abre desde aquí y se espera a que exista antes de cerrar el
  // popup: cerrarlo enseguida tras pedírselo al service worker perdía el
  // mensaje y el botón no hacía nada.
  $("connect").addEventListener("click", async () => {
    await chrome.tabs.create({ url: await crmUrl("/admin/extension?conectar=1") });
    window.close();
  });

  $("disconnect").addEventListener("click", async () => {
    $("disconnect").disabled = true;
    await chrome.runtime.sendMessage({ type: "smartbc:disconnect" });
    $("disconnect").disabled = false;
    render();
  });

  $("manage-link").addEventListener("click", async (e) => {
    e.preventDefault();
    await chrome.tabs.create({ url: await crmUrl("/admin/extension") });
    window.close();
  });

  render();
})();
