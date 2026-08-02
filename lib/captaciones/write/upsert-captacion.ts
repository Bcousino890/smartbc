import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getDefaultPipeline, getStagesForPipeline, type PipelineStage } from "../pipeline";
import { autoDistributeNewCaptacion } from "../auto-distribution";
import { buildFieldPolicy, buildPatch } from "./field-policy";
import { findEntryStage, findStageByKey, resolveStageTransition } from "./stage-transitions";
import { notifyCaptacionImported, notifyOwnerConfirmed, notifyOwnerUpdated } from "./notify";
import {
  pickOwnerContact,
  syncCaptacionContacts,
  type ContactInput,
  type ContactSyncMode,
} from "./sync-contacts";
import { syncCaptacionPhotos, type PhotoInput, type PhotoSyncMode } from "./sync-photos";
import { syncCaptacionListings, type ListingInput } from "./sync-listings";
import { appendCaptacionAttempts, type AttemptInput } from "./append-log";
import { resolveChileLocation } from "./resolve-location";
import type { ApiClientRow } from "@/lib/api/types";

/**
 * Alta y actualización de una captación completa recibida de una integración
 * externa.
 *
 * Es el corazón del "no rellenar nada a mano": una misma llamada crea la
 * captación si no existe y la actualiza si ya existe, cubriendo las seis
 * pestañas de la ficha (Ficha, Ubicación, Info, Avisos, Fotos, Intentos) y
 * disparando los mismos efectos que el panel — reparto automático,
 * auto-transición de etapa y notificaciones al equipo.
 *
 * Deduplicación: (api_client_id, external_id). Si el proveedor no lo había
 * mandado antes pero la captación ya existía por scraping, se adopta la fila
 * que coincida por `source_url` en vez de crear un duplicado.
 */

export type CaptacionUpsertInput = {
  external_id: string;

  // ── Ficha ──
  title?: string | null;
  description?: string | null;
  operation?: string | null;
  price?: number | null;
  currency?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_meters?: number | null;
  useful_square_meters?: number | null;
  property_type?: string | null;
  features?: string[] | null;
  source_url?: string | null;
  source_site?: string | null;
  cover_photo_url?: string | null;
  broker_name?: string | null;
  external_reference?: string | null;
  portal_publication_number?: string | null;
  published_ago?: string | null;

  // ── Ubicación ──
  region?: string | null;
  commune?: string | null;
  zone?: string | null;
  subzone?: string | null;
  address_scraped?: string | null;
  address_real?: string | null;
  address_verified?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  rol_propiedad?: string | null;

  // ── Dueño y seguimiento ──
  owner?: {
    name?: string | null;
    phone?: string | null;
    contact?: string | null;
    confirmed?: boolean | null;
  } | null;
  notes?: string | null;
  revision_notes?: string | null;
  next_action_at?: string | null;
  next_action_note?: string | null;

  // ── Sub-recursos ──
  contacts?: ContactInput[] | { mode?: ContactSyncMode | null; items: ContactInput[] } | null;
  photos?: { mode?: PhotoSyncMode | null; items: PhotoInput[] } | null;
  listings?: ListingInput[] | null;
  attempts?: AttemptInput[] | null;

  // ── Workflow ──
  pipeline?: string | null;
  stage?: string | null;
  assigned_to_email?: string | null;

  // ── Control ──
  options?: { overwrite_manual_fields?: boolean; force_fields?: string[] } | null;
  metadata?: Record<string, unknown> | null;
};

/** `contacts` admite lista plana (= append) o { mode, items }. */
function normalizeContacts(
  input: CaptacionUpsertInput["contacts"]
): { mode: ContactSyncMode; items: ContactInput[] } | null {
  if (!input) return null;
  if (Array.isArray(input)) return { mode: "append", items: input };
  return { mode: input.mode ?? "append", items: input.items };
}

export type UpsertAction = "created" | "updated" | "unchanged";

export type CaptacionUpsertResult = {
  id: string | null;
  external_id: string;
  action: UpsertAction;
  admin_url: string | null;
  /** Campos de la ficha que realmente cambiaron. */
  changed_fields: string[];
  /** Campos del equipo que se respetaron y NO se pisaron. */
  protected_fields: string[];
  sections: {
    contacts?: {
      created: number;
      updated: number;
      unchanged: number;
      removed?: number;
      removal_protected?: number;
      photos_queued?: number;
    };
    photos?: { added: number; removed: number; kept: number };
    listings?: { created: number; updated: number; unchanged: number; price_snapshots: number };
    attempts?: { created: number; unchanged: number };
  };
  warnings: string[];
  dry_run: boolean;
};

/** Columnas de la ficha que se leen para decidir qué cambia. */
const EXISTING_COLUMNS = `
  id, country, created_by, assigned_to, pipeline_id, stage_id, status, title,
  description, operation, price, currency, bedrooms, bathrooms, square_meters,
  useful_square_meters, property_type, features, source_url, source_site,
  cover_photo_url, broker_name, external_reference, portal_publication_number,
  published_ago, region, commune, zone, subzone, address_scraped, address_real,
  address_verified, latitude, longitude, rol_propiedad, owner_name, owner_phone,
  owner_contact, owner_confirmed, notes, revision_notes, next_action_at,
  next_action_note, external_id, api_client_id, rejected_by
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExistingCaptacion = Record<string, any> & { id: string };

export async function upsertCaptacionFromApi(
  client: ApiClientRow,
  input: CaptacionUpsertInput,
  opts: { dryRun?: boolean } = {}
): Promise<CaptacionUpsertResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const dryRun = Boolean(opts.dryRun);
  const warnings: string[] = [];

  const existing = await findExistingCaptacion(db, client, input);
  const policy = buildFieldPolicy(client.overwrite_manual_fields, input.options ?? undefined);

  // ── Ubicación normalizada contra el maestro de Chile ──
  const location = await resolveChileLocation({
    region: input.region,
    commune: input.commune,
  });
  warnings.push(...location.warnings);

  // ── Pipeline y etapa ──
  const pipelineResolution = await resolvePipelineAndStage(db, client, input, existing);
  warnings.push(...pipelineResolution.warnings);

  // ── Responsable explícito por email ──
  let assignedTo: string | undefined;
  if (input.assigned_to_email) {
    const resolved = await resolveUserByEmail(db, input.assigned_to_email);
    if (resolved) assignedTo = resolved;
    else warnings.push(`No hay ningún usuario con el email ${input.assigned_to_email}; la captación queda sin asignar por esa vía.`);
  }

  // Los campos planos del dueño se rellenan desde `owner` o, si no viene, desde
  // el contacto de tipo `owner` de la lista de contactos.
  const ownerContact = pickOwnerContact(normalizeContacts(input.contacts)?.items ?? []);
  const ownerName = input.owner?.name ?? ownerContact?.contact_name ?? undefined;
  const ownerPhone = input.owner?.phone ?? ownerContact?.phone ?? undefined;

  // owner_confirmed es monotónico para la API: false → true siempre se
  // aplica (para eso existe el campo — que una integración marque al dueño
  // como confirmado). true → false NO, salvo overwrite explícito: si una
  // captadora ya confirmó tras hablar con el propietario, un reenvío con
  // datos más viejos del proveedor no puede desconfirmarlo en silencio.
  let ownerConfirmed = input.owner?.confirmed;
  if (
    ownerConfirmed === false &&
    existing?.owner_confirmed === true &&
    !policy.overwriteManualFields
  ) {
    warnings.push(
      "El propietario ya estaba confirmado por el equipo; no se ha desconfirmado. Usa options.overwrite_manual_fields si es intencional."
    );
    ownerConfirmed = undefined;
  }

  const incoming: Record<string, unknown> = {
    title: input.title,
    description: input.description,
    operation: input.operation,
    price: input.price,
    currency: input.currency,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    square_meters: input.square_meters,
    useful_square_meters: input.useful_square_meters,
    property_type: input.property_type,
    features: input.features,
    source_url: input.source_url,
    source_site: input.source_site ?? client.slug,
    cover_photo_url: input.cover_photo_url,
    broker_name: input.broker_name,
    external_reference: input.external_reference,
    portal_publication_number: input.portal_publication_number,
    published_ago: input.published_ago,

    region: location.region ?? undefined,
    commune: location.commune ?? undefined,
    zone: input.zone,
    subzone: input.subzone,
    address_scraped: input.address_scraped,
    address_real: input.address_real,
    address_verified: input.address_verified,
    rol_propiedad: input.rol_propiedad,

    owner_name: ownerName,
    owner_phone: ownerPhone,
    owner_contact: input.owner?.contact,
    owner_confirmed: ownerConfirmed,
    notes: input.notes,
    revision_notes: input.revision_notes,
    next_action_at: input.next_action_at,
    next_action_note: input.next_action_note,

    ...(assignedTo ? { assigned_to: assignedTo } : {}),
    ...(pipelineResolution.stageId ? { stage_id: pipelineResolution.stageId } : {}),
    ...(pipelineResolution.pipelineId ? { pipeline_id: pipelineResolution.pipelineId } : {}),
  };

  // Las coordenadas no se tocan si el equipo ya verificó la dirección a mano.
  if (existing?.address_verified && !policy.overwriteManualFields) {
    if (input.latitude !== undefined || input.longitude !== undefined) {
      warnings.push("La dirección está verificada por el equipo: no se han actualizado latitud/longitud.");
    }
  } else {
    incoming.latitude = input.latitude;
    incoming.longitude = input.longitude;
  }

  const { patch, skipped, changed } = buildPatch(incoming, existing, policy);

  return existing
    ? await applyUpdate({ db, client, input, existing, patch, changed, skipped, warnings, dryRun, pipelineResolution })
    : await applyInsert({ db, client, input, patch, changed, skipped, warnings, dryRun, pipelineResolution });
}

// ─── Localización de la fila existente ──────────────────────────────────────

async function findExistingCaptacion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  client: ApiClientRow,
  input: CaptacionUpsertInput
): Promise<ExistingCaptacion | null> {
  const { data: byExternalId } = await db
    .from("captaciones")
    .select(EXISTING_COLUMNS)
    .eq("api_client_id", client.id)
    .eq("external_id", input.external_id)
    .maybeSingle();

  if (byExternalId) return byExternalId as ExistingCaptacion;

  // Adopción: la captación puede existir ya por scraping o carga manual con la
  // misma URL de origen. Mejor adoptarla que crear un duplicado.
  if (!client.match_by_source_url || !input.source_url) return null;

  const { data: bySourceUrl } = await db
    .from("captaciones")
    .select(EXISTING_COLUMNS)
    .eq("country", client.country)
    .eq("source_url", input.source_url)
    .is("external_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (bySourceUrl as ExistingCaptacion) ?? null;
}

// ─── Pipeline y etapa ───────────────────────────────────────────────────────

type PipelineResolution = {
  pipelineId: string | null;
  stageId: string | null;
  stages: PipelineStage[];
  warnings: string[];
  /**
   * `status` (legado) y `rejected_by` a forzar sin pasar por la política de
   * campos protegidos — solo se rellena cuando la etapa resuelta ENTRA o SALE
   * de una etapa de tipo `rejected`. Ver el comentario sobre reapertura
   * automática más abajo.
   */
  forcedFields: Record<string, unknown>;
};

async function resolvePipelineAndStage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  client: ApiClientRow,
  input: CaptacionUpsertInput,
  existing: ExistingCaptacion | null
): Promise<PipelineResolution> {
  const warnings: string[] = [];
  let pipelineId: string | null = existing?.pipeline_id ?? null;

  // Prioridad: pipeline pedido en el payload > pipeline del cliente API >
  // pipeline que ya tenía la captación > pipeline por defecto del país.
  if (input.pipeline) {
    const { data } = await db
      .from("captacion_pipelines")
      .select("id")
      .eq("country", client.country)
      .ilike("name", input.pipeline)
      .maybeSingle();
    if (data?.id) pipelineId = data.id;
    else warnings.push(`No existe el pipeline "${input.pipeline}"; se usa el pipeline por defecto.`);
  } else if (!pipelineId && client.default_pipeline_id) {
    pipelineId = client.default_pipeline_id;
  }

  let stages: PipelineStage[] = [];
  if (pipelineId) {
    stages = await getStagesForPipeline(pipelineId).catch(() => []);
  }
  if (stages.length === 0) {
    const fallback = await getDefaultPipeline(client.country).catch(() => null);
    if (fallback) {
      pipelineId = fallback.pipeline.id;
      stages = fallback.stages;
    }
  }

  let stageId: string | null = null;
  if (input.stage && stages.length > 0) {
    const stage = findStageByKey(stages, input.stage);
    if (stage) {
      // Las etapas terminales de conversión solo las fija el endpoint de
      // convertir a propiedad; una integración no puede saltárselo.
      if (stage.stage_type === "converted") {
        warnings.push('La etapa "converted" solo la puede fijar la conversión a propiedad; se ignora.');
      } else {
        stageId = stage.id;
      }
    } else {
      warnings.push(`No existe la etapa "${input.stage}" en el pipeline; se deja la etapa actual.`);
    }
  }

  // Reapertura automática: si la captación sigue en una etapa "rechazada" y
  // el proveedor reenvía sin pedir una etapa explícita, se entiende como
  // "esto sigue vivo" y vuelve sola a la etapa de entrada. PERO solo si el
  // rechazo lo causó la propia API — si una PERSONA la rechazó desde el
  // panel (fraude, duplicado, o cualquier motivo real del equipo), no se
  // reabre sola: el proveedor tendría que pedirlo con `stage` explícito.
  if (!stageId && existing) {
    const currentStage = stages.find((s) => s.id === existing.stage_id) ?? null;
    if (currentStage?.stage_type === "rejected") {
      if (existing.rejected_by === "panel") {
        warnings.push(
          'Esta captación fue rechazada a mano por el equipo; no se reabre sola. Envía "stage" explícitamente si quieres moverla.'
        );
      } else {
        const entryStage = findEntryStage(stages);
        if (entryStage) {
          stageId = entryStage.id;
          warnings.push(`La captación estaba rechazada; ha vuelto a la etapa "${entryStage.label}".`);
        }
      }
    }
  }

  // Alta sin etapa indicada: entra por la etapa de entrada del pipeline.
  if (!stageId && !existing && stages.length > 0) {
    stageId = findEntryStage(stages)?.id ?? null;
  }

  // `status` (legado) y `rejected_by` solo se tocan cuando la etapa resuelta
  // realmente entra o sale de una etapa `rejected` — no en cualquier cambio
  // de etapa. `status` sigue siendo un campo del equipo protegido en
  // `incoming`/buildPatch, así que este parche se aplica aparte (ver
  // `finalPatch` en applyUpdate).
  const forcedFields: Record<string, unknown> = {};
  if (existing && stageId && stageId !== existing.stage_id) {
    const previousStage = stages.find((s) => s.id === existing.stage_id) ?? null;
    const targetStage = stages.find((s) => s.id === stageId) ?? null;
    const wasRejected = previousStage?.stage_type === "rejected";
    const isNowRejected = targetStage?.stage_type === "rejected";
    if (isNowRejected) {
      forcedFields.status = "rejected";
      forcedFields.rejected_by = "api";
    } else if (wasRejected) {
      forcedFields.status = "draft";
      forcedFields.rejected_by = null;
    }
  }

  return { pipelineId, stageId, stages, warnings, forcedFields };
}

async function resolveUserByEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  email: string
): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("id")
    .ilike("email", email.trim())
    .maybeSingle();
  return data?.id ?? null;
}

// ─── Alta ───────────────────────────────────────────────────────────────────

type ApplyArgs = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  client: ApiClientRow;
  input: CaptacionUpsertInput;
  patch: Record<string, unknown>;
  changed: string[];
  skipped: string[];
  warnings: string[];
  dryRun: boolean;
  pipelineResolution: PipelineResolution;
};

async function applyInsert(args: ApplyArgs): Promise<CaptacionUpsertResult> {
  const { db, client, input, patch, changed, skipped, warnings, dryRun, pipelineResolution } = args;

  if (!input.source_url && !patch.source_url) {
    // `captaciones.source_url` es NOT NULL desde 0048. Si el proveedor no manda
    // una URL de anuncio se sintetiza una referencia estable y trazable.
    patch.source_url = `smartbc://api/${client.slug}/${input.external_id}`;
    warnings.push("No se envió source_url; se ha guardado una referencia interna.");
  }

  const row = {
    ...patch,
    country: client.country,
    created_by: client.default_created_by,
    api_client_id: client.id,
    external_id: input.external_id,
    external_source: client.slug,
    external_payload: input.metadata ? { metadata: input.metadata } : null,
    external_synced_at: new Date().toISOString(),
    origin: "api",
    status: "draft",
    scrape_status: "scraped",
    scraped_at: new Date().toISOString(),
    pipeline_id: pipelineResolution.pipelineId,
    stage_id: pipelineResolution.stageId,
    assigned_to: (patch.assigned_to as string | undefined) ?? client.default_assigned_to ?? null,
  };

  if (dryRun) {
    return {
      id: null,
      external_id: input.external_id,
      action: "created",
      admin_url: null,
      changed_fields: changed,
      protected_fields: skipped,
      sections: await simulateSections(input),
      warnings,
      dry_run: true,
    };
  }

  const { data: created, error } = await db
    .from("captaciones")
    .insert(row)
    .select("id, title, pipeline_id, assigned_to, created_by")
    .single();

  if (error) throw error;

  // Reparto automático: la captación se asigna sola al usuario con menos carga.
  // No crítico — si falla, entra igual y el admin la reparte a mano.
  let captacion = created;
  if (client.auto_distribute) {
    try {
      const assigned = await autoDistributeNewCaptacion(
        db,
        {
          id: created.id,
          title: created.title,
          pipeline_id: created.pipeline_id,
          assigned_to: created.assigned_to,
        },
        { id: client.default_created_by, full_name: client.name }
      );
      if (assigned) captacion = { ...created, ...assigned };
    } catch (err) {
      console.error("[api captacion auto-distribution]", err);
    }
  }

  const sections = await syncSections(db, client, created.id, input, false);
  warnings.push(...removalWarnings(sections));

  await notifyCaptacionImported(db, created.id, created.title, client.name, {
    createdBy: created.created_by,
    assignedTo: captacion.assigned_to,
  });

  return {
    id: created.id,
    external_id: input.external_id,
    action: "created",
    admin_url: adminUrl(client.country, created.id),
    changed_fields: changed,
    protected_fields: skipped,
    sections,
    warnings,
    dry_run: false,
  };
}

// ─── Actualización ──────────────────────────────────────────────────────────

async function applyUpdate(
  args: ApplyArgs & { existing: ExistingCaptacion }
): Promise<CaptacionUpsertResult> {
  const { db, client, input, existing, patch, changed, skipped, warnings, dryRun, pipelineResolution } = args;

  const wasConfirmed = Boolean(existing.owner_confirmed);
  const nextConfirmed =
    patch.owner_confirmed !== undefined ? Boolean(patch.owner_confirmed) : wasConfirmed;

  const currentStage =
    pipelineResolution.stages.find((s) => s.id === existing.stage_id) ?? null;

  const bringsOwnerData = Boolean(patch.owner_phone || patch.owner_name);

  const transition = resolveStageTransition({
    stages: pipelineResolution.stages,
    currentStage,
    nextOwnerConfirmed: nextConfirmed,
    wasOwnerConfirmed: wasConfirmed,
    bringsOwnerData,
  });

  const finalPatch: Record<string, unknown> = {
    ...patch,
    ...transition,
    ...pipelineResolution.forcedFields,
    // La captación pasa a estar bajo control de esta integración aunque se
    // hubiera creado por scraping (adopción por source_url).
    api_client_id: client.id,
    external_id: input.external_id,
    external_source: client.slug,
    external_synced_at: new Date().toISOString(),
  };
  if (input.metadata) finalPatch.external_payload = { metadata: input.metadata };

  for (const field of Object.keys(pipelineResolution.forcedFields)) {
    if (!changed.includes(field)) changed.push(field);
  }

  const hasFichaChanges =
    changed.length > 0 ||
    Object.keys(transition).length > 0 ||
    Object.keys(pipelineResolution.forcedFields).length > 0;

  if (dryRun) {
    return {
      id: existing.id,
      external_id: input.external_id,
      action: hasFichaChanges ? "updated" : "unchanged",
      admin_url: adminUrl(client.country, existing.id),
      changed_fields: changed,
      protected_fields: skipped,
      sections: await simulateSections(input),
      warnings,
      dry_run: true,
    };
  }

  if (hasFichaChanges || existing.api_client_id !== client.id || existing.external_id !== input.external_id) {
    finalPatch.updated_at = new Date().toISOString();
    const { error } = await db.from("captaciones").update(finalPatch).eq("id", existing.id);
    if (error) throw error;
  }

  const sections = await syncSections(db, client, existing.id, input, false);
  warnings.push(...removalWarnings(sections));

  // Notificaciones equivalentes a las del panel.
  if (nextConfirmed && !wasConfirmed) {
    await notifyOwnerConfirmed(
      db,
      existing.id,
      existing.title,
      { createdBy: existing.created_by, assignedTo: existing.assigned_to },
      client.name
    );
  } else if (bringsOwnerData || patch.owner_contact || patch.address_real) {
    await notifyOwnerUpdated(db, existing.id, existing.title, {
      createdBy: existing.created_by,
      assignedTo: existing.assigned_to,
    });
  }

  const touchedSections =
    (sections.contacts?.created ?? 0) + (sections.contacts?.updated ?? 0) +
    (sections.photos?.added ?? 0) + (sections.photos?.removed ?? 0) +
    (sections.listings?.created ?? 0) + (sections.listings?.updated ?? 0) +
    (sections.attempts?.created ?? 0);

  return {
    id: existing.id,
    external_id: input.external_id,
    action: hasFichaChanges || touchedSections > 0 ? "updated" : "unchanged",
    admin_url: adminUrl(client.country, existing.id),
    changed_fields: changed,
    protected_fields: skipped,
    sections,
    warnings,
    dry_run: false,
  };
}

// ─── Sub-recursos ───────────────────────────────────────────────────────────

async function syncSections(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  client: ApiClientRow,
  captacionId: string,
  input: CaptacionUpsertInput,
  dryRun: boolean
): Promise<CaptacionUpsertResult["sections"]> {
  const sections: CaptacionUpsertResult["sections"] = {};

  const contacts = normalizeContacts(input.contacts);
  // Con mode=sync una lista vacía es válida: significa "retira todos los míos".
  if (contacts && (contacts.items.length > 0 || contacts.mode === "sync")) {
    const res = await syncCaptacionContacts(db, captacionId, contacts.items, {
      dryRun,
      mode: contacts.mode,
      apiClientId: client.id,
    });
    sections.contacts = {
      created: res.created,
      updated: res.updated,
      unchanged: res.unchanged,
      removed: res.removed,
      removal_protected: res.removalProtected,
      photos_queued: res.photosQueued,
    };
    if (res.errors.length > 0) console.error("[api captacion contacts]", res.errors);
  }

  if (input.listings?.length) {
    const res = await syncCaptacionListings(db, captacionId, input.listings, { dryRun });
    sections.listings = {
      created: res.created,
      updated: res.updated,
      unchanged: res.unchanged,
      price_snapshots: res.priceSnapshots,
    };
    if (res.errors.length > 0) console.error("[api captacion listings]", res.errors);
  }

  if (input.attempts?.length) {
    const res = await appendCaptacionAttempts(
      db,
      captacionId,
      client.default_created_by,
      input.attempts,
      { dryRun }
    );
    sections.attempts = { created: res.created, unchanged: res.unchanged };
    if (res.errors.length > 0) console.error("[api captacion attempts]", res.errors);
  }

  if (input.photos?.items?.length) {
    const mode = input.photos.mode ?? "sync";
    if (dryRun) {
      sections.photos = { added: input.photos.items.length, removed: 0, kept: 0 };
    } else {
      // Las fotos se descargan y re-alojan en segundo plano: 30 imágenes pueden
      // tardar decenas de segundos y el proveedor no debe esperar por ellas.
      // Es seguro porque SmartBC corre como proceso PM2 persistente (mismo
      // patrón que rehostPhotosInBackground en el importador por link).
      const items = input.photos.items;
      sections.photos = { added: items.length, removed: 0, kept: 0 };
      void syncCaptacionPhotos(db, captacionId, items, mode).catch((err) =>
        console.error("[api captacion photos bg]", err)
      );
    }
  }

  return sections;
}

async function simulateSections(
  input: CaptacionUpsertInput
): Promise<CaptacionUpsertResult["sections"]> {
  const sections: CaptacionUpsertResult["sections"] = {};
  const contacts = normalizeContacts(input.contacts);
  if (contacts?.items.length) {
    sections.contacts = { created: contacts.items.length, updated: 0, unchanged: 0 };
  }
  if (input.photos?.items?.length) {
    sections.photos = { added: input.photos.items.length, removed: 0, kept: 0 };
  }
  if (input.listings?.length) {
    sections.listings = {
      created: input.listings.length,
      updated: 0,
      unchanged: 0,
      price_snapshots: input.listings.filter((l) => l.price != null || l.broker_price != null).length,
    };
  }
  if (input.attempts?.length) {
    sections.attempts = { created: input.attempts.length, unchanged: 0 };
  }
  return sections;
}

/**
 * Aviso al proveedor cuando su `mode: "sync"` no ha podido retirar algo. Que se
 * entere importa: si no, cree que su curación se aplicó entera y no lo hizo.
 */
function removalWarnings(sections: CaptacionUpsertResult["sections"]): string[] {
  const protectedCount = sections.contacts?.removal_protected ?? 0;
  if (protectedCount === 0) return [];
  return [
    `${protectedCount} contacto(s) no se retiraron: los creó o editó una persona del equipo y quedan protegidos.`,
  ];
}

export function adminUrl(country: string, captacionId: string): string {
  const base = process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/$/, "") ?? "";
  return `${base}/${country}/admin/captaciones/${captacionId}`;
}
