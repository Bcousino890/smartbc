// Idealista form selectors - verified by DOM inspection on 2026-06-29
// Update this file if Idealista changes their UI

export const IDEALISTA_SELECTORS = {
  login: {
    // Step 1: email
    emailInput: 'input#login-email',
    continueButton: 'button[type="submit"]:has-text("Continuar")',

    // Step 2: password
    passwordInput: 'input#login-password',
    loginButton: 'button[type="submit"]:has-text("Iniciar sesión")',

    // Step 3: SMS 2FA
    smsCodeInput: 'input#verification-requested-code',
    confirmButton: 'button[type="submit"]:has-text("Confirmar y entrar")',
    // The phone hint text is inside the modal (e.g. "Te hemos enviado un código al ****103")
    smsHintContainer: '[class*="kiwi-textbox"], .verification-hint, p',
  },

  // New property form: https://idealista.com/tools/propiedad/nuevo
  form: {
    // Tipo de inmueble — click the label with the type text
    propertyTypeLabel: (type: string) => `label:has-text("${type}")`,

    // Localización — inputs have no id/name, select by sibling of <p> label
    localidadInput: 'p:has-text("Localidad") + div input',
    calleInput: 'p:has-text("Nombre de la calle") + div input',
    numeroInput: 'p:has-text("Número") + div input',
    referenciaCatastralInput: 'p:has-text("Referencia catastral") + div input',
    sinNumeroCheckbox: 'label:has-text("Sin número") input[type="checkbox"]',
    validarDireccionBtn: 'a[aria-label="Validar dirección"]',

    // Visibilidad en portales (radio)
    visibilidadExacta: 'label:has-text("Dirección exacta") input[type="radio"]',
    visibilidadSoloCalle: 'label:has-text("Mostrar sólo calle") input[type="radio"]',
    visibilidadOcultar: 'label:has-text("Ocultar dirección") input[type="radio"]',

    // Descripción
    descriptionTextarea: 'textarea[aria-label*="Esta sección se lee mucho"]',
    websiteInput: 'input[aria-label="http://"]',

    // Publicar en (radio)
    publicarIdealista: 'label:has-text("En idealista y tu oficina online") input[type="radio"]',
    publicarSoloWeb: 'label:has-text("Sólo en tu oficina online") input[type="radio"]',
    noPublicar: 'label:has-text("No publicar.") input[type="radio"]',

    // Referencia interna y notas
    referenciaInternaInput: 'p:has-text("Referencia interna") + div input',
    notasPrivadasTextarea: 'p:has-text("Notas privadas") + div textarea',

    // Fotos / Media — file inputs inside the section
    fotosSection: 'h2:has-text("Fotos")',
    fileInputHidden: 'input[type="file"]',

    // Submit
    guardarPublicarBtn: 'a[aria-label="Guardar y publicar anuncio"]',

    // Dynamic fields that appear after property type selection
    // (selectors may vary by type — inspect after type selection)
    precioInput: 'p:has-text("Precio") + div input, input[placeholder*="precio" i]',
    habitacionesInput: 'p:has-text("Habitaciones") + div input, p:has-text("Dormitorios") + div input',
    banosInput: 'p:has-text("Baños") + div input',
    metrosInput: 'p:has-text("Metros") + div input, p:has-text("Superficie") + div input',
  },

  // Feedback / detection selectors
  feedback: {
    // Detect whether we're on the tools dashboard (= logged in)
    toolsDashboard: '.tools-header, [id="close-tools-aside"], .tools-header__action',
    // Redirect to login = session expired
    loginPage: 'input#login-email, [class*="login-box"]',
    errorMessage: '[class*="error"], [class*="alert"], text=/error|falló/i',
  },
};

// Mapping from SmartBC property types to Idealista label text
export const PROPERTY_TYPE_MAP: Record<string, string> = {
  apartment: "Piso",
  flat: "Piso",
  piso: "Piso",
  house: "Casa / Chalet",
  chalet: "Casa / Chalet",
  rustic: "Casa rústica",
  room: "Habitación",
  habitacion: "Habitación",
  commercial: "Local o nave",
  local: "Local o nave",
  garage: "Garaje",
  office: "Oficina",
  land: "Terreno",
  storage: "Trastero",
  building: "Edificio",
};
