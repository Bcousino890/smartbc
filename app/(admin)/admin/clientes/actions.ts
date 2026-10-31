"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireStaff } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { assertPermission } from "@/lib/auth/guard";
import { canActOnClient } from "@/lib/db/queries/view-scope";
import { createInvitedUser } from "@/lib/email/password-reset";
import type { ClientProfileType, Operation, StayType } from "@/lib/types";
import {
  buildPreferencesPayload,
  cleanPolygons,
  validateBrief,
  type BriefInput,
  type BriefProfile,
} from "@/lib/clients/brief";
import { setClientProfileTag } from "@/lib/clients/profile-tag";
import { loadZoneCatalog, type ZoneCatalog } from "@/lib/clients/zone-catalog";

export type SaveClientPreferencesResult =
  | { ok: true }
  | { ok: false; error: string };

// `saveClientPreferences` (el editor de seis campos del panel lateral del
// listado) se retiró el 2026-10-01: al guardar reducía las zonas a una sola y
// escribía la estancia también en venta. El encargo se guarda solo con
// `saveClientPreferencesFull` (ficha) y `createClientWithBrief` (alta), que
// comparten `buildPreferencesPayload`.

export type CreateClientInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  profileType: ClientProfileType;
  sector: string;
  operation: Operation;
  stayType: StayType;
  preferredZones: string[]; // múltiples zonas
  selectedSubzones: Record<string, string[]>; // zona -> subzonas
  budgetMin: number;
  budgetMax: number;
  minBedrooms?: number;
  minBathrooms?: number;
  minSquareMeters?: number;
  maxSquareMeters?: number;
  minUsefulSquareMeters?: number;
  maxUsefulSquareMeters?: number;
  requiresServiceBedroom?: boolean;
  minParkingSpaces?: number;
  prefersCondominium?: boolean;
  preferredArchitecturalTypes?: string[];
  preferredOrientations?: string[];
  minFloors?: number;
  // Chile: los mismos filtros que la ficha, para que lo que se marca al dar de alta se guarde.
  preferredRegions?: string[];
  preferredCommunes?: string[];
  preferredSectors?: string[];
  currencyPreference?: "CLP" | "UF";
  universities?: string;
  occupants: number;
  students: number;
  workers: number;
  pets: boolean;
  notes?: string;
  interestPolygons?: Array<{
    id: string;
    name: string;
    coordinates: number[][][];
    description?: string;
  }>;
};

// Roles que gestionan a todos los clientes: no se les asigna el cliente que dan
// de alta (eligen asesor en la ficha). Cualquier otro miembro del equipo es un
// asesor con cartera propia (`resolveViewScope`): si el cliente que crea no
// queda a su nombre, desaparece de su propio listado.
const CARTERA_LIBRE_ROLES = ["owner", "admin", "agent_admin"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assignToCreator(db: any, clientId: string, creator: { userId?: string | null; role: string }) {
  if (!creator.userId) return;
  const { error } = await db
    .from("profiles")
    .update(
      CARTERA_LIBRE_ROLES.includes(creator.role)
        ? { created_by: creator.userId }
        : { created_by: creator.userId, assigned_advisor_id: creator.userId },
    )
    .eq("id", clientId)
    .eq("role", "client");
  // El cliente ya existe: si esto falla no se deshace nada; se asigna desde la ficha.
  if (error) console.error("[assignToCreator]", error.message);
}

export type CreateClientResult =
  | { ok: true; clientId: string }
  | { ok: false; error: string };

// Preferencias de Chile del alta. Antes solo se guardaban zonas y presupuesto:
// dormitorios, baños, m², tipos, orientaciones y las zonas dibujadas en el mapa
// se perdían al crear el cliente. 0 / vacío = sin filtro (null).
function chilePreferenceColumns(input: CreateClientInput): Record<string, unknown> {
  const n = (v?: number) => (v && v > 0 ? v : null);
  const cols: Record<string, unknown> = {
    min_bedrooms: n(input.minBedrooms),
    min_bathrooms: n(input.minBathrooms),
    min_square_meters: n(input.minSquareMeters),
    max_square_meters: n(input.maxSquareMeters),
    min_useful_square_meters: n(input.minUsefulSquareMeters),
    max_useful_square_meters: n(input.maxUsefulSquareMeters),
    min_parking_spaces: n(input.minParkingSpaces),
    min_floors: n(input.minFloors),
    preferred_architectural_types: input.preferredArchitecturalTypes ?? [],
    preferred_orientations: input.preferredOrientations ?? [],
  };
  if (input.requiresServiceBedroom !== undefined) cols.requires_service_bedroom = input.requiresServiceBedroom;
  if (input.prefersCondominium !== undefined) cols.prefers_condominium = input.prefersCondominium;
  if (input.preferredRegions) cols.preferred_regions = input.preferredRegions;
  if (input.preferredCommunes) cols.preferred_communes = input.preferredCommunes;
  if (input.preferredSectors) cols.preferred_sectors = input.preferredSectors;
  if (input.currencyPreference) cols.currency_preference = input.currencyPreference;
  if (input.interestPolygons?.length) {
    cols.search_polygons = cleanPolygons(input.interestPolygons.map((p) => p.coordinates?.[0]));
  }
  return cols;
}

export async function createNewClient(
  input: CreateClientInput,
): Promise<CreateClientResult> {
  await assertPermission("clientes", "create");
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth as CreateClientResult;

  const adminClient = createAdminClient();

  // Crear usuario en auth (esto dispara el trigger handle_new_user, que crea
  // la fila en profiles), ya confirmado, y enviar por AWS SES un enlace para
  // fijar contraseña — en vez del mailer propio de Supabase Auth/GoTrue que
  // usaba inviteUserByEmail, para que todo el correo saliente pase por la
  // misma región de SES configurada en /admin/configuracion.
  const inviteResult = await createInvitedUser({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    userMetadata: { phone: input.phone },
  });

  if (!inviteResult.ok) {
    return {
      ok: false,
      error: /already been registered|already registered/i.test(inviteResult.error ?? "")
        ? "Ya existe un cliente con ese correo (puede estar en otro país o sin asignar). Búscalo por su correo."
        : inviteResult.error || "Error creating profile",
    };
  }

  const clientId = inviteResult.userId;
  await assignToCreator(adminClient as any, clientId, auth); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Este alta es el de Chile (único que lo usa): sin `country` el perfil nacía
  // como 'es' y el cliente aparecía en España, no en la lista de Chile.
  {
    const { error: profileError } = await (adminClient as any)
      .from("profiles")
      .update({ country: "cl", ...(input.phone ? { phone: input.phone } : {}) })
      .eq("id", clientId);

    if (profileError) {
      return { ok: false, error: profileError.message };
    }
  }

  // Create preferences with all selected zones and subzones
  const zonesArray = input.preferredZones || [];
  const subzonesByZone = input.selectedSubzones || {};
  const allSubzones = Object.values(subzonesByZone).flat();

  const { error: prefsError } = await adminClient
    .from("client_preferences")
    .insert({
      client_id: clientId,
      country: "cl",
      operation: input.operation === "alquiler" ? "rent" : "sale",
      stay: input.stayType === "corta" ? "short" : "long",
      zones: [...zonesArray, ...allSubzones], // Include both zones and subzones in the array
      min_price: input.budgetMin,
      max_price: input.budgetMax,
      occupants: input.occupants,
      students: input.students,
      workers: input.workers,
      pets: input.pets,
      universities: input.universities || null,
      notes: input.notes || null,
      ...chilePreferenceColumns(input),
    } as any);

  if (prefsError) {
    return { ok: false, error: prefsError.message };
  }

  // Create tag for profile type (Estudiante/Trabajador/Empresa)
  const profileTypeTagName: string | undefined = {
    student: "Estudiante",
    worker: "Trabajador",
    company: "Empresa",
    family: "Familia",
    investor: "Inversor",
  }[input.profileType];

  if (profileTypeTagName) {
    // Get or create the tag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingTag } = await (adminClient as any)
      .from("client_tags")
      .select("id")
      .eq("name", profileTypeTagName)
      .maybeSingle();

    let tagId = existingTag?.id;

    if (!tagId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newTag } = await (adminClient as any)
        .from("client_tags")
        .insert({ name: profileTypeTagName })
        .select("id")
        .single();

      if (newTag) {
        tagId = newTag.id;
      }
    }

    // Assign tag to client
    if (tagId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adminClient as any)
        .from("client_tag_assignments")
        .insert({
          client_id: clientId,
          tag_id: tagId,
          assigned_by: null,
        });
    }
  }

  revalidatePath("/admin/clientes");
  revalidatePath("/cl/admin/clientes");
  return { ok: true, clientId };
}

// ─── Nuevo cliente con el encargo completo (España) ──────────────────────────

export type CreateClientWithBriefInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  country: "es" | "cl";
  profile: BriefProfile;
  brief: BriefInput;
};

/**
 * "Nuevo cliente" de España. Guarda el encargo con `buildPreferencesPayload`,
 * la MISMA función que usa "El encargo del cliente" en la ficha
 * (`saveClientPreferencesFull`): lo que se pregunta al crear y al editar es
 * lo mismo y se guarda igual.
 *
 * Sustituye a `createNewClient` en el diálogo de España, que guardaba la
 * estancia también en venta (y así ningún comprador recibía sugerencias),
 * metía los barrios dentro de `zones` y pedía un "Sector" que no se guardaba
 * en ningún sitio. `createNewClient` sigue para el diálogo de Chile.
 */
export async function createClientWithBrief(
  input: CreateClientWithBriefInput,
): Promise<CreateClientResult> {
  await assertPermission("clientes", "create");
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth as CreateClientResult;

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  if (!firstName) return { ok: false, error: "El nombre es obligatorio." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "El email no es válido." };

  const valid = validateBrief(input.brief);
  if (!valid.ok) return valid;

  const adminClient = createAdminClient();
  const phone = input.phone?.trim() || undefined;

  const inviteResult = await createInvitedUser({
    email,
    firstName,
    lastName,
    userMetadata: { phone },
  });
  if (!inviteResult.ok) {
    return { ok: false, error: inviteResult.error || "Error creating profile" };
  }
  const clientId = inviteResult.userId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = adminClient as any;

  const { error: profileError } = await db
    .from("profiles")
    .update({ phone: phone ?? null, country: input.country })
    .eq("id", clientId);
  if (profileError) return { ok: false, error: profileError.message };
  await assignToCreator(db, clientId, auth);

  const { error: prefsError } = await db.from("client_preferences").insert({
    client_id: clientId,
    country: input.country,
    ...buildPreferencesPayload(input.brief),
  });
  if (prefsError) return { ok: false, error: prefsError.message };

  // El usuario y el encargo ya existen: si la etiqueta falla no se deshace
  // nada, se avisa para que el perfil se elija desde la ficha.
  const tag = await setClientProfileTag(db, clientId, input.profile, auth.userId ?? null);
  if (!tag.ok) {
    console.error("[createClientWithBrief] profile tag:", tag.error);
  }

  revalidatePath("/admin/clientes");
  revalidatePath("/es/admin/clientes");
  revalidatePath("/cl/admin/clientes");
  return { ok: true, clientId };
}

// ─── Preferencias Chile ──────────────────────────────────────────────────────

export type SaveClientPreferencesChileInput = {
  clientId: string;
  operation: "alquiler" | "venta";
  preferredRegions: string[];
  preferredCommunes: string[];
  preferredSectors: string[];
  budgetMin?: number;
  budgetMax?: number;
  minPriceUf?: number;
  maxPriceUf?: number;
  currencyPreference: "CLP" | "UF";
  minBedrooms?: number;
  minBathrooms?: number;
  minSquareMeters?: number;
  maxSquareMeters?: number;
  minUsefulSquareMeters?: number;
  maxUsefulSquareMeters?: number;
  requiresServiceBedroom?: boolean;
  preferredArchitecturalTypes: string[];
  minParkingSpaces?: number;
  prefersCondominium?: boolean;
  preferredOrientations: string[];
  minFloors?: number;
};

export async function saveClientPreferencesChile(
  input: SaveClientPreferencesChileInput,
): Promise<SaveClientPreferencesResult> {
  await assertPermission("clientes", "edit");
  if (!(await canActOnClient(input.clientId, "clientes", "edit"))) {
    return { ok: false, error: "No tienes acceso a este cliente." };
  }
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;

  const updateData: Record<string, unknown> = {
    operation: input.operation === "alquiler" ? "rent" : "sale",
    preferred_regions: input.preferredRegions,
    preferred_communes: input.preferredCommunes,
    preferred_sectors: input.preferredSectors,
    currency_preference: input.currencyPreference,
    preferred_architectural_types: input.preferredArchitecturalTypes,
    preferred_orientations: input.preferredOrientations,
  };

  if (input.budgetMin !== undefined) updateData.min_price = input.budgetMin;
  if (input.budgetMax !== undefined) updateData.max_price = input.budgetMax;
  if (input.minPriceUf !== undefined) updateData.min_price_uf = input.minPriceUf;
  if (input.maxPriceUf !== undefined) updateData.max_price_uf = input.maxPriceUf;
  if (input.minBedrooms !== undefined) updateData.min_bedrooms = input.minBedrooms;
  if (input.minBathrooms !== undefined) updateData.min_bathrooms = input.minBathrooms;
  // 0 = sin tope: se guarda como null para poder vaciar el campo.
  if (input.minSquareMeters !== undefined) updateData.min_square_meters = input.minSquareMeters || null;
  if (input.maxSquareMeters !== undefined) updateData.max_square_meters = input.maxSquareMeters || null;
  if (input.minUsefulSquareMeters !== undefined) updateData.min_useful_square_meters = input.minUsefulSquareMeters || null;
  if (input.maxUsefulSquareMeters !== undefined) updateData.max_useful_square_meters = input.maxUsefulSquareMeters || null;
  if (input.requiresServiceBedroom !== undefined) updateData.requires_service_bedroom = input.requiresServiceBedroom;
  if (input.minParkingSpaces !== undefined) updateData.min_parking_spaces = input.minParkingSpaces;
  if (input.prefersCondominium !== undefined) updateData.prefers_condominium = input.prefersCondominium;
  if (input.minFloors !== undefined) updateData.min_floors = input.minFloors;

  const existingResult = await supabase
    .from("client_preferences")
    .select("client_id")
    .eq("client_id", input.clientId)
    .maybeSingle();

  const existingRow = existingResult.data as { client_id: string } | null;

  const prefs = supabase.from("client_preferences") as unknown as {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
    insert: (payload: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };

  const writeResult = existingRow
    ? await prefs.update({ ...updateData, client_id: input.clientId }).eq("client_id", input.clientId)
    : await prefs.insert({ ...updateData, client_id: input.clientId });

  if (writeResult.error) {
    return { ok: false, error: writeResult.error.message };
  }

  revalidatePath("/cl/admin/clientes");
  return { ok: true };
}

/** Zonas y barrios reales del CRM (propiedades + captaciones) para el encargo. */
export async function getZoneCatalog(country: "es" | "cl"): Promise<ZoneCatalog | null> {
  const supabase = await createClient();
  // Solo nombres de zona: lo ven también los clientes en su portal, así que
  // basta una sesión (no hace falta ser personal).
  const auth = await requireSession(supabase);
  if (!auth.ok) return null;
  return loadZoneCatalog(country === "cl" ? "cl" : "es");
}
