import { propertyRowToClientProperty } from "@/lib/db/adapters";
import { getFavoriteSlugs } from "@/lib/db/queries/favorites";
import { getProperties } from "@/lib/db/queries/properties";
import { getCurrentUser } from "@/lib/db/queries/session";
import { PropiedadesClient } from "./propiedades-client";

export const dynamic = "force-dynamic";

export default async function PropiedadesPage() {
  const [rows, user] = await Promise.all([
    getProperties({ includeUnavailable: false }, 100),
    getCurrentUser(),
  ]);
  const properties = rows.map(propertyRowToClientProperty);
  const favoriteSlugs = user ? await getFavoriteSlugs(user.id) : [];
  return (
    <PropiedadesClient
      properties={properties}
      favoriteSlugs={favoriteSlugs}
    />
  );
}
