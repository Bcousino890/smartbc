"use client";

// ============================================================================
// Singular y plural.
//
// El diccionario es un mapa plano de cadenas, sin reglas de plural. Con una
// sola forma sale "Faltan 1 cosas por resolver", que es exactamente el tipo de
// detalle que hace que un panel interno parezca a medio hacer.
//
// Convenio: si existe `<clave>.one`, se usa cuando el contador vale 1. Si no
// existe, se usa la clave normal — así solo hay que escribir la forma singular
// donde de verdad chirría, y añadirla después nunca rompe nada.
//
// La comprobación se hace contra el diccionario español porque es el idioma
// base y `scripts/`… bueno, porque el verificador de claves obliga a que los
// cuatro idiomas tengan exactamente el mismo juego.
// ============================================================================

import { useCallback } from "react";
import { dictionary } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/provider";

type Vars = Record<string, string | number>;

export function useTn() {
  const t = useT();
  return useCallback(
    (key: string, count: number, vars?: Vars) => {
      const one = `${key}.one`;
      const useOne = count === 1 && one in dictionary.es;
      return t(useOne ? one : key, { ...vars, count });
    },
    [t],
  );
}
