/* SmartBC → Idealista Autopublish
 * Se ejecuta en idealista.com/tools/propiedad/nuevo cuando la URL trae
 * ?smartbc=<token>. Descarga los datos de la ficha desde SmartBC y rellena
 * el formulario automáticamente, incluyendo la subida de fotos.
 */
(function () {
  "use strict";

  const PORTAL_ORIGIN = "https://portal.bcousinoprop.com";
  const SMS_DELAY = 180; // ms entre acciones — deja tiempo a React para re-renderizar

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get("smartbc");
  }

  // ── UI de estado (panel flotante) ──────────────────────────────────────
  let badgeEl = null;
  let logEl = null;

  function createBadge() {
    badgeEl = document.createElement("div");
    badgeEl.style.cssText = [
      "position:fixed", "top:16px", "right:16px", "z-index:999999",
      "background:#1a1a1a", "color:#fff", "padding:14px 18px",
      "border-radius:10px", "font:13px/1.4 -apple-system,sans-serif",
      "box-shadow:0 8px 30px rgba(0,0,0,.3)", "max-width:340px",
    ].join(";");
    badgeEl.innerHTML =
      '<div style="font-weight:600;margin-bottom:6px">🏠 SmartBC → Idealista</div>' +
      '<div id="smartbc-status" style="opacity:.85">Iniciando...</div>' +
      '<div id="smartbc-log" style="margin-top:8px;font-size:11px;opacity:.6;max-height:160px;overflow:auto"></div>';
    document.body.appendChild(badgeEl);
    logEl = badgeEl.querySelector("#smartbc-log");
  }

  function setStatus(text, isError) {
    const el = badgeEl?.querySelector("#smartbc-status");
    if (el) {
      el.textContent = text;
      el.style.color = isError ? "#ff8080" : "#fff";
    }
  }

  function log(text) {
    if (!logEl) return;
    const line = document.createElement("div");
    line.textContent = text;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ── Helpers DOM ─────────────────────────────────────────────────────────
  async function waitFor(fn, timeout = 8000, interval = 150) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = fn();
      if (result) return result;
      await sleep(interval);
    }
    return null;
  }

  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
      input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      "value"
    )?.set;
    setter ? setter.call(input, value) : (input.value = value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findLabelByText(root, text) {
    const labels = root.querySelectorAll("label");
    const norm = (s) => s.trim().toLowerCase();
    for (const label of labels) {
      if (norm(label.textContent) === norm(text)) return label;
    }
    // fallback: startsWith (por si hay texto extra tipo tooltips)
    for (const label of labels) {
      if (norm(label.textContent).startsWith(norm(text))) return label;
    }
    return null;
  }

  async function clickCheckOrRadioByLabel(containerId, labelText) {
    const container = document.getElementById(containerId);
    if (!container) return log(`⚠ Contenedor #${containerId} no encontrado`);
    const label = findLabelByText(container, labelText);
    const input = label?.querySelector('input[type="checkbox"], input[type="radio"]');
    if (!input) return log(`⚠ No encontré opción "${labelText}" en #${containerId}`);
    if (!input.checked) input.click();
    await sleep(SMS_DELAY);
  }

  async function clickGlobalRadioByLabel(labelText) {
    const label = findLabelByText(document, labelText);
    const input = label?.querySelector('input[type="radio"], input[type="checkbox"]');
    if (!input) return log(`⚠ No encontré la opción "${labelText}" en la página`);
    if (!input.checked) input.click();
    await sleep(SMS_DELAY);
  }

  // El id del contenedor de precio cambia entre venta (salePrice) y
  // alquiler (rentPrice); si el id esperado no existe, se busca por el
  // texto de su <p> de etiqueta como respaldo.
  async function fillPriceField(containerId, labelFallback, value) {
    let container = document.getElementById(containerId);
    if (!container) {
      const label = [...document.querySelectorAll("p")].find((p) => p.textContent.trim() === labelFallback);
      container = label?.closest("[id]") || label?.parentElement;
    }
    if (!container) return log(`⚠ No encontré el campo de precio ("${labelFallback}")`);
    const input = container.querySelector("input");
    if (!input) return log(`⚠ Input de precio no encontrado ("${labelFallback}")`);
    setNativeValue(input, String(value));
    await sleep(SMS_DELAY);
  }

  async function setTextInputInContainer(containerId, value, inputIndex = 0) {
    const container = document.getElementById(containerId);
    if (!container) return log(`⚠ Contenedor #${containerId} no encontrado`);
    const inputs = container.querySelectorAll("input, textarea");
    const input = inputs[inputIndex];
    if (!input) return log(`⚠ Input #${inputIndex} no encontrado en #${containerId}`);
    setNativeValue(input, String(value));
    await sleep(SMS_DELAY);
  }

  async function fillLocationAutocomplete(containerId, inputIndex, value) {
    if (!value) return;
    const container = document.getElementById(containerId);
    if (!container) return log(`⚠ Contenedor #${containerId} no encontrado`);
    const input = container.querySelectorAll("input")[inputIndex];
    if (!input) return log(`⚠ Input #${inputIndex} no encontrado en #${containerId}`);
    setNativeValue(input, String(value));

    // Cada campo de localización tiene un <ul> de sugerencias que aparece tras escribir
    const scope = input.closest("[data-component-id]")?.parentElement || input.parentElement;
    const list = await waitFor(() => {
      const ul = scope?.querySelector("ul");
      return ul && ul.children.length > 0 ? ul : null;
    }, 1500);
    if (list) {
      list.querySelector("li")?.click();
      await sleep(SMS_DELAY);
    }
  }

  async function setStepper(containerId, targetValue) {
    const container = document.getElementById(containerId);
    if (!container) return log(`⚠ Contenedor #${containerId} no encontrado`);
    const input = container.querySelector("input");
    const plusBtn = container.querySelector('a[aria-label="+"]');
    const minusBtn = container.querySelector('a[aria-label="-"]');
    if (!input || !plusBtn) return log(`⚠ Stepper #${containerId} incompleto`);

    let current = parseInt(input.value || "0", 10) || 0;
    const target = Math.max(0, Math.round(Number(targetValue) || 0));
    let guard = 0;
    while (current !== target && guard < 60) {
      (target > current ? plusBtn : minusBtn)?.click();
      await sleep(120);
      current = parseInt(input.value || "0", 10) || 0;
      guard++;
    }
  }

  async function selectCombobox(containerId, optionTexts) {
    const container = document.getElementById(containerId);
    if (!container) return log(`⚠ Contenedor #${containerId} no encontrado`);
    const trigger = container.querySelector('[role="combobox"]');
    if (!trigger) return log(`⚠ Combobox #${containerId} no encontrado`);
    trigger.click();
    await sleep(SMS_DELAY);
    const listbox = await waitFor(() => container.querySelector('ul[role="listbox"]'), 2000);
    if (!listbox) return log(`⚠ Lista de opciones no se abrió en #${containerId}`);

    const options = [].concat(optionTexts);
    const norm = (s) => s.trim().toLowerCase();
    const items = [...listbox.querySelectorAll("li")];
    let match = null;
    for (const wanted of options) {
      match = items.find((li) => norm(li.textContent) === norm(wanted));
      if (match) break;
    }
    if (!match) {
      log(`⚠ Opción no encontrada en #${containerId}: ${options.join(" / ")}`);
      trigger.click(); // cerrar dropdown
      return;
    }
    (match.querySelector("label") || match).click();
    await sleep(SMS_DELAY);
  }

  // ── Mapas de valores SmartBC → texto visible en Idealista ──────────────
  const CONDITION_MAP = { good: "Buen estado", new: "Buen estado", "to-reform": "A reformar", "needs-reform": "A reformar" };
  const RENTAL_TYPE_MAP = { residential: "Residencial, vivienda habitual", temporary: "De temporada, por periodos limitados, por ejemplo, lectivos, trabajo temporal, mudanzas, etc." };
  const WINDOWS_LOCATION_MAP = { interior: "Interior", exterior: "Exterior" };
  const EQUIPMENT_MAP = {
    furnished: "Cocina con electrodomésticos y casa amueblada",
    "kitchen-only": "Cocina con electrodomésticos y casa sin amueblar",
    empty: "Cocina vacía y casa sin amueblar",
    unknown: "No lo sé",
  };
  const ENERGY_OPTION_MAP = { "": ["Aún no dispone"], pending: ["En trámite"] };

  function floorOptionTexts(floor) {
    const f = (floor || "").toLowerCase().replace(/[°ºª\s]/g, "");
    if (!f) return null;
    if (f.includes("bajo")) return ["Bajo"];
    if (f.includes("entrepl")) return ["Entreplanta"];
    if (f.includes("subsotano") || f.includes("semisotano")) return ["Subsótano / semisótano"];
    if (f.includes("sotano")) return ["Sótano"];
    const n = f.match(/\d+/);
    return n ? [n[0]] : null;
  }

  // ── Flujo principal ─────────────────────────────────────────────────────
  async function fillForm(data) {
    setStatus("Rellenando tipo de inmueble...");
    await selectCombobox("typology", [data.propertyTypeLabel]);
    await sleep(600); // esperar a que aparezcan los campos dinámicos

    setStatus("Rellenando localización...");
    await fillLocationAutocomplete("location", 0, data.addressCity);
    await fillLocationAutocomplete("location", 1, data.addressStreet);
    await setTextInputInContainer("location", data.addressNumber, 2);
    const validarBtn = document.getElementById("validateAddressButton");
    validarBtn?.querySelector('a, [role="button"]')?.click();
    await sleep(1000);

    // Idealista muestra un popup "Te hemos situado aquí" con mapa que hay
    // que confirmar antes de que el resto del formulario quede disponible.
    const confirmLocationBtn = await waitFor(
      () => [...document.querySelectorAll("button, a")].find((b) => /ok,\s*es aqu[ií]/i.test(b.textContent || "")),
      3000
    );
    if (confirmLocationBtn) {
      confirmLocationBtn.click();
      await sleep(600);
    }

    if (data.floor) {
      const opts = floorOptionTexts(data.floor);
      if (opts) await selectCombobox("floorNumber", opts);
    }

    setStatus("Visibilidad y operación...");
    await clickCheckOrRadioByLabel(
      "portalVisibility",
      data.addressVisibility === "hidden" ? "Ocultar dirección" : data.addressVisibility === "street" ? "Mostrar sólo calle" : "Dirección exacta"
    );
    await clickCheckOrRadioByLabel("operation", data.operation === "rent" ? "Alquiler" : "Venta");
    await sleep(400);

    if (data.operation === "rent") {
      await clickCheckOrRadioByLabel("rentalType", RENTAL_TYPE_MAP[data.rentalType] ?? RENTAL_TYPE_MAP.residential);
      if (data.totalRentalPrice) await fillPriceField("rentPrice", "Precio alquiler total", data.totalRentalPrice);
      if (data.maxTenants) await setStepper("maxTenantsAllowed", data.maxTenants);
      if (data.childrenRecommended) await clickCheckOrRadioByLabel("recommendedForChildren", "La vivienda es apropiada para niños (0-12 años)");
      if (data.petsAllowed) await clickCheckOrRadioByLabel("petsAllowed", "Se admiten mascotas");
    } else {
      // "¿Se venderá en alguna situación excepcional?" — por defecto ninguna
      await clickGlobalRadioByLabel("No, en ninguna situación excepcional");
      if (data.price) await fillPriceField("salePrice", "Precio de venta", data.price);
    }

    setStatus("Características adicionales...");
    if (data.isPenthouse) await clickCheckOrRadioByLabel("subtypology", "Ático");
    if (data.isStudio) await clickCheckOrRadioByLabel("subtypology", "Estudio");
    if (data.isDuplex) await clickCheckOrRadioByLabel("subtypology", "Dúplex");

    if (data.operation === "rent" && data.equipmentType && data.equipmentType !== "unknown") {
      await clickCheckOrRadioByLabel("installation", EQUIPMENT_MAP[data.equipmentType] ?? EQUIPMENT_MAP.unknown);
    }

    if (data.builtSquareMeters) await setTextInputInContainer("constructedArea", data.builtSquareMeters);
    if (data.squareMeters) await setTextInputInContainer("usableArea", data.squareMeters);

    setStatus("Dormitorios y baños...");
    await setStepper("roomNumber", data.bedrooms);
    await setStepper("bathNumber", data.bathrooms);

    setStatus("Eficiencia energética...");
    if (data.energyClass) {
      const opts = ENERGY_OPTION_MAP[data.energyClass] ?? [data.energyClass.toUpperCase()];
      await selectCombobox("energyCertificationType", opts);
    }
    if (data.emissionRating) {
      const opts = ENERGY_OPTION_MAP[data.emissionRating] ?? [data.emissionRating.toUpperCase()];
      await selectCombobox("emissionsType", opts);
    }

    setStatus("Conservación y orientación...");
    await clickCheckOrRadioByLabel("conservationState", CONDITION_MAP[data.condition] ?? "Buen estado");
    await clickCheckOrRadioByLabel("flatLocation", WINDOWS_LOCATION_MAP[data.windowsLocation] ?? "Exterior");
    await clickCheckOrRadioByLabel("elevatorOption", data.hasElevator ? "Sí" : "No");

    if (data.orientationNorth) await clickCheckOrRadioByLabel("orientation", "Norte");
    if (data.orientationSouth) await clickCheckOrRadioByLabel("orientation", "Sur");
    if (data.orientationEast) await clickCheckOrRadioByLabel("orientation", "Este");
    if (data.orientationWest) await clickCheckOrRadioByLabel("orientation", "Oeste");

    setStatus("Extras...");
    if (data.hasWardrobes) await clickCheckOrRadioByLabel("additionalFeatures", "Armarios empotrados");
    if (data.hasAC) await clickCheckOrRadioByLabel("additionalFeatures", "Aire acondicionado");
    if (data.hasTerrace) await clickCheckOrRadioByLabel("additionalFeatures", "Terraza");
    if (data.hasBalcony) await clickCheckOrRadioByLabel("additionalFeatures", "Balcón");
    if (data.hasParking) await clickCheckOrRadioByLabel("additionalFeatures", "Plaza de garaje");
    if (data.hasStorage) await clickCheckOrRadioByLabel("additionalFeatures", "Trastero");
    if (data.hasPool) await clickCheckOrRadioByLabel("additionalFeatures", "Piscina");
    if (data.hasGarden) await clickCheckOrRadioByLabel("additionalFeatures", "Jardín");

    setStatus("Descripción y referencia...");
    const descContainer = document.getElementById("description");
    const descTextarea = descContainer?.querySelector("textarea");
    if (descTextarea && data.description) setNativeValue(descTextarea, data.description);
    await sleep(SMS_DELAY);

    if (data.internalReference) await setTextInputInContainer("internalReference", data.internalReference);
    if (data.notes) await setTextInputInContainer("privateNote", data.notes);

    // Publicar en idealista y oficina online (opción por defecto deseada)
    await clickCheckOrRadioByLabel("publication", "En idealista y tu oficina online");

    setStatus("✓ Formulario rellenado");
    log("Campos completados. Revisa antes de subir fotos.");
  }

  // ── Subida de fotos ──────────────────────────────────────────────────────
  async function urlToFile(url, index) {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    return new File([blob], `foto-${index + 1}.${ext}`, { type: blob.type || "image/jpeg" });
  }

  async function uploadPhotos(photoUrls) {
    if (!photoUrls || photoUrls.length === 0) return;
    setStatus(`Subiendo fotos (0/${photoUrls.length})...`);

    const addBtn = document.querySelector("#multimedia-list_1 [data-component-id]");
    if (!addBtn) {
      log("⚠ No encontré el botón + de Fotos. Súbelas manualmente.");
      return;
    }
    addBtn.click();

    const modal = await waitFor(() => {
      const m = document.getElementById("uploadModal");
      return m && m.querySelector('input[type="file"]') ? m : null;
    }, 5000);

    if (!modal) {
      log("⚠ El modal de fotos no se abrió (¿faltan campos obligatorios?). Súbelas manualmente.");
      return;
    }

    const fileInput = modal.querySelector('input[type="file"]');
    let done = 0;
    for (const url of photoUrls) {
      try {
        const file = await urlToFile(url, done);
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        done++;
        setStatus(`Subiendo fotos (${done}/${photoUrls.length})...`);
        await sleep(1200);
      } catch (err) {
        log(`⚠ Error subiendo foto ${done + 1}: ${err.message}`);
      }
    }

    // Buscar botón de confirmar/cerrar el modal (texto habitual: Guardar, Aceptar, Cerrar)
    const confirmBtn = [...modal.querySelectorAll("a, button")].find((b) =>
      /guardar|aceptar|confirmar|cerrar/i.test(b.textContent || "")
    );
    if (confirmBtn) {
      await sleep(800);
      confirmBtn.click();
    }

    setStatus(`✓ ${done}/${photoUrls.length} fotos subidas`);
  }

  // ── Arranque ──────────────────────────────────────────────────────────
  async function main() {
    const token = getToken();
    if (!token) return; // no viene de SmartBC, no hacer nada

    createBadge();
    setStatus("Conectando con SmartBC...");

    let data;
    try {
      const res = await fetch(`${PORTAL_ORIGIN}/api/public/idealista-payload/${token}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      setStatus(`Error: ${err.message}`, true);
      return;
    }

    log(`Ficha cargada: ${data.referenceCode || data.title || data.id}`);
    await waitFor(() => document.getElementById("typology"), 10000);

    try {
      await fillForm(data);
      await uploadPhotos(data.photos);
      setStatus("✓ Listo. Revisa el formulario y presiona 'Guardar y publicar anuncio'.");
    } catch (err) {
      setStatus(`Error durante el llenado: ${err.message}`, true);
      log(String(err.stack || err));
    }
  }

  main();
})();
