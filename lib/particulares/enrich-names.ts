// Listas para la extracción del responsable (nombre de la persona) desde la
// descripción de un anuncio de particulares. Todo en minúsculas y SIN tildes
// (se compara con `foldWord`).

/** Nombres de pila españoles (y los extranjeros más habituales en Madrid) — sin tildes. */
export const FIRST_NAMES: ReadonlySet<string> = new Set(
  `abel abraham adela adolfo adrian adriana agustin aida alba albert alberto alejandra alejandro alex alexandra alfonso alfredo alicia alina alison alisson almudena alvaro amalia amanda amaia amparo ana anabel andrea andres angel angela angeles angelica anna antonia antonio arancha aranzazu ariadna armando arturo asuncion aurora barbara beatriz begona belen benito bernardo blanca borja bruno camila camilo candela carla carlos carlota carmen carolina cayetano cecilia celia cesar charo christian cristian cristina cristobal daniel dani dario david debora diana diego dolores domingo dora edgar eduardo elena eli elisa elisabeth elvira emilia emilio emma enrique ernesto esperanza esteban estefania estela esther eugenia eugenio eva fabian fatima federico felipe felix fernanda fernando francisca francisco gabriel gabriela gema gerard gerardo german gloria gonzalo gregorio guadalupe guillermo gustavo hector helena hernan hugo ignacio ines inma inmaculada irene irina isaac isabel isidro ismael ivan jacobo jaime javi javier jennifer jessica jesus joan joaquin jorge jose josefa josefina josep joseluis juan juana judith julia julian julio karen katia katherine kevin laia lara laura leire leo leonor leticia lidia lola lorena lorenzo lourdes lucas lucia luciano lucio luis luisa luz macarena manolo manuel manuela mar marcela marcelo marcos margarita maria mariano marina mario marisa marisol marta martin mateo matias mauricio maxi mayte mercedes michael miguel mireia miriam mohamed monica montserrat natalia natividad nerea nicolas nieves noelia nuria olga oliver omar oscar oriol pablo paloma pamela paola patricia patxi paula paz pedro pepe pepa pilar pol rafael rafa raimundo ramon raquel raul rebeca regina reyes ricardo rios roberto rocio rodrigo rodolfo roger rosa rosario ruben ruth salvador samuel sandra santiago sara sebastian sergio silvia simon sofia soledad sonia soraya stefano susana tamara tania teresa tomas toni trini trinidad ursula valentina valeria valentin vanesa vega veronica vicente victor victoria violeta virginia xavier yolanda yago yara zoe`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Nombres que también son palabra común, barrio, calle o estación («Sol», «Pilar»,
 * «Rosa», «Mar»…): solo se aceptan con una fórmula personal inequívoca («soy…»,
 * «llamar a…», «un saludo,…»), nunca tras un simple «contacto:».
 */
export const AMBIGUOUS_NAMES: ReadonlySet<string> = new Set([
  "mar", "sol", "luz", "rosa", "pilar", "paz", "cruz", "victoria", "nieves", "reyes", "rios", "vega",
  "angeles", "amparo", "esperanza", "soledad", "dolores", "mercedes", "trinidad", "asuncion",
  "guadalupe", "natividad", "regina", "oliver", "simon", "martin", "german", "angel", "julian",
  "leo", "eli", "dani", "pol", "alex", "maxi", "inma", "pepe", "pepa", "toni", "rafa", "charo",
]);

/** Valores de `owner_name` que NO son una persona (el responsable real aún no se conoce). */
export function isGenericOwnerName(name: string | null | undefined): boolean {
  const t = foldWord((name ?? "").trim());
  if (!t) return true;
  // El crawler a veces deja el TÍTULO del anuncio en owner_name («Alquiler de piso en Calle de…, 155»).
  if (/^(?:(?:alquiler|venta)\s+de\s+)?(?:piso|apartamento|atico|chalet|casa|duplex|estudio|loft|local|finca|flat|studio|penthouse|villa)\b.*\b(?:en|in|for)\b/.test(t)) return true;
  // un número de teléfono no es un nombre
  if (/^[+0-9 ]{7,}$/.test(t)) return true;
  return /^(?:particular|anuncio particular|particular a particular|propietari[oa]|anunciante|privado|usuario|contacto|vendedor[a]?|sin nombre|n\/a|idealista|fotocasa|pisos\.com)(?:\s*[.\-]*)$/.test(
    t.replace(/\s+/g, " "),
  );
}

/** Palabras que NUNCA son un nombre aunque vayan capitalizadas tras un «contacto:». */
export const NAME_STOPWORDS: ReadonlySet<string> = new Set(
  `madrid barcelona valencia calle avenida plaza paseo camino ronda inmobiliaria inmobiliarias agencia agencias propietario propietaria particular particulares whatsapp wasap telefono tel tlf movil email correo mail chat idealista fotocasa portal web pagina visita visitas informacion info perfil para por con sin solo unicamente exclusivamente directamente favor contacto contactar llamar llamada mensaje mensajes lunes martes miercoles jueves viernes sabado domingo hola gracias saludos saludo buenas buenos disponible disponibilidad precio alquiler venta piso casa chalet atico estudio local garaje cerca junto zona barrio metro estacion centro norte sur este oeste real estate group grupo gestion gestoria asesor asesores equipo departamento comercial administracion oficina oficinas servicios servicio propiedades property properties homes home rentals rental inversores inversion abstenerse abstenganse abstenerme escribeme escribenos escribirme escribir llamame llamadme llamenos contactame contactenos contactanos atendemos atiendo horario horarios pegado pegada no si sino solo tambien ademas exclusivo exclusiva preferiblemente preferible mejor mañana manana hoy ahora ya caracteristicas basicas datos nuestro nuestra nosotros nosotras interesados interesadas ver dejar enviar escribir escribirme atencion horario tardes mananas noches importante mas nada todo todos todas el la los las un una unos unas de del y o u en`
    .split(/\s+/)
    .filter(Boolean),
);

/** Minúsculas sin tildes (una palabra o frase). Conserva la «ñ» como «n». */
export function foldWord(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** «MARÍA JOSÉ» / «maría josé» → «María José». */
export function titleCaseName(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
