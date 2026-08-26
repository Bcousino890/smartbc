"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ExchangeRates } from "@/lib/exchange-rates";

export type DisplayCurrency = "NATIVE" | "EUR" | "CLP" | "USD";

const STORAGE_KEY = "bc-display-currency";

type CurrencyContextValue = {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (c: DisplayCurrency) => void;
  /** Formatea `amount` (en su moneda nativa) según la moneda elegida por el
   * visitante. Si no ha elegido ninguna (NATIVE), muestra el precio tal cual
   * está cargado (UF/USD/CLP en Chile, € en España). */
  formatPrice: (amount: number, nativeCurrency: string | null | undefined, operation: "Venta" | "Alquiler") => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function formatNative(amount: number, nativeCurrency: string | null | undefined, isRent: boolean): string {
  const currency = (nativeCurrency ?? "clp").toLowerCase();
  if (currency === "eur") {
    const formatted = new Intl.NumberFormat("es-ES").format(Math.round(amount));
    return isRent ? `${formatted} €/mes` : `${formatted} €`;
  }
  const formatted = new Intl.NumberFormat("es-CL").format(Math.round(amount));
  const unit = currency === "uf" ? `UF ${formatted}` : currency === "usd" ? `US$ ${formatted}` : `$ ${formatted}`;
  return isRent ? `${unit}/mes` : unit;
}

export function CurrencyProvider({ rates, children }: { rates: ExchangeRates; children: ReactNode }) {
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>("NATIVE");

  // Solo se lee la preferencia guardada tras montar en el cliente — así el
  // primer render (SSR + hydration) coincide siempre con "NATIVE" y no hay
  // parpadeo/mismatch de hidratación.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "EUR" || saved === "CLP" || saved === "USD" || saved === "NATIVE") {
      setDisplayCurrencyState(saved);
    }
  }, []);

  const setDisplayCurrency = (c: DisplayCurrency) => {
    setDisplayCurrencyState(c);
    window.localStorage.setItem(STORAGE_KEY, c);
  };

  const formatPrice = useMemo(() => {
    return (amount: number, nativeCurrency: string | null | undefined, operation: "Venta" | "Alquiler") => {
      const isRent = operation === "Alquiler";
      if (displayCurrency === "NATIVE") return formatNative(amount, nativeCurrency, isRent);

      // Convertimos primero a CLP (todas las tasas de mindicador.cl vienen
      // en CLP por unidad) y de ahí a la moneda elegida.
      const native = (nativeCurrency ?? "clp").toLowerCase();
      let clp: number;
      if (native === "usd") clp = amount * rates.usd;
      else if (native === "uf") clp = amount * rates.uf;
      else if (native === "eur") clp = amount * rates.eur;
      else clp = amount;

      if (displayCurrency === "CLP") {
        return `$ ${new Intl.NumberFormat("es-CL").format(Math.round(clp))}${isRent ? "/mes" : ""}`;
      }
      if (displayCurrency === "USD") {
        const usd = clp / rates.usd;
        return `USD ${new Intl.NumberFormat("en-US").format(Math.round(usd))}${isRent ? "/mes" : ""}`;
      }
      // EUR
      const eur = clp / rates.eur;
      return `${new Intl.NumberFormat("es-ES").format(Math.round(eur))} €${isRent ? "/mes" : ""}`;
    };
  }, [displayCurrency, rates]);

  return (
    <CurrencyContext.Provider value={{ displayCurrency, setDisplayCurrency, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency debe usarse dentro de <CurrencyProvider>");
  return ctx;
}
