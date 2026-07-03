// Configuración centralizada por país para el árbol admin dinámico
// `app/[country]/(admin)/admin/*`. Antes de esto, España y Chile eran dos
// árboles de páginas casi idénticos con formatos de moneda/locale/labels
// hardcodeados en cada archivo — ver CHILE_CRM_ANALISIS.md (Fase 4).

export type Country = "es" | "cl";

export function isCountry(value: string | null | undefined): value is Country {
  return value === "es" || value === "cl";
}

export type CountryConfig = {
  locale: "es-ES" | "es-CL";
  prefix: "/es/admin" | "/cl/admin";
  currencyDefault: "eur" | "clp";
  rentLabel: "Alquiler" | "Arriendo";
  rentedLabel: "Alquilada" | "Arrendada";
  /**
   * Formatea un precio según la moneda del país.
   * - España: siempre €, locale es-ES.
   * - Chile: CLP ($), UF o USD según `currency`, locale es-CL.
   */
  formatPrice(
    price: number | null | undefined,
    currency?: string | null,
    operation?: string | null,
  ): string;
};

const ES_CONFIG: CountryConfig = {
  locale: "es-ES",
  prefix: "/es/admin",
  currencyDefault: "eur",
  rentLabel: "Alquiler",
  rentedLabel: "Alquilada",
  formatPrice(price, _currency, operation) {
    if (price == null) return "—";
    const formatted = new Intl.NumberFormat("es-ES").format(price);
    return operation === "rent" ? `${formatted} €/mes` : `${formatted} €`;
  },
};

const CL_CONFIG: CountryConfig = {
  locale: "es-CL",
  prefix: "/cl/admin",
  currencyDefault: "clp",
  rentLabel: "Arriendo",
  rentedLabel: "Arrendada",
  formatPrice(price, currency, operation) {
    if (price == null) return "—";
    const n = new Intl.NumberFormat("es-CL").format(price);
    const unit =
      currency === "uf" ? `UF ${n}` : currency === "usd" ? `US$ ${n}` : `$ ${n}`;
    return operation === "rent" ? `${unit}/mes` : unit;
  },
};

export const COUNTRY_CONFIG: Record<Country, CountryConfig> = {
  es: ES_CONFIG,
  cl: CL_CONFIG,
};

export function getCountryConfig(country: Country): CountryConfig {
  return COUNTRY_CONFIG[country];
}
