/* SmartBC ← Idealista Inbox Leads
 * Se ejecuta en idealista.com/inbox. Dos modos:
 *  - LISTA: botón flotante "Enviar a SmartBC" que captura todas las
 *    conversaciones visibles de la página (nombre, teléfono, propiedad, snippet).
 *  - DETALLE: al abrir una conversación captura automáticamente el mensaje
 *    completo y el panel "Perfil para búsqueda de vivienda" y enriquece el lead.
 * Autenticación: token de larga duración guardado en chrome.storage.local
 * (se genera en SmartBC y se pega en las Opciones de la extensión).
 * Toda la extracción va anclada a URLs y regex de texto, nunca a clases CSS:
 * si algo no se encuentra, el campo va null — el envío nunca se rompe.
 */
(function () {
  "use strict";

  const PORTAL_ORIGIN = "https://portal.bcousinoprop.com";
  const API_URL = PORTAL_ORIGIN + "/api/extension/idealista-leads";

  const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
  const COUNTRY_RE = /\(([A-Z]{2})\)/;
  const PRICE_RE = /([\d.,]+\s*€(?:\/mes)?)/;
  const DATE_RE = /^(\d{1,2}:\d{2}|\d{1,2}\s+\w{3,}\.?|hoy|ayer)$/i;
  const CONVERSATION_RE = /CONVERSATION_(\d+)/;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(fn, timeout = 8000, interval = 200) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = fn();
      if (result) return result;
      await sleep(interval);
    }
    return null;
  }

  // El botón de llamada de Idealista lleva el teléfono en crudo en el
  // atributo appcallback_target_phone (ej. "603466878"), mucho más fiable
  // que parsear el texto visible. scope puede ser una fila de la lista o
  // todo el documento en la vista de detalle.
  function extractPhoneFromScope(scope) {
    const attrEl = scope.querySelector && scope.querySelector("[appcallback_target_phone]");
    if (!attrEl) return null;
    const text = (attrEl.innerText || "").trim();
    const match = text.match(PHONE_RE);
    if (!match) return null;
    const result = { phone: match[1] };
    const country = text.match(/\(([^)]*?)\)/);
    const cc = country && country[1].match(/([A-Z]{2})\s*$/);
    if (cc) result.phoneCountry = cc[1];
    return result;
  }

  // ── Token ──────────────────────────────────────────────────────────────────
  function getToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get("smartbcLeadsToken", (data) => {
        resolve(data.smartbcLeadsToken || null);
      });
    });
  }

  async function requireToken() {
    let token = await getToken();
    if (!token) {
      token = window.prompt(
        "SmartBC: pega el token de la extensión (se genera en el portal y se guarda una sola vez):",
      );
      if (token) {
        token = token.trim();
        chrome.storage.local.set({ smartbcLeadsToken: token });
      }
    }
    return token || null;
  }

  // ── UI de estado ─────────────────────────────────────────────────────
  let badgeEl = null;
  let badgeTimer = null;

  function showBadge(text, isError, autoHideMs) {
    if (!badgeEl) {
      badgeEl = document.createElement("div");
      badgeEl.id = "smartbc-leads-badge";
      badgeEl.style.cssText = [
        "position:fixed", "bottom:76px", "right:16px", "z-index:999999",
        "background:#1a1a1a", "color:#fff", "padding:12px 16px",
        "border-radius:10px", "font:13px/1.4 -apple-system,sans-serif",
        "box-shadow:0 8px 30px rgba(0,0,0,.3)", "max-width:320px",
      ].join(";");
      document.body.appendChild(badgeEl);
    }
    badgeEl.innerHTML =
      '<div style="font-weight:600;margin-bottom:2px">🏠 SmartBC</div>' +
      '<div style="opacity:.9;color:' + (isError ? "#ff8080" : "#fff") + '">' + text + "</div>";
    badgeEl.style.display = "block";
    if (badgeTimer) clearTimeout(badgeTimer);
    if (autoHideMs) {
      badgeTimer = setTimeout(() => {
        if (badgeEl) badgeEl.style.display = "none";
      }, autoHideMs);
    }
  }

  // ── Envío al portal ────────────────────────────────────────────────
  async function sendLeads(source, leads) {
    const token = await requireToken();
    if (!token) {
      showBadge("Falta el token de SmartBC: configúralo en las Opciones de la extensión", true, 8000);
      return null;
    }
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ source, leads }),
      });
      if (res.status === 401) {
        showBadge("Token caducado o inválido: genera uno nuevo en SmartBC y pégalo en Opciones", true, 10000);
        return null;
      }
      if (!res.ok) {
        let detail = "";
        try {
          const body = await res.json();
          detail = body.detail || body.error || "";
        } catch {
          /* cuerpo no-JSON */
        }
        showBadge("Error del portal (" + res.status + ")" + (detail ? ": " + detail : ""), true, 12000);
        return null;
      }
      return await res.json();
    } catch (err) {
      showBadge("No se pudo conectar con el portal: " + err.message, true, 8000);
      return null;
    }
  }

  // ── Extracción: vista LISTA ──────────────────────────────────────────
  function textLines(el) {
    return (el.innerText || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  function extractLeadFromRow(row, conversationId) {
    const lines = textLines(row);
    if (lines.length === 0) return null;

    const lead = { conversationId };
    let phoneIdx = -1;
    let priceIdx = -1;

    lines.forEach((line, i) => {
      if (phoneIdx === -1 && PHONE_RE.test(line) && line.replace(/\D/g, "").length >= 8) {
        phoneIdx = i;
        lead.phone = (line.match(PHONE_RE) || [])[1] || null;
        const country = line.match(COUNTRY_RE);
        if (country) lead.phoneCountry = country[1];
      }
      if (priceIdx === -1 && PRICE_RE.test(line) && line.includes("€")) {
        priceIdx = i;
        lead.propertyPrice = (line.match(PRICE_RE) || [])[1] || null;
        // "2.000 €/mes - Piso" → tipo tras el separador
        const typeMatch = line.split(/[-–|·]/).map((p) => p.trim()).filter((p) => p && !p.includes("€"));
        if (typeMatch.length > 0) lead.propertyType = typeMatch[typeMatch.length - 1];
      }
      if (!lead.messageDate && DATE_RE.test(line)) lead.messageDate = line;
    });

    // Nombre: primera línea de la fila
    lead.name = lines[0] || null;

    // El atributo appcallback_target_phone (si está presente en la fila) es
    // más fiable que el regex sobre el texto visible.
    const attrPhone = extractPhoneFromScope(row);
    if (attrPhone) {
      lead.phone = attrPhone.phone;
      if (attrPhone.phoneCountry) lead.phoneCountry = attrPhone.phoneCountry;
    }

    // Título de propiedad: línea inmediatamente anterior al precio
    if (priceIdx > 0) lead.propertyTitle = lines[priceIdx - 1];

    lead.isInternational = lines.some((l) => /internacional/i.test(l));

    // Mensaje: la línea más larga que no sea ninguna de las ya identificadas
    const used = new Set(
      [lead.name, lead.phone && lines[phoneIdx], lead.propertyTitle, priceIdx >= 0 ? lines[priceIdx] : null, lead.messageDate].filter(Boolean),
    );
    const candidates = lines.filter((l) => !used.has(l) && !/^internacional$/i.test(l) && l.length > 15);
    if (candidates.length > 0) {
      lead.message = candidates.reduce((a, b) => (b.length > a.length ? b : a), "");
    }

    return lead;
  }

  function collectListLeads() {
    const anchors = document.querySelectorAll('a[href*="/inbox/CONVERSATION_"]');
    const byId = new Map();
    anchors.forEach((a) => {
      const match = (a.getAttribute("href") || "").match(CONVERSATION_RE);
      if (!match) return;
      const conversationId = match[1];
      if (byId.has(conversationId)) return;
      const row = a.closest("li, article, tr, [role='listitem']") || a;
      const lead = extractLeadFromRow(row, conversationId);
      if (lead) byId.set(conversationId, lead);
    });
    return [...byId.values()];
  }

  // ── Extracción: vista DETALLE ──────────────────────────────────────
  function findHeadingByText(prefix) {
    const norm = (s) =>
      (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    const target = norm(prefix);
    const nodes = document.querySelectorAll("h1, h2, h3, h4, strong, b, p, span, div");
    for (const el of nodes) {
      // Solo nodos "hoja" (evita contenedores gigantes que incluyen el texto)
      if (el.children.length > 1) continue;
      if (norm(el.textContent).startsWith(target)) return el;
    }
    return null;
  }

  function extractProfile() {
    const heading = findHeadingByText("perfil para busqueda");
    if (!heading) return null;
    let panel = heading.parentElement;
    // Subir hasta un contenedor que tenga lista de bullets
    for (let i = 0; i < 5 && panel; i++) {
      if (panel.querySelectorAll("li").length > 0) break;
      panel = panel.parentElement;
    }
    if (!panel) return null;
    const bullets = [];
    let presentacion = null;
    panel.querySelectorAll("li").forEach((li) => {
      const text = (li.innerText || "").trim();
      if (!text) return;
      const match = text.match(/^presentaci[oó]n\s*:?\s*/i);
      if (match) {
        presentacion = text.slice(match[0].length).replace(/^["“”']|["“”']$/g, "").trim();
      } else {
        bullets.push(text);
      }
    });
    if (bullets.length === 0 && !presentacion) return null;
    return { bullets, presentacion };
  }

  // Panel derecho del contacto: nombre y teléfono están SIEMPRE justo encima
  // del enlace "Convertir a demanda" (a diferencia del texto "Perfil", que
  // también matchea la pestaña de arriba y por eso no sirve como ancla).
  function findRightPanel() {
    const anchor = [...document.querySelectorAll("a, button")].find((el) =>
      /convertir a demanda/i.test(el.textContent || ""),
    );
    if (!anchor) return null;
    let panel = anchor.parentElement;
    for (let i = 0; i < 6 && panel; i++) {
      if (PHONE_RE.test(panel.innerText || "")) return panel;
      panel = panel.parentElement;
    }
    return anchor.parentElement;
  }

  function extractDetailLead(conversationId) {
    const lead = { conversationId };
    const bodyText = document.body.innerText || "";

    // Fuente primaria: clases semánticas observadas en el HTML real de
    // Idealista/tools (ver README). El sufijo hash del CSS module puede
    // cambiar con cada build, pero el prefijo "_seeker-name"/"_seeker-phone"
    // y el atributo appcallback_target_phone deberían ser estables.
    const nameEl = document.querySelector('[class*="_seeker-name"]');
    if (nameEl) {
      const name = (nameEl.innerText || "").trim();
      if (name) lead.name = name;
    }
    const attrPhone = extractPhoneFromScope(document);
    if (attrPhone) {
      lead.phone = attrPhone.phone;
      if (attrPhone.phoneCountry) lead.phoneCountry = attrPhone.phoneCountry;
    }

    // Panel de contacto (nombre/teléfono/perfil), calculado una sola vez:
    // sirve de respaldo si las clases semánticas no existen (Idealista cambió
    // el markup) y también para excluir su contenido de la extracción del
    // mensaje más abajo.
    const panel = findRightPanel();

    // Respaldo: se ancla al enlace "Convertir a demanda" — siempre está
    // justo debajo del nombre y el teléfono en el panel de contacto.
    if (!lead.name || !lead.phone) {
      if (panel) {
        const allLines = textLines(panel);
        const anchorIdx = allLines.findIndex((l) => /convertir a demanda/i.test(l));
        const headLines = (anchorIdx >= 0 ? allLines.slice(0, anchorIdx) : allLines).filter(
          (l) => !/^(perfil|notas|actividades)$/i.test(l),
        );

        const phoneIdx = headLines.findIndex((l) => PHONE_RE.test(l));
        if (!lead.phone && phoneIdx >= 0) {
          const phoneLine = headLines[phoneIdx];
          lead.phone = (phoneLine.match(PHONE_RE) || [])[1] || null;
          // Teléfonos internacionales vienen como "+39 366 400 5565 (Italia, IT)";
          // los nacionales no llevan paréntesis con país.
          const country = phoneLine.match(/\(([^)]*?)\)/);
          if (country) {
            const cc = country[1].match(/([A-Z]{2})\s*$/);
            if (cc) lead.phoneCountry = cc[1];
          }
        }

        if (!lead.name) {
          const nameLine = headLines.find(
            (l, i) => i !== phoneIdx && !/internacional/i.test(l) && !/^vio el anuncio/i.test(l),
          );
          if (nameLine) lead.name = nameLine;
        }
      }
    }
    lead.isInternational = /internacional/i.test(bodyText);

    lead.profile = extractProfile();

    // Mensaje completo: se concatenan TODAS las burbujas del hilo de chat, en
    // orden. Antes solo se guardaba el bloque de texto más largo, así que si
    // el contacto escribía en varios mensajes (a veces días distintos) solo
    // quedaba uno y se perdían los demás.
    // Se excluye por completo lo que esté dentro del panel de contacto
    // (nombre/teléfono/perfil) en vez de listar cada texto de esa zona uno a
    // uno, para no tener que perseguir cada etiqueta nueva que añada Idealista.
    const NOISE_RE =
      /^(marcar como gestionado|convertir a demanda|crear nota|crear actividad|con perfil|perfil para b[uú]squeda de vivienda|traducir|internacional|reciente|anterior|archivar|escribe tu mensaje|tienes nuevas respuestas|enviado|entregado|le[ií]do|visto|\d+\s+nuevo mensaje)$/i;
    // Umbral bajo a propósito: respuestas cortas del contacto ("???", "Ok",
    // "Vale") son mensajes reales y no deben perderse. El ruido de la
    // interfaz (fechas, badges, "Traducir"...) ya lo filtran NOISE_RE/DATE_RE
    // y la exclusión del panel de contacto, así que no hace falta un umbral
    // de longitud alto para compensar.
    const messageBlocks = [...document.querySelectorAll("p, div")]
      .filter((el) => el.children.length === 0)
      .filter((el) => !panel || !panel.contains(el))
      .map((el) => (el.innerText || "").trim())
      .filter(
        (t) =>
          t.length > 0 &&
          t.length < 4000 &&
          !/^\d+$/.test(t) &&
          !DATE_RE.test(t) &&
          !PRICE_RE.test(t) &&
          !NOISE_RE.test(t) &&
          !/^vio el anuncio/i.test(t),
      );
    const seenMessages = new Set();
    const uniqueBlocks = messageBlocks.filter((t) => (seenMessages.has(t) ? false : (seenMessages.add(t), true)));
    if (uniqueBlocks.length > 0) {
      lead.message = uniqueBlocks.join("\n\n").slice(0, 12000);
    }

    // Propiedad: tarjeta dentro del hilo — línea con € y la anterior como título
    const lineList = bodyText.split("\n").map((l) => l.trim()).filter(Boolean);
    const priceIdx = lineList.findIndex((l) => PRICE_RE.test(l) && l.includes("€"));
    if (priceIdx > 0) {
      lead.propertyTitle = lineList[priceIdx - 1];
      lead.propertyPrice = (lineList[priceIdx].match(PRICE_RE) || [])[1] || null;
      const typeParts = lineList[priceIdx].split(/[|·–-]/).map((p) => p.trim()).filter((p) => p && !p.includes("€"));
      if (typeParts.length > 0) lead.propertyType = typeParts[typeParts.length - 1];
    }

    // Cod./Ref. — visibles si el modal de la propiedad está abierto.
    // El punto es obligatorio para no capturar palabras tipo "Reciente".
    const codMatch = bodyText.match(/Cod\.\s*:?\s*(\d{6,})/i);
    if (codMatch) lead.idealistaCode = codMatch[1];
    const refMatch = bodyText.match(/Ref\.\s*:?\s*([A-Za-z0-9_-]{2,20})/);
    if (refMatch) lead.propertyRef = refMatch[1];

    return lead;
  }

  // ── Modo LISTA: botón flotante ─────────────────────────────────────
  function ensureListButton() {
    if (document.getElementById("smartbc-send-leads")) return;
    const btn = document.createElement("button");
    btn.id = "smartbc-send-leads";
    btn.textContent = "📤 Enviar a SmartBC";
    btn.style.cssText = [
      "position:fixed", "bottom:24px", "right:16px", "z-index:999999",
      "background:#1a1a1a", "color:#fff", "border:0", "cursor:pointer",
      "padding:12px 18px", "border-radius:24px", "font:600 13px/1 -apple-system,sans-serif",
      "box-shadow:0 8px 30px rgba(0,0,0,.3)",
    ].join(";");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const leads = collectListLeads();
        if (leads.length === 0) {
          showBadge("No se encontraron conversaciones en esta página", true, 5000);
          return;
        }
        showBadge("Enviando " + leads.length + " contactos…");
        const result = await sendLeads("list", leads);
        if (result && result.ok) {
          showBadge("✓ " + leads.length + " enviados (" + result.inserted + " nuevos, " + result.updated + " actualizados)", false, 6000);
        }
      } finally {
        btn.disabled = false;
      }
    });
    document.body.appendChild(btn);
  }

  function removeListButton() {
    const btn = document.getElementById("smartbc-send-leads");
    if (btn) btn.remove();
  }

  // ── Modo DETALLE: captura automática ─────────────────────────────────
  const sentDetails = new Set(); // conversationIds ya enviados en esta pestaña

  async function captureDetail(conversationId) {
    if (sentDetails.has(conversationId)) return;
    sentDetails.add(conversationId);

    // Esperar a que el hilo cargue (hay texto sustancial en pantalla)
    await waitFor(() => (document.body.innerText || "").length > 400, 8000, 300);
    await sleep(1500); // margen para que la SPA termine de pintar el perfil

    const lead = extractDetailLead(conversationId);
    const result = await sendLeads("detail", [lead]);
    if (result && result.ok) {
      showBadge("✓ Contacto actualizado en SmartBC", false, 3000);
    }
  }

  // ── Router SPA ───────────────────────────────────────────────────────────
  let lastUrl = null;

  function onUrlChange() {
    const url = location.href;
    const conversation = url.match(CONVERSATION_RE);
    if (conversation) {
      removeListButton();
      captureDetail(conversation[1]);
    } else if (/\/inbox\/?(\?|$)/.test(url)) {
      ensureListButton();
    } else {
      removeListButton();
    }
  }

  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onUrlChange();
    }
  }, 500);
})();
