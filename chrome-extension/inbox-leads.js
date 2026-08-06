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
  // El inbox tiene dos tipos de hilo: mensajes (CONVERSATION_) y llamadas
  // perdidas (CALL_). Ambos son leads. La "clave" de un hilo es el id
  // numérico para las conversaciones y "call_<id>" para las llamadas, para
  // que no colisionen en la base y poder reconstruir el enlace correcto.
  function threadKeyFromUrl(url) {
    const u = url || location.href;
    const conv = u.match(/CONVERSATION_(\d+)/);
    if (conv) return conv[1];
    const call = u.match(/CALL_(\d+)/);
    if (call) return "call_" + call[1];
    return null;
  }

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

  // Cada tarjeta de propiedad dentro del hilo trae una imagen con
  // alt="Imagen del anuncio" — atributo semántico estable, a diferencia de
  // las clases del botón contenedor (con hash de build). Un mismo contacto
  // puede preguntar por varias propiedades distintas en un solo hilo, así
  // que se devuelven TODAS las tarjetas encontradas, no solo la primera.
  function extractPropertyCards(scope) {
    const root = scope || document;
    const cards = [...root.querySelectorAll("button, a")]
      .filter((el) => el.querySelector('img[alt="Imagen del anuncio"]'))
      .map((el) => {
        const img = el.querySelector('img[alt="Imagen del anuncio"]');
        const imageUrl = img ? img.currentSrc || img.getAttribute("src") || null : null;
        const lines = ((el.innerText || "").trim()).split("\n").map((l) => l.trim()).filter(Boolean);
        const priceLine = lines.find((l) => PRICE_RE.test(l) && l.includes("€"));
        const price = priceLine ? (priceLine.match(PRICE_RE) || [])[1] || null : null;
        const typeParts = priceLine
          ? priceLine.split(/[|·–-]/).map((p) => p.trim()).filter((p) => p && !p.includes("€"))
          : [];
        const type = typeParts.length > 0 ? typeParts[typeParts.length - 1] : null;
        const title = lines.find((l) => l !== priceLine) || null;
        return { title, price, type, imageUrl };
      })
      .filter((c) => c.title || c.price || c.imageUrl);
    // Dedup por título (la misma propiedad puede aparecer repetida si se
    // menciona en más de un mensaje del hilo).
    const seen = new Set();
    return cards.filter((c) => {
      const key = c.title || c.imageUrl;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Foto de perfil del contacto: la src apunta siempre a
  // .../profilephotos/... (los contactos sin foto muestran iniciales, sin
  // <img>). Se ancla a la URL y no a las clases _kiwi-avatar (hasheadas).
  // scope acota la búsqueda (fila de lista o panel de contacto) para no
  // confundir el avatar con otras imágenes de la página.
  function extractAvatarUrl(scope) {
    const root = scope || document;
    const img = root.querySelector('img[src*="/profilephotos/"]');
    if (!img) return null;
    return img.currentSrc || img.getAttribute("src") || null;
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

  // ── UI de estado ──────────────────────────────────────────────────
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

    // La fila de listado normalmente solo muestra una tarjeta (la más
    // reciente); si hay más de una se capturan todas igual.
    const rowCards = extractPropertyCards(row);
    if (rowCards.length > 0) {
      lead.properties = rowCards;
      lead.propertyTitle = rowCards[0].title || lead.propertyTitle;
      lead.propertyPrice = rowCards[0].price || lead.propertyPrice;
      lead.propertyType = rowCards[0].type || lead.propertyType;
      lead.propertyImageUrl = rowCards[0].imageUrl || null;
    }

    lead.isInternational = lines.some((l) => /internacional/i.test(l));

    const avatarUrl = extractAvatarUrl(row);
    if (avatarUrl) lead.avatarUrl = avatarUrl;

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
    const anchors = document.querySelectorAll(
      'a[href*="/inbox/CONVERSATION_"], a[href*="/inbox/CALL_"]',
    );
    const byId = new Map();
    anchors.forEach((a) => {
      const key = threadKeyFromUrl(a.getAttribute("href") || "");
      if (!key || byId.has(key)) return;
      const row = a.closest("li, article, tr, [role='listitem']") || a;
      const lead = extractLeadFromRow(row, key);
      if (lead) byId.set(key, lead);
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

  // Fuente primaria del mensaje: cada burbuja del hilo trae data-qa
  // "seeker-message" (el contacto) o "advertiser-message" (nuestras propias
  // respuestas). Sin esto, la heurística de texto no distinguía quién
  // escribió cada mensaje y mezclaba nuestras respuestas con las del
  // contacto. Solo se toman los mensajes del contacto.
  function extractSeekerMessages() {
    const nodes = document.querySelectorAll('[data-qa="seeker-message"]');
    if (nodes.length === 0) return null;
    const texts = [...nodes]
      .map((el) => {
        const p = el.querySelector("p[data-kiwi-text]") || el.querySelector("p");
        return ((p || el).innerText || "").trim();
      })
      .filter(Boolean);
    // Solo se descartan duplicados CONSECUTIVOS (artefactos de render).
    // Un contacto puede mandar exactamente el mismo texto en días distintos
    // (la misma plantilla a cada anuncio que consulta): esos son mensajes
    // reales y deben conservarse todos.
    const unique = texts.filter((t, i) => i === 0 || t !== texts[i - 1]);
    return unique.length > 0 ? unique.join("\n\n").slice(0, 50000) : null;
  }

  function extractDetailLead(conversationId) {
    const lead = { conversationId };
    const bodyText = document.body.innerText || "";

    // Llamadas perdidas (CALL_): no hay hilo de mensajes ni perfil, solo un
    // aviso "Este número te llamó…", el teléfono y la propiedad consultada.
    // El contacto llega "Sin nombre" (se deja el nombre vacío → el portal
    // muestra su propio "Sin nombre").
    if (conversationId.startsWith("call_")) {
      const panel = findRightPanel();
      const scopeText = (panel && panel.innerText) || bodyText;
      const pm = scopeText.match(PHONE_RE);
      if (pm) lead.phone = pm[1];
      lead.isInternational = /internacional/i.test(bodyText);
      lead.message = "☎ Llamada perdida — te llamó para pedir información sobre el inmueble y no fue respondida.";
      const cards = extractPropertyCards(document);
      if (cards.length > 0) {
        lead.properties = cards;
        lead.propertyTitle = cards[0].title;
        lead.propertyPrice = cards[0].price;
        lead.propertyType = cards[0].type;
        lead.propertyImageUrl = cards[0].imageUrl;
      }
      const codM = bodyText.match(/Cod\.\s*:?\s*(\d{6,})/i);
      if (codM) lead.idealistaCode = codM[1];
      const refM = bodyText.match(/Ref\.\s*:?\s*([A-Za-z0-9_-]{2,20})/);
      if (refM) lead.propertyRef = refM[1];
      return lead;
    }

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

    // El avatar del contacto vive en el panel derecho; si el panel no se
    // encontró se busca en toda la página (en la vista de detalle la única
    // foto de perfil visible es la del contacto abierto).
    const avatarUrl = extractAvatarUrl(panel) || extractAvatarUrl(document);
    if (avatarUrl) lead.avatarUrl = avatarUrl;

    lead.profile = extractProfile();

    // Mensaje completo: primero se intenta con data-qa="seeker-message"
    // (solo lo que escribió el contacto, nunca nuestras propias respuestas).
    const seekerMessage = extractSeekerMessages();
    if (seekerMessage) {
      lead.message = seekerMessage;
    } else {
      // Respaldo: se concatenan TODAS las burbujas de texto del hilo, en
      // orden. Antes solo se guardaba el bloque de texto más largo, así que
      // si el contacto escribía en varios mensajes (a veces días distintos)
      // solo quedaba uno y se perdían los demás.
      // Se excluye por completo lo que esté dentro del panel de contacto
      // (nombre/teléfono/perfil) en vez de listar cada texto de esa zona uno
      // a uno, para no tener que perseguir cada etiqueta nueva de Idealista.
      // Nota: este respaldo no distingue nuestras respuestas de las del
      // contacto (no hay atributo data-qa que lo indique fuera del caso
      // anterior), así que solo se usa si el selector primario no existe.
      const NOISE_RE =
        /^(marcar como gestionado|convertir a demanda|crear nota|crear actividad|con perfil|perfil para b[uú]squeda de vivienda|traducir|internacional|reciente|anterior|archivar|escribe tu mensaje|tienes nuevas respuestas|enviado|entregado|le[ií]do|visto|\d+\s+nuevo mensaje)$/i;
      // Umbral bajo a propósito: respuestas cortas del contacto ("???", "Ok",
      // "Vale") son mensajes reales y no deben perderse. El ruido de la
      // interfaz (fechas, badges, "Traducir"...) ya lo filtran
      // NOISE_RE/DATE_RE y la exclusión del panel de contacto.
      const messageBlocks = [...document.querySelectorAll("p, div")]
        .filter((el) => el.children.length === 0)
        .filter((el) => !panel || !panel.contains(el))
        .map((el) => (el.innerText || "").trim())
        .filter(
          (t) =>
            t.length > 0 &&
            t.length < 20000 &&
            !/^\d+$/.test(t) &&
            !DATE_RE.test(t) &&
            !PRICE_RE.test(t) &&
            !NOISE_RE.test(t) &&
            !/^vio el anuncio/i.test(t),
        );
      // Igual que arriba: solo se descartan duplicados consecutivos; el
      // mismo texto repetido en otra parte del hilo es un mensaje real.
      const uniqueBlocks = messageBlocks.filter((t, i) => i === 0 || t !== messageBlocks[i - 1]);
      if (uniqueBlocks.length > 0) {
        // Tope generoso (ninguna conversación real lo alcanza) como red de
        // seguridad ante un cambio de markup que rompa la exclusión del
        // panel de contacto y termine barriendo texto de toda la página.
        lead.message = uniqueBlocks.join("\n\n").slice(0, 50000);
      }
    }

    // Propiedades consultadas: un mismo contacto puede preguntar por varias
    // en el mismo hilo (ver extractPropertyCards). Se capturan todas; los
    // campos planos property* quedan como la primera para compatibilidad.
    const propertyCards = extractPropertyCards(document);
    if (propertyCards.length > 0) {
      lead.properties = propertyCards;
      lead.propertyTitle = propertyCards[0].title;
      lead.propertyPrice = propertyCards[0].price;
      lead.propertyType = propertyCards[0].type;
      lead.propertyImageUrl = propertyCards[0].imageUrl;
    } else {
      // Respaldo: línea con € y la anterior como título (por si las
      // tarjetas no tienen imagen o cambió el markup).
      const lineList = bodyText.split("\n").map((l) => l.trim()).filter(Boolean);
      const priceIdx = lineList.findIndex((l) => PRICE_RE.test(l) && l.includes("€"));
      if (priceIdx > 0) {
        lead.propertyTitle = lineList[priceIdx - 1];
        lead.propertyPrice = (lineList[priceIdx].match(PRICE_RE) || [])[1] || null;
        const typeParts = lineList[priceIdx].split(/[|·–-]/).map((p) => p.trim()).filter((p) => p && !p.includes("€"));
        if (typeParts.length > 0) lead.propertyType = typeParts[typeParts.length - 1];
      }
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

  // Idealista carga los mensajes antiguos del hilo solo al hacer scroll
  // hacia arriba. Antes de capturar se sube el contenedor del hilo hasta
  // arriba del todo (repetidamente, hasta que deje de crecer) para que
  // estén TODOS los mensajes en el DOM.
  async function scrollThreadToTop() {
    const findScroller = () => {
      const msg = document.querySelector('[data-qa="seeker-message"], [data-qa="advertiser-message"]');
      let el = msg ? msg.parentElement : null;
      while (el && el !== document.body) {
        const style = getComputedStyle(el);
        if (el.scrollHeight > el.clientHeight + 20 && /(auto|scroll)/.test(style.overflowY)) return el;
        el = el.parentElement;
      }
      return null;
    };
    const scroller = findScroller();
    if (!scroller) return;
    let lastHeight = -1;
    for (let i = 0; i < 40; i++) {
      scroller.scrollTop = 0;
      await sleep(400);
      if (scroller.scrollHeight === lastHeight) break; // ya no carga más
      lastHeight = scroller.scrollHeight;
    }
  }

  async function captureDetail(conversationId, force) {
    if (!force && sentDetails.has(conversationId)) return;
    sentDetails.add(conversationId);

    // Esperar a que el hilo cargue (hay texto sustancial en pantalla)
    await waitFor(() => (document.body.innerText || "").length > 400, 8000, 300);
    await sleep(1200); // margen para que la SPA termine de pintar el perfil
    await scrollThreadToTop(); // cargar los mensajes viejos del hilo

    const lead = extractDetailLead(conversationId);
    const result = await sendLeads("detail", [lead]);
    if (result && result.ok) {
      showBadge("✓ Contacto actualizado en SmartBC", false, 3000);
    }
  }

  // ── Modo AUTO: recorre las conversaciones con el botón "Anterior" ────
  // Captura la conversación abierta, pulsa "Anterior" (la navegación
  // propia de Idealista entre conversaciones), espera a que cargue la
  // siguiente y repite hasta el final del inbox o hasta que se detenga.
  let autoRun = null; // {captured: n} mientras está activo

  // Localiza el control de navegación entre conversaciones ("Anterior" /
  // "Reciente") por su texto — sus clases _kiwi-button_* llevan hash de
  // build. No siempre es un <button> (a veces Idealista usa <a> o un
  // elemento con role="button"), así que se buscan los tres. Se ignoran
  // los ocultos, deshabilitados o sin caja visible.
  function findNavButton(label) {
    return [...document.querySelectorAll('button, a, [role="button"]')].find((b) => {
      if (b.disabled || b.getAttribute("aria-hidden") === "true") return false;
      if (b.getAttribute("aria-disabled") === "true") return false;
      if (b.offsetParent === null && b.getClientRects().length === 0) return false;
      const text = (b.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      return text === label || text.startsWith(label + " ") || text.endsWith(" " + label);
    });
  }

  // Nombre del contacto visible en el panel — mismo selector que usa
  // extractDetailLead. Se usa solo como SEÑAL de diagnóstico (para el
  // mensaje de error si la navegación falla), nunca como id: el backend
  // valida que conversationId sea numérico (o "call_"+dígitos) y rechaza
  // cualquier otra cosa, así que un id inventado nunca llegaría a guardarse.
  function contactNameNow() {
    const el = document.querySelector('[class*="_seeker-name"]');
    return el ? (el.textContent || "").trim() : null;
  }

  // Navega a la conversación anterior pulsando "Anterior". Devuelve el
  // nuevo conversationId leído de la URL, o null si tras el intento (y un
  // reintento sobre el <span> interno) la URL no cambió.
  // Un click nativo dispara los handlers de React; el reintento sobre el
  // hijo cubre el caso en que el listener esté en el <span>, no en el
  // control. NO se hacen los dos clicks a la vez para no saltarse una
  // conversación o rebotar hacia atrás.
  async function navigatePrev(currentId) {
    const beforeName = contactNameNow();
    const changed = () => {
      const key = threadKeyFromUrl();
      return key && key !== currentId ? key : null;
    };
    const nav = findNavButton("anterior");
    if (!nav) return { next: null, reason: 'no encontré el control "Anterior"' };
    if (nav.disabled) return { next: null, reason: "fin del inbox (Anterior deshabilitado)" };
    // eslint-disable-next-line no-console
    console.log('[SmartBC] auto: click en <' + nav.tagName.toLowerCase() + '> "' + (nav.textContent || "").trim().slice(0, 30) + '"');

    nav.click();
    let next = await waitFor(changed, 4000, 150);
    if (!next) {
      // Reintento: algunos builds enganchan el click en el <span> hijo.
      const again = findNavButton("anterior") || nav;
      const inner = again.querySelector("span") || again;
      inner.click();
      next = await waitFor(changed, 8000, 150);
    }
    if (!next) {
      // Diagnóstico: si el nombre del contacto SÍ cambió pero la URL no,
      // el problema es que Idealista navega sin tocar el history (esto
      // quedaría anotado para poder confirmarlo con evidencia real en vez
      // de volver a adivinar a ciegas).
      const nameChanged = contactNameNow() !== beforeName;
      const reason =
        "la conversación no cambió al pulsar Anterior (URL sigue en " +
        (threadKeyFromUrl() || "sin id") +
        (nameChanged ? "; el nombre del contacto SÍ cambió — Idealista no actualiza la URL al navegar" : "; el contacto tampoco cambió") +
        ")";
      return { next: null, reason };
    }
    return { next, reason: null };
  }

  async function runAutoCapture(startId) {
    autoRun = { captured: 0 };
    updateAutoButton();
    let currentId = startId;
    const visited = new Set();
    let stopReason = "fin del inbox";
    // El recorrido termina de forma natural cuando ya no hay botón
    // "Anterior" (última consulta del inbox). El tope de 2000 y el set
    // 'visited' son solo redes de seguridad ante un ciclo inesperado.
    for (let i = 0; i < 2000 && autoRun; i++) {
      if (visited.has(currentId)) { stopReason = "vuelta al inicio (ciclo)"; break; }
      visited.add(currentId);

      await captureDetail(currentId, true);
      if (!autoRun) { stopReason = "detenido por el usuario"; break; }
      autoRun.captured++;
      updateAutoButton();
      showBadge("Auto: " + autoRun.captured + " capturadas. Pasando a la siguiente…");

      const { next, reason } = await navigatePrev(currentId);
      if (!next) { stopReason = reason; break; }
      // eslint-disable-next-line no-console
      console.log("[SmartBC] auto:", autoRun.captured, "→ siguiente", next);
      currentId = next;
      await sleep(600); // pausa suave entre conversaciones
    }
    const total = autoRun ? autoRun.captured : 0;
    autoRun = null;
    updateAutoButton();
    // Sin auto-hide: el motivo del fin queda visible para diagnosticar.
    showBadge("✓ Auto terminado: " + total + " capturadas — " + stopReason);
  }

  function updateAutoButton() {
    const btn = document.getElementById("smartbc-auto-capture");
    if (!btn) return;
    btn.textContent = autoRun ? "⏹ Detener (" + autoRun.captured + ")" : "⏩ Capturar todas";
    btn.style.background = autoRun ? "#8b1a1a" : "#1a1a1a";
  }

  // Botón de reenvío manual: la captura automática corre al abrir la
  // conversación, pero Idealista carga los mensajes antiguos al hacer
  // scroll hacia arriba — este botón permite recapturar cuando ya está
  // TODO el hilo a la vista (o si la captura automática falló).
  function ensureDetailButton(conversationId) {
    const existing = document.getElementById("smartbc-resend-detail");
    if (existing) {
      existing.dataset.conversationId = conversationId;
      const autoBtn = document.getElementById("smartbc-auto-capture");
      if (autoBtn) autoBtn.dataset.conversationId = conversationId;
      return;
    }
    const baseCss = [
      "position:fixed", "bottom:24px", "z-index:999999",
      "background:#1a1a1a", "color:#fff", "border:0", "cursor:pointer",
      "padding:12px 18px", "border-radius:24px", "font:600 13px/1 -apple-system,sans-serif",
      "box-shadow:0 8px 30px rgba(0,0,0,.3)",
    ].join(";");

    const btn = document.createElement("button");
    btn.id = "smartbc-resend-detail";
    btn.dataset.conversationId = conversationId;
    btn.textContent = "🔄 Reenviar a SmartBC";
    btn.style.cssText = baseCss + ";right:16px";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        showBadge("Recapturando conversación…");
        await captureDetail(btn.dataset.conversationId, true);
      } finally {
        btn.disabled = false;
      }
    });
    document.body.appendChild(btn);

    const autoBtn = document.createElement("button");
    autoBtn.id = "smartbc-auto-capture";
    autoBtn.dataset.conversationId = conversationId;
    autoBtn.textContent = "⏩ Capturar todas";
    autoBtn.style.cssText = baseCss + ";right:210px";
    autoBtn.title =
      "Captura esta conversación y pasa sola a la anterior (botón 'Anterior' de Idealista) hasta recorrer todo el inbox. Vuelve a pulsar para detener.";
    autoBtn.addEventListener("click", () => {
      if (autoRun) {
        autoRun = null; // el bucle lo detecta y se detiene
        updateAutoButton();
        showBadge("Auto detenido", false, 3000);
      } else {
        runAutoCapture(autoBtn.dataset.conversationId);
      }
    });
    document.body.appendChild(autoBtn);
  }

  function removeDetailButton() {
    const btn = document.getElementById("smartbc-resend-detail");
    if (btn) btn.remove();
    const autoBtn = document.getElementById("smartbc-auto-capture");
    if (autoBtn) autoBtn.remove();
    autoRun = null;
  }

  // ── Router SPA ───────────────────────────────────────────────────────────
  let lastUrl = null;

  function onUrlChange() {
    const url = location.href;
    const threadKey = threadKeyFromUrl(url);
    if (threadKey) {
      removeListButton();
      ensureDetailButton(threadKey);
      // En modo auto el bucle ya captura cada hilo (con force);
      // capturar también aquí duplicaría los envíos.
      if (!autoRun) captureDetail(threadKey);
    } else if (/\/inbox\/?(\?|$)/.test(url)) {
      removeDetailButton();
      ensureListButton();
    } else {
      removeListButton();
      removeDetailButton();
    }
  }

  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onUrlChange();
    }
  }, 500);
})();
