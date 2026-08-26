"use client";

import { useCurrency } from "./CurrencyProvider";

export function Price({
  amount,
  currency,
  operation,
}: {
  amount: number;
  currency: string | null | undefined;
  operation: "Venta" | "Alquiler";
}) {
  const { formatPrice } = useCurrency();
  return <>{formatPrice(amount, currency, operation)}</>;
}
