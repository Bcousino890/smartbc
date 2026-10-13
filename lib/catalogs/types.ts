// Tipos de la HOME y de la gestión de catálogos (BCP-01). Solo datos que ya
// pasaron la guarda del dueño; nada de esto llega a ninguna superficie pública.

export type CatalogStatus = "active" | "archived";

export interface CatalogSummary {
  id: string;
  title: string;
  intro: string | null;
  status: CatalogStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  numberLabel: string | null;
  edition: string;
  coverPhotoUrl: string | null;
}

export interface CatalogItemView {
  propertyId: string;
  position: number;
  slug: string;
  bcReference: string | null;
  title: string;
  zone: string | null;
  status: "available" | "reserved" | "sold" | "archived";
  operation: string;
  price: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  photoUrl: string | null;
}

export interface CatalogDetail {
  id: string;
  title: string;
  intro: string | null;
  status: CatalogStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  edition: string;
  items: CatalogItemView[];
}
