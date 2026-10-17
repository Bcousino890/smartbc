import type { PermissionAction, PermissionResource } from "@/lib/permissions";

/**
 * Qué hace de verdad cada permiso (sección × acción), en lenguaje llano.
 *
 * Sale de la auditoría del código (docs/PERMISOS_ANALISIS_DETALLADO.md, §4): dice
 * lo que el servidor comprueba hoy, no lo que la matriz sugiere. Lo que no consta
 * en ninguna pantalla se dice así, para que nadie crea que un interruptor protege
 * algo que no protege. Si cambia una ruta, se actualiza aquí.
 */
export const NO_USE = "No consta ninguna pantalla que use este permiso.";

type Details = Partial<Record<PermissionAction, string>>;

export const PERMISSION_DETAILS: Record<PermissionResource, Details> = {
  properties: {
    view: "Ver la cartera de propiedades.",
    create: "Dar de alta propiedades.",
    edit: "Editar fichas, fotos, vídeos, planos, etiquetas y enlaces de compartir. Hoy también permite publicar la propiedad en la web.",
    delete: "Borrar propiedades de forma permanente.",
    export: "Descargar las fotos y el vídeo de una propiedad.",
    publish: "Pensado para el interruptor de la web pública; hoy ninguna pantalla lo comprueba (lo decide «Editar»).",
  },
  agencias: {
    view: "Ver las agencias colaboradoras y sus condiciones (solo España).",
    create: "Sin efecto hoy: no hay pantallas para crear agencias.",
    edit: "Sin efecto hoy: no hay pantallas para editar agencias.",
    delete: "Sin efecto hoy: no hay pantallas para borrar agencias.",
  },
  particulares: {
    view: "Ver los anuncios de particulares, su enriquecimiento y la geolocalización (solo España).",
    edit: "Refrescar anuncios y manejar el control del scraper (presupuesto, claves, pausa).",
  },
  publicacion: {
    view: "Entrar a Publicación (Idealista, PortalInmobiliario).",
    edit: "Guardar anuncios de Idealista y subir fotos y planos.",
    export: "Descargar el vídeo de un anuncio de Idealista.",
    publish: "Sin efecto: publicar en PortalInmobiliario solo pueden Propietario y Administrador, sea cual sea este interruptor.",
  },
  captaciones: {
    view: "Ver captaciones (Chile). Cuáles: todas, solo las confirmadas y propias, o solo las asignadas, según el perfil.",
    create: "Crear captaciones.",
    edit: "Editar captaciones y comprobar WhatsApp. Los campos editables dependen del perfil.",
    delete: "Borrar captaciones.",
  },
  clientes: {
    view: "Ver el listado y la ficha de clientes. Si ve todos o solo los suyos lo fija el perfil.",
    create: "Sin efecto hoy: los clientes se crean desde Usuarios y Solicitudes con reglas de perfil.",
    edit: "Editar la ficha del cliente, su encargo y su asignación.",
  },
  solicitudes: {
    view: "Ver solicitudes de información y visitas, y la pantalla de Documentación.",
    create: "Crear solicitudes de visita.",
    edit: "Editar solicitudes.",
  },
  documentacion: {
    view: "Sin efecto hoy: la pantalla de Documentación se controla con «Solicitudes y visitas».",
    create: "Sin efecto hoy: la pantalla de Documentación se controla con «Solicitudes y visitas».",
    edit: "Sin efecto hoy: la pantalla de Documentación se controla con «Solicitudes y visitas».",
    delete: "Sin efecto hoy: la pantalla de Documentación se controla con «Solicitudes y visitas».",
    export: "Sin efecto hoy: la pantalla de Documentación se controla con «Solicitudes y visitas».",
    publish: "Sin efecto hoy: la pantalla de Documentación se controla con «Solicitudes y visitas».",
  },
  mensajes: {
    view: "Ver la bandeja y los archivos de las conversaciones de WhatsApp.",
    create: "Enviar archivos por WhatsApp.",
    edit: "Marcar como leídos los mensajes del chat del equipo.",
  },
  reportes: {
    view: "Ver la pantalla de Reportes.",
    export: "Sin efecto hoy: ninguna pantalla exporta con este permiso.",
  },
  usuarios: {
    view: "Entrar a la pantalla Usuarios.",
    create: "Poco efecto: crear cuentas lo decide el rango del perfil (Propietario o Administrador), no este interruptor.",
    edit: "Poco efecto: editar cuentas, cambiar perfil o enviar enlaces de contraseña lo decide el rango del perfil.",
    delete: "Sin efecto: no existe borrar usuarios.",
  },
  configuracion: {
    view: "Ver Configuración, integraciones y demo.",
    edit: "Editar los clientes de integración.",
    delete: "Borrar claves de integración.",
  },
  sindicacion: {
    view: "Ver la pantalla de Sindicación y sus feeds (solo España).",
  },
  diagnostico: {
    view: "Sin efecto hoy: la pantalla se retiró. Las herramientas de salud son solo para Propietario y Administrador.",
    create: "Sin efecto hoy: la pantalla se retiró.",
    edit: "Sin efecto hoy: la pantalla se retiró.",
    delete: "Sin efecto hoy: la pantalla se retiró.",
    export: "Sin efecto hoy: la pantalla se retiró.",
    publish: "Sin efecto hoy: la pantalla se retiró.",
  },
  calendario: {
    view: "Ver la agenda, las citas y los eventos.",
    create: "Crear eventos y citas (también desde las colecciones de visitas).",
    edit: "Editar eventos.",
    delete: "Borrar eventos.",
  },
  viewing_collections: {
    view: "Ver las colecciones de un cliente y sus enlaces de portales.",
    create: "Añadir propiedades y crear selecciones e itinerarios de visitas.",
    edit: "Editar selecciones de visitas.",
    delete: "Borrar selecciones de visitas.",
    publish: "Generar, renovar y revocar el enlace público que ve el cliente.",
  },
};

export function permissionDetail(resource: PermissionResource, action: PermissionAction): string {
  return PERMISSION_DETAILS[resource]?.[action] ?? NO_USE;
}

/** ¿El texto avisa de que el interruptor no hace (casi) nada? */
export function isIdlePermission(text: string): boolean {
  return text === NO_USE || text.startsWith("Sin efecto") || text.startsWith("Poco efecto");
}
