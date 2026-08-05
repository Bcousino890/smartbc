import "server-only";
import { idealistaApiFetch } from "./client";
import type { IdealistaContactCreate, IdealistaContactResponse } from "./types";

export async function createContact(contact: IdealistaContactCreate): Promise<IdealistaContactResponse> {
  const { json } = await idealistaApiFetch("/v1/contacts", { method: "POST", body: contact });
  return json;
}

export async function findAllContacts(page = 1, size = 50): Promise<{ contacts: any[]; totalContacts: number }> {
  const { json } = await idealistaApiFetch(`/v1/contacts?page=${page}&size=${size}`);
  return json;
}
