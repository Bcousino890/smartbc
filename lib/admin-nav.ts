/**
 * Menú lateral del panel (`components/admin-sidebar.tsx`) — la lista vive aquí
 * para que la Guía de inicio (`/admin/guia`, `lib/onboarding/guide.ts`) enseñe
 * EXACTAMENTE los mismos módulos que ve cada usuario en su menú, con la misma
 * regla de visibilidad (`isNavItemVisible`). Si añades un módulo al menú,
 * añade también su entrada en la guía: `npm run test:onboarding-guide` falla
 * si falta.
 *
 * Sin dependencias de React a propósito (el icono va por nombre): así se puede
 * importar desde scripts de Node sin pasar por Next.
 */
import type { EffectivePermissions, PermissionResource } from "@/lib/permissions";

export type NavIconName =
  | "LayoutDashboard"
  | "BookOpen"
  | "Building2"
  | "Home"
  | "User"
  | "Send"
  | "Globe2"
  | "Sparkles"
  | "Users"
  | "ClipboardList"
  | "FileStack"
  | "Calendar"
  | "MessageSquare"
  | "Mail"
  | "Radio"
  | "BarChart3"
  | "UserCog"
  | "Stethoscope"
  | "Plug"
  | "Settings";

export type NavItem = {
  /** Ruta sin país (`/admin/...`); el sidebar le pone `/es` o `/cl` delante. */
  href: string;
  labelKey: string;
  icon: NavIconName;
  /** Recurso de permisos: el item solo se ve con `view` efectivo sobre él. */
  permissionResource?: PermissionResource;
  /** Si se define, el item solo existe en ese país. */
  onlyCountry?: "es" | "cl";
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/admin",                    labelKey: "admin.nav.dashboard",     icon: "LayoutDashboard" },
  // Sin recurso de permisos: la guía se adapta sola a lo que cada uno puede hacer.
  { href: "/admin/guia",               labelKey: "admin.nav.guia",          icon: "BookOpen" },
  { href: "/admin/agencias",           labelKey: "admin.nav.agencias",      icon: "Building2",     permissionResource: "agencias",     onlyCountry: "es" },
  { href: "/admin/propiedades",        labelKey: "admin.nav.propiedades",   icon: "Home",          permissionResource: "properties"    },
  // Particulares = anuncios scrapeados de Idealista → solo tiene sentido en España.
  // Estado del scraper y sus frecuencias vive plegado dentro de esta misma
  // página ("Configuración scraper Idealista"), no como entrada aparte.
  { href: "/admin/particulares",       labelKey: "admin.nav.particulares",  icon: "User",          permissionResource: "particulares", onlyCountry: "es" },
  // Antes apuntaba a "properties": el toggle "Publicación" del panel de
  // permisos no controlaba este enlace ni coincidía con el recurso que ya
  // usan las rutas /api/admin/publicacion/* (requirePermission("publicacion", ...)).
  { href: "/admin/publicacion",        labelKey: "admin.nav.publicacion",   icon: "Send",          permissionResource: "publicacion"   },
  { href: "/admin/captaciones",        labelKey: "admin.nav.captaciones",   icon: "Globe2",        permissionResource: "captaciones",  onlyCountry: "cl" },
  // Idealista es la integración de publicación con ese portal → mismo
  // recurso que /admin/publicacion (antes "properties", desalineado).
  { href: "/admin/idealista",          labelKey: "admin.nav.idealista",     icon: "Sparkles",      permissionResource: "publicacion",  onlyCountry: "es" },
  { href: "/admin/clientes",           labelKey: "admin.nav.clientes",      icon: "Users",         permissionResource: "clientes"      },
  { href: "/admin/solicitudes",        labelKey: "admin.nav.solicitudes",   icon: "ClipboardList", permissionResource: "solicitudes"   },
  { href: "/admin/solicitudes-documentacion", labelKey: "admin.nav.solicitudes_doc", icon: "FileStack", permissionResource: "solicitudes" },
  { href: "/admin/calendario",         labelKey: "admin.nav.calendario",    icon: "Calendar",      permissionResource: "calendario"    },
  { href: "/admin/mensajes",           labelKey: "admin.nav.mensajes",      icon: "MessageSquare", permissionResource: "mensajes"      },
  // Sin recurso de permisos a propósito: es el buzón PERSONAL de cada
  // usuario del staff (@bcousinoprop.com), no un módulo compartido.
  { href: "/admin/correo",             labelKey: "admin.nav.correo",        icon: "Mail"                                               },
  { href: "/admin/sindicacion",        labelKey: "admin.nav.sindicacion",   icon: "Radio",         permissionResource: "sindicacion",  onlyCountry: "es" },
  { href: "/admin/reportes",           labelKey: "admin.nav.reportes",      icon: "BarChart3",     permissionResource: "reportes"      },
  { href: "/admin/usuarios",           labelKey: "admin.nav.usuarios",      icon: "UserCog",       permissionResource: "usuarios"      },
  { href: "/admin/diagnostico",        labelKey: "admin.nav.diagnostico",   icon: "Stethoscope",   permissionResource: "diagnostico",  onlyCountry: "es" },
  { href: "/admin/demo-setup",         labelKey: "admin.nav.demo_setup",    icon: "Sparkles",      permissionResource: "configuracion" },
  { href: "/admin/integraciones",      labelKey: "admin.nav.integraciones", icon: "Plug",          permissionResource: "configuracion" },
  { href: "/admin/configuracion",      labelKey: "admin.nav.configuracion", icon: "Settings",      permissionResource: "configuracion" },
];

/** ¿Existe este módulo en el país activo? (independiente de los permisos) */
export function isNavItemInCountry(item: NavItem, country: string): boolean {
  return !item.onlyCountry || item.onlyCountry === country;
}

/**
 * Regla única de visibilidad del menú: el módulo existe en el país activo y,
 * si tiene recurso de permisos, el usuario tiene `view` EFECTIVO sobre él
 * (rol, rol por país, rol personalizado y excepciones ya aplicados).
 */
export function isNavItemVisible(
  item: NavItem,
  permissions: EffectivePermissions,
  country: string,
): boolean {
  if (!isNavItemInCountry(item, country)) return false;
  if (!item.permissionResource) return true;
  return permissions[item.permissionResource]?.view === true;
}
