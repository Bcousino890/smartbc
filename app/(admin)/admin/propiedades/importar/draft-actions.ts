"use server";

import { revalidatePath } from "next/cache";
import { linkPropertyToPortalLink } from "@/app/[country]/(admin)/admin/clientes/portal-links-actions";
import { checkPermission } from "@/lib/auth/guard";
import type { Country } from "@/lib/country-config";
import {
  allowedAgencies,
  confirmDraft,
  type ConfirmChoice,
  createLinkDraft,
  createPdfDraft,
  discardDraft,
  type DraftRow,
  findDraftDuplicates,
  getDraft,
  listDrafts,
  ownedExplicitCatalog,
  retryPhotoStep,
  runCatalogStep,
  runClientLinkStep,
  runPhotoStep,
  updateDraft,
} from "@/lib/imports/drafts";
import { importErrorMessage } from "@/lib/imports/errors";

// ============================================================================
// Acciones de la importación con borrador (BCP-01 P5). Todas exigen
// properties.create (checkPermission, que también respeta las excepciones por
// usuario y el país) y trabajan SOLO con los borradores del propio usuario.
// El catálogo se valida además en el servidor (dueño de la HOME).
// ============================================================================

type Err = { ok: false; error: string; code: string; missing?: string[] };
const err = (code: string, missing?: string[]): Err => ({ ok: false, code, error: importErrorMessage(code), ...(missing ? { missing } : {}) });
function isFail<T>(r: T): r is Extract<T, { ok: false }> {
  return Boolean(r && typeof r === "object" && (r as { ok?: unknown }).ok === false);
}
const COUNTRIES = new Set<Country>(["es", "cl"]);

async function gate(country: Country) {
  if (!COUNTRIES.has(country)) return { ok: false as const, error: err("invalid_request") };
  const g = await checkPermission("properties", "create", { country });
  if (!g.ok) return { ok: false as const, error: { ok: false as const, code: "forbidden", error: g.error } satisfies Err };
  return { ok: true as const, actor: g.profile.id };
}

export async function listImportDraftsAction(country: Country): Promise<{ ok: true; drafts: DraftRow[] } | Err> {
  const g = await gate(country);
  if (!g.ok) return g.error;
  return { ok: true, drafts: (await listDrafts(g.actor)).filter((d) => d.country === country) };
}

export async function getImportDraftAction(country: Country, id: string): Promise<{ ok: true; draft: DraftRow; agencies: Awaited<ReturnType<typeof allowedAgencies>>; catalogTitle: string | null } | Err> {
  const g = await gate(country);
  if (!g.ok) return g.error;
  const d = await getDraft(g.actor, id);
  if (!d || d.country !== country) return err("draft_not_found");
  const cat = d.catalog_id ? await ownedExplicitCatalog(g.actor, d.catalog_id) : null;
  return { ok: true, draft: d, agencies: await allowedAgencies(), catalogTitle: cat?.title ?? null };
}

export async function createLinkDraftAction(input: {
  country: Country;
  url: string;
  html?: string;
  requestKey: string;
  catalogId?: string | null;
  portalLinkId?: string | null;
}): Promise<{ ok: true; draft: DraftRow } | Err> {
  const g = await gate(input.country);
  if (!g.ok) return g.error;
  if (input.html !== undefined && input.html.length > 20 * 1024 * 1024) return err("parse_failed");
  const r = await createLinkDraft({ ...input, actor: g.actor, country: input.country as "es" | "cl" });
  return isFail(r) ? err(r.error) : { ok: true, draft: r };
}

export async function createPdfDraftAction(input: {
  country: Country;
  requestKey: string;
  sourceName: string;
  sourceHash: string;
  part: number;
  fields: unknown;
  evidence: unknown;
  catalogId?: string | null;
}): Promise<{ ok: true; draft: DraftRow } | Err> {
  const g = await gate(input.country);
  if (!g.ok) return g.error;
  const r = await createPdfDraft({ ...input, actor: g.actor, country: input.country as "es" | "cl" });
  return isFail(r) ? err(r.error) : { ok: true, draft: r };
}

export async function updateImportDraftAction(input: {
  country: Country;
  id: string;
  expectedVersion: number;
  fields?: unknown;
  photoOrder?: string[];
  agencyId?: string;
  notifyClients?: boolean;
  catalogId?: string | null;
}): Promise<{ ok: true; draft: DraftRow } | Err> {
  const g = await gate(input.country);
  if (!g.ok) return g.error;
  const r = await updateDraft({ ...input, actor: g.actor });
  return isFail(r) ? err(r.error) : { ok: true, draft: r };
}

export async function discardImportDraftAction(country: Country, id: string): Promise<{ ok: true } | Err> {
  const g = await gate(country);
  if (!g.ok) return g.error;
  const r = await discardDraft(g.actor, id);
  return isFail(r) ? err(r.error) : { ok: true };
}

export async function findImportDuplicatesAction(country: Country, id: string) {
  const g = await gate(country);
  if (!g.ok) return g.error;
  const r = await findDraftDuplicates(g.actor, id);
  return isFail(r) ? err(r.error) : r;
}

export async function confirmImportDraftAction(input: { country: Country; id: string; expectedVersion: number; choice: ConfirmChoice }) {
  const g = await gate(input.country);
  if (!g.ok) return g.error;
  const r = await confirmDraft({ actor: g.actor, id: input.id, expectedVersion: input.expectedVersion, choice: input.choice });
  if (isFail(r)) return err(r.error, r.missing);
  revalidatePath(`/${input.country}/admin/propiedades`);
  return r;
}

/** Siguiente tanda de fotos (el navegador la repite hasta «ok» o «failed»). */
export async function runImportPhotosAction(country: Country, id: string, retry = false) {
  const g = await gate(country);
  if (!g.ok) return g.error;
  const r = retry ? await retryPhotoStep(g.actor, id) : await runPhotoStep(g.actor, id);
  return isFail(r) ? err(r.error) : r;
}

export async function runImportCatalogAction(country: Country, id: string) {
  const g = await gate(country);
  if (!g.ok) return g.error;
  const r = await runCatalogStep(g.actor, id);
  if (isFail(r)) return err(r.error);
  return r.status === "failed" ? { ...r, message: importErrorMessage(r.error) } : r;
}

export async function runImportClientLinkAction(country: Country, id: string) {
  const g = await gate(country);
  if (!g.ok) return g.error;
  const r = await runClientLinkStep(g.actor, id, async (linkId, propertyId) => {
    const res = await linkPropertyToPortalLink(linkId, propertyId);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  });
  return isFail(r) ? err(r.error) : r;
}
