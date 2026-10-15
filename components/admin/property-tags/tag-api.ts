import { requestJson } from "@/lib/http/request-json";
import type { PropertyTag } from "@/lib/properties/tags";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<Result<T>> {
  const r = await requestJson<{ data?: T; error?: string }>(url, { method, body });
  if (!r.ok) return { ok: false, error: r.error };
  if (r.data?.error) return { ok: false, error: r.data.error };
  return { ok: true, data: r.data?.data as T };
}

export const createTag = (name: string, color: string | undefined, country: string) =>
  call<PropertyTag>("/api/admin/property-tags", "POST", { name, color, country });

export const updateTag = (id: string, patch: { name?: string; color?: string }) =>
  call<PropertyTag>(`/api/admin/property-tags/${id}`, "PATCH", patch);

export const deleteTag = (id: string) =>
  call<unknown>(`/api/admin/property-tags/${id}`, "DELETE");

export const assignTags = (slugs: string[], add: string[], remove: string[]) =>
  call<unknown>("/api/admin/property-tags/assign", "POST", { slugs, add, remove });
