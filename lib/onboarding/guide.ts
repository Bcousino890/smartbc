/**
 * Guía de inicio para usuarios nuevos del panel (`/{país}/admin/guia`).
 *
 * La guía NO es un texto fijo: se arma con los permisos EFECTIVOS del usuario
 * en el país activo (rol, rol por país, rol personalizado y excepciones ya
 * aplicados) y con la MISMA regla de visibilidad que el menú lateral
 * (`isNavItemVisible`, `lib/admin-nav.ts`). Así nunca le explica a nadie un
 * módulo que no ve ni un botón que el servidor le va a rechazar:
 *   - cada módulo del menú tiene aquí su ficha (`MODULE_GUIDES`, por `href`);
 *   - cada paso declara el permiso que necesita (`needs`), el mismo que
 *     comprueba la acción o la ruta del servidor que hay detrás.
 *
 * Puro (sin BD ni React): lo vigila `npm run test:onboarding-guide`, que falla
 * si un módulo del menú se queda sin ficha en la guía.
 */
import {
  isNavItemInCountry,
  isNavItemVisible,
  NAV_ITEMS,
  type NavItem,
} from "@/lib/admin-nav";
import {
  getViewRestriction,
  PERMISSION_ACTIONS,
  type EffectivePermissions,
  type PermissionAction,
  type PermissionResource,
} from "@/lib/permissions";

export type GuideStep = {
  text: string;
  /**
   * Permiso necesario para que el paso aparezca. Sin `resource`, se usa el del
   * módulo. Sin `needs`, el paso se enseña a todo el que ve el módulo.
   */
  needs?: { action: PermissionAction; resource?: PermissionResource };
  /** Solo en ese país (p.ej. lo que depende de Idealista). */
  onlyCountry?: "es" | "cl";
};

export type ModuleGuide = {
  /** Mismo `href` que en `NAV_ITEMS`. */
  href: string;
  title: string;
  summary: string;
  steps: GuideStep[];
};

export const ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  advisor: "Asesor",
  agent_admin: "Agente Admin",
  agent_senior: "Agente Senior",
  agent_junior: "Agente Junior",
  captadora: "Captadora",
  viewer: "Visualizador",
};

/** Qué significa cada rol, con sus permisos POR DEFECTO (sin excepciones). */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner:
    "Acceso total al CRM en los dos países, incluida la gestión de usuarios y de sus permisos.",
  admin:
    "Acceso total al CRM en los dos países, incluida la gestión de usuarios y de sus permisos.",
  advisor:
    "Gestiona la cartera completa de su país: propiedades, clientes, solicitudes, captaciones y publicación. Ve el equipo, pero no lo gestiona.",
  agent_admin:
    "Coordina al equipo: crea, edita, borra y exporta en casi todos los módulos, gestiona usuarios (sin borrarlos) y ajusta la configuración.",
  agent_senior:
    "Crea y edita propiedades, clientes, solicitudes, captaciones y publicaciones, y ve los reportes. No borra registros ni gestiona usuarios.",
  agent_junior:
    "Consulta propiedades, clientes, solicitudes, documentación y mensajes, y prepara selecciones e itinerarios de visitas para sus clientes. Para crear o editar fichas, pide el permiso a un administrador.",
  captadora:
    "Trabaja las captaciones que se le asignan: las consulta, registra los intentos de contacto y completa los datos del dueño.",
  viewer: "Solo lectura de los módulos que un administrador le haya abierto.",
};

export const COUNTRY_LABELS: Record<string, string> = { es: "España", cl: "Chile" };

export const MODULE_GUIDES: readonly ModuleGuide[] = [
  {
    href: "/admin",
    title: "Dashboard",
    summary: "Tu punto de partida: el resumen de la actividad del CRM en el país activo.",
    steps: [
      {
        text: "Arriba tienes los indicadores clave: propiedades activas, clientes, visitas pendientes y SmartLinks.",
      },
      {
        text: "Debajo, las últimas propiedades y las últimas solicitudes de visita. «Ver todas →» te lleva al módulo completo.",
      },
      {
        text: "La tarjeta «Hola …» resume con IA los contactos del día y te sugiere qué hacer con alguna ficha de Idealista.",
        onlyCountry: "es",
      },
    ],
  },
  {
    href: "/admin/agencias",
    title: "Agencias",
    summary: "Las agencias colaboradoras y cuántas propiedades tiene disponibles cada una, en tiempo real.",
    steps: [
      { text: "Abre una agencia para ver su cartera y sus datos." },
      { text: "Da de alta agencias nuevas.", needs: { action: "create" } },
    ],
  },
  {
    href: "/admin/propiedades",
    title: "Propiedades",
    summary: "El catálogo: las propiedades propias y las de las agencias colaboradoras.",
    steps: [
      {
        text: "Busca por referencia (BC-…), zona, precio u operación y abre la ficha para ver fotos, datos y estado.",
      },
      {
        text: "Desde la ficha puedes verla como la vería el cliente, copiar su SmartLink o descargar el PDF.",
      },
      {
        text: "Crea una propiedad nueva o impórtala pegando el enlace del anuncio («Importar por link»).",
        needs: { action: "create" },
      },
      {
        text: "Edita la ficha: datos, ubicación en el mapa, fotos (arrastra para cambiar el orden), vídeos de hasta 500 MB y planos de hasta 100 MB.",
        needs: { action: "edit" },
      },
      {
        text: "«Generar vídeo» monta un vídeo con las fotos, el logo y música. «Generar distribución (IA)» dibuja un plano aproximado — no a escala — a partir de las fotos.",
        needs: { action: "edit" },
      },
      {
        text: "SmartLinks: crea un enlace único por cada envío y verás cuándo y cuántas veces lo abre el cliente.",
        needs: { action: "edit" },
      },
      {
        text: "Eliminar una propiedad es definitivo: hazlo solo si de verdad sobra.",
        needs: { action: "delete" },
      },
    ],
  },
  {
    href: "/admin/particulares",
    title: "Particulares",
    summary:
      "Anuncios de particulares (no agencias) detectados en los portales: la oportunidad de llamar antes que la competencia.",
    steps: [
      { text: "Filtra por zona, precio y fecha para ver lo nuevo y abre un anuncio para ver su ficha y el teléfono, si lo hay." },
      {
        text: "Crea un enlace temporal en español para enseñar el anuncio a un cliente: sale sin los datos de contacto del particular.",
      },
      {
        text: "Apunta cada llamada, asígnate el anuncio o márcalo como verificado o inactivo.",
        needs: { action: "edit" },
      },
      {
        text: "Cuando lo captes, conviértelo en propiedad nuestra sin volver a escribir los datos.",
        needs: { action: "create", resource: "properties" },
      },
    ],
  },
  {
    href: "/admin/publicacion",
    title: "Publicación",
    summary: "Llevar las propiedades a los portales (Idealista en España, PortalInmobiliario en Chile).",
    steps: [
      { text: "Consulta qué está publicado, en qué portal y con qué estado." },
      { text: "Prepara la ficha de un portal: textos, fotos, planos y ubicación.", needs: { action: "create" } },
      { text: "Edita una publicación y vuelve a enviarla al portal.", needs: { action: "edit" } },
      { text: "Retira una publicación.", needs: { action: "delete" } },
    ],
  },
  {
    href: "/admin/captaciones",
    title: "Captaciones",
    summary: "Las propiedades que estamos intentando captar: el dueño, cada intento de contacto y su estado.",
    steps: [
      { text: "Abre una captación para ver los datos de la propiedad, del dueño y el historial de intentos." },
      { text: "Registra cada intento de contacto y completa o corrige los datos del dueño.", needs: { action: "edit" } },
      { text: "Crea captaciones nuevas.", needs: { action: "create" } },
      {
        text: "Cuando se confirma, conviértela en propiedad: la ficha y las fotos pasan solas.",
        needs: { action: "create", resource: "properties" },
      },
    ],
  },
  {
    href: "/admin/idealista",
    title: "Idealista",
    summary:
      "Las fichas preparadas para Idealista («Fichas guardadas»), su publicación en tiempo real y los contactos que llegan desde el portal.",
    steps: [
      { text: "Revisa las fichas guardadas: cuáles están publicadas, en borrador o con error." },
      {
        text: "«Sugerencias IA» te dice qué ficha bajar de precio, cuál retirar y cuál publicar, con los contactos reales de cada una. Solo sugiere: nunca cambia nada sola.",
        needs: { action: "edit", resource: "properties" },
      },
      { text: "Edita una ficha y publícala o actualízala en Idealista desde el propio CRM.", needs: { action: "edit" } },
      {
        text: "Todo lo que se pueda hacer desde aquí, hazlo desde aquí y no desde el área privada de Idealista: tocarlo allí a mano puede bloquear la conexión.",
        needs: { action: "edit" },
      },
    ],
  },
  {
    href: "/admin/clientes",
    title: "Clientes",
    summary: "La ficha de cada cliente: qué busca (el encargo), qué le hemos enseñado y qué le gusta.",
    steps: [
      { text: "Abre un cliente para ver su encargo, sus propiedades sugeridas, sus anuncios de portales y su historial." },
      {
        text: "«Nuevo cliente»: el formulario cambia según sea venta o alquiler; rellena lo que sepas, lo que falte se completa después.",
        needs: { action: "create" },
      },
      {
        text: "Edita «El encargo del cliente»: cuanto más completo, mejores «Propiedades sugeridas». Desde ahí puedes mandarle una por correo.",
        needs: { action: "edit" },
      },
      {
        text: "Anuncios de portales: los pisos que se marcan en Idealista o Fotocasa con la extensión de Chrome llegan aquí para llamar, descartar o convertir en ficha.",
        needs: { action: "view", resource: "viewing_collections" },
      },
      {
        text: "Monta la selección de propiedades del cliente y el itinerario de visitas.",
        needs: { action: "create", resource: "viewing_collections" },
      },
      {
        text: "Publica la colección privada del itinerario: el cliente la abre con su enlace, sin entrar al CRM, y puede puntuar cada piso.",
        needs: { action: "publish", resource: "viewing_collections" },
      },
    ],
  },
  {
    href: "/admin/solicitudes",
    title: "Solicitudes",
    summary: "Las peticiones de información y de visita que llegan de los portales y de la web, separadas por venta y alquiler.",
    steps: [
      { text: "Filtra por venta, alquiler o «sin determinar» y abre una solicitud para ver el contacto y la propiedad que miró." },
      { text: "Responde, prepara la visita o vincula la solicitud a un cliente.", needs: { action: "edit" } },
    ],
  },
  {
    href: "/admin/solicitudes-documentacion",
    title: "Documentación",
    summary: "La documentación que piden los propietarios a los candidatos de alquiler o compra (nóminas, contratos, avales…).",
    steps: [
      { text: "Mira qué documentos ha subido cada candidato y cuáles faltan." },
      { text: "Pide documentos y marca cada uno como verificado o rechazado.", needs: { action: "edit" } },
    ],
  },
  {
    href: "/admin/calendario",
    title: "Calendario",
    summary: "Las visitas y los eventos del equipo. El número junto a «Calendario» en el menú son las visitas pendientes.",
    steps: [
      { text: "Revisa las visitas del día y de la semana." },
      { text: "Crea una visita o un evento.", needs: { action: "create" } },
      { text: "Confirma, reprograma o rechaza las visitas pendientes.", needs: { action: "edit" } },
    ],
  },
  {
    href: "/admin/mensajes",
    title: "Mensajes",
    summary: "Todas las conversaciones en un sitio: clientes, WhatsApp, el chat interno del equipo y la bandeja de Zinto.",
    steps: [
      {
        text: "Pestañas: «Clientes» (mensajes del portal del cliente), «WhatsApp», «Equipo» (chat interno) y «Zinto».",
      },
      {
        text: "Escribe a un cliente por WhatsApp o al equipo por el chat interno. Con el clip 📎 adjuntas fotos, vídeos o documentos de hasta 10 MB.",
        needs: { action: "create" },
      },
      {
        text: "Cambia el nombre o el correo de un contacto de WhatsApp desde la cabecera del chat.",
        needs: { action: "edit" },
      },
    ],
  },
  {
    href: "/admin/correo",
    title: "Correo",
    summary: "Tu buzón @bcousinoprop.com dentro del CRM: leer, responder, reenviar y adjuntar sin salir del panel.",
    steps: [
      {
        text: "La primera vez, conecta tu correo con la contraseña del webmail (no la del CRM). Se comprueba con el servidor y se guarda cifrada: no te la vuelve a pedir.",
      },
      { text: "La firma se pone sola en cada envío. Si quieres otra, cámbiala con el botón «Firma»." },
      {
        text: "Adjuntos de hasta 100 MB por archivo: lo que no cabe en un correo normal se envía solo como enlace de descarga.",
      },
    ],
  },
  {
    href: "/admin/sindicacion",
    title: "Sindicación",
    summary: "La sincronización con las webs de las agencias colaboradoras: marca de agua y archivado automático.",
    steps: [{ text: "Revisa el estado de cada sincronización y sus últimos resultados." }],
  },
  {
    href: "/admin/reportes",
    title: "Reportes",
    summary: "Estadísticas, comisiones y análisis de la actividad.",
    steps: [
      { text: "Elige el periodo y revisa la actividad y las comisiones." },
      { text: "Descarga los datos para trabajarlos fuera.", needs: { action: "export" } },
    ],
  },
  {
    href: "/admin/usuarios",
    title: "Usuarios",
    summary: "Las cuentas del equipo y lo que puede hacer cada una.",
    steps: [
      { text: "Consulta quién forma parte del equipo, con qué rol y en qué país." },
      {
        text: "Crea una cuenta: la persona recibe un correo para elegir su contraseña y entra ya verificada.",
        needs: { action: "create" },
      },
      {
        text: "Cambia el rol o el país de alguien, o ajusta sus permisos uno a uno con el botón «Permisos».",
        needs: { action: "edit" },
      },
    ],
  },
  {
    href: "/admin/diagnostico",
    title: "Diagnóstico",
    summary: "Herramientas técnicas para comprobar que las integraciones y procesos automáticos funcionan.",
    steps: [{ text: "Úsalo cuando algo falle y te lo pida soporte: no cambia datos." }],
  },
  {
    href: "/admin/demo-setup",
    title: "Demo Setup",
    summary: "Crea clientes y solicitudes de documentación de ejemplo para enseñar el CRM.",
    steps: [{ text: "Genera los datos de demostración con un clic.", needs: { action: "edit" } }],
  },
  {
    href: "/admin/integraciones",
    title: "Integraciones",
    summary: "Los sistemas externos autorizados a crear y actualizar captaciones por API.",
    steps: [
      { text: "Consulta qué integraciones están activas y sus últimas peticiones." },
      { text: "Da de alta una integración y genera su clave de acceso.", needs: { action: "create" } },
      { text: "Revoca una clave o una integración que ya no se use.", needs: { action: "delete" } },
    ],
  },
  {
    href: "/admin/configuracion",
    title: "Configuración",
    summary: "Los ajustes generales: correo automático (AWS SES), WhatsApp/Zinto, Idealista, IA y tareas de mantenimiento.",
    steps: [
      { text: "Revisa el estado de cada integración." },
      { text: "Cambia los ajustes. Afectan a todo el equipo: si dudas, pregunta antes.", needs: { action: "edit" } },
    ],
  },
];

export type GuideModuleView = {
  href: string;
  title: string;
  summary: string;
  /** Acciones que tiene sobre el recurso del módulo (vacío si no tiene recurso). */
  actions: PermissionAction[];
  steps: string[];
};

export type GuideView = {
  modules: GuideModuleView[];
  /** Módulos que existen en el país activo pero que este usuario no ve. */
  hidden: { href: string; title: string }[];
  /** Avisos de alcance de datos (solo ves los tuyos, solo las asignadas…). */
  scopeNotes: string[];
};

function guideFor(href: string): ModuleGuide | undefined {
  return MODULE_GUIDES.find((g) => g.href === href);
}

function stepAllowed(
  step: GuideStep,
  item: NavItem,
  permissions: EffectivePermissions,
  country: string,
): boolean {
  if (step.onlyCountry && step.onlyCountry !== country) return false;
  if (!step.needs) return true;
  const resource = step.needs.resource ?? item.permissionResource;
  if (!resource) return true;
  return permissions[resource]?.[step.needs.action] === true;
}

/**
 * Notas de alcance según el rol, con la misma política que aplican los
 * listados (`getViewRestriction` → `resolveViewScope`). Solo para módulos que
 * el usuario ve.
 */
export function buildScopeNotes(
  role: string,
  permissions: EffectivePermissions,
  country: string,
): string[] {
  const notes: string[] = [];
  const sees = (r: PermissionResource) => permissions[r]?.view === true;

  const ownClients = (["clientes", "solicitudes", "viewing_collections"] as const).filter((r) => {
    const restriction = getViewRestriction(role, r);
    return sees(r) && (restriction === "own_only" || restriction === "team");
  });
  if (ownClients.length > 0) {
    notes.push(
      "Ves los clientes que tienes asignados como asesor (y sus solicitudes y colecciones), no los de todo el equipo. Si te falta alguno, pide que te lo asignen.",
    );
  }

  if (country === "cl" && sees("captaciones")) {
    const r = getViewRestriction(role, "captaciones");
    if (r === "assigned_only") {
      notes.push("En Captaciones solo ves las que te han asignado a ti.");
    } else if (r === "own_only") {
      notes.push("En Captaciones ves las que creaste tú y las ya confirmadas (para convertirlas en propiedad).");
    }
  }
  return notes;
}

/**
 * Arma la guía de un usuario: los módulos de su menú (misma regla que el
 * sidebar), sus acciones permitidas y solo los pasos que puede hacer.
 */
export function buildGuide(input: {
  role: string;
  permissions: EffectivePermissions;
  country: string;
}): GuideView {
  const { role, permissions, country } = input;
  const modules: GuideModuleView[] = [];
  const hidden: { href: string; title: string }[] = [];

  for (const item of NAV_ITEMS) {
    if (item.href === "/admin/guia") continue;
    if (!isNavItemInCountry(item, country)) continue;
    const guide = guideFor(item.href);
    if (!guide) continue;

    if (!isNavItemVisible(item, permissions, country)) {
      hidden.push({ href: item.href, title: guide.title });
      continue;
    }

    const resource = item.permissionResource;
    modules.push({
      href: item.href,
      title: guide.title,
      summary: guide.summary,
      actions: resource
        ? PERMISSION_ACTIONS.filter((a) => permissions[resource]?.[a] === true)
        : [],
      steps: guide.steps
        .filter((s) => stepAllowed(s, item, permissions, country))
        .map((s) => s.text),
    });
  }

  return { modules, hidden, scopeNotes: buildScopeNotes(role, permissions, country) };
}

/** `href`s del menú sin ficha en la guía (debe estar vacío; lo vigila el test). */
export function navItemsWithoutGuide(): string[] {
  return NAV_ITEMS.filter((i) => i.href !== "/admin/guia" && !guideFor(i.href)).map((i) => i.href);
}
