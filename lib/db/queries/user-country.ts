import "server-only";
import { getCurrentProfile } from "./session";

/**
 * Get current user's country for data isolation in multi-country mode
 * Returns 'es' by default if not set or user not found
 */
export async function getUserCountryForQuery(): Promise<string> {
  try {
    const profile = await getCurrentProfile();
    return (profile as any)?.country ?? "es";
  } catch {
    return "es";
  }
}
