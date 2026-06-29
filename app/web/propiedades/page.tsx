import { fetchPortalProperties } from "@/lib/portal-fetch";
import CatalogClient from "./CatalogClient";

// Cache data for 5 minutes — properties don't change by the second
export const revalidate = 300;

export default async function Catalog() {
  const properties = await fetchPortalProperties();
  return <CatalogClient allProperties={properties} />;
}
