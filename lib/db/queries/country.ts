import "server-only";
import { getCurrentProfile } from "./session";

/**
 * Get the current user's country (es or cl)
 * Used to filter data queries by country in multi-country mode
 */
export async function getUserCountry(): Promise<string> {
  const profile = await getCurrentProfile();
  return (profile as any)?.country ?? "es";
}
