/** Operación de un anuncio importado por enlace. Ejecutar: npm run test:import-operation */
import { detectOperation } from "../lib/sync/import-by-link/detect-operation.ts";

let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log("    ", detail);
  }
};

console.log("\nOperación por enlace");
check(
  "título «en venta» gana a una descripción que dice «alquiler»",
  detectOperation({ title: "Piso en venta en Calle de Hermosilla", description: "Ideal para inversión: rentabilidad por alquiler." }) === "sale",
);
check("título «Alquiler de piso» es alquiler", detectOperation({ title: "Alquiler de piso en Goya", description: "Se vende mobiliario" }) === "rent");
check("sin título, «€/mes» en el precio es alquiler", detectOperation({ priceText: "2.400 €/mes" }) === "rent");
check("la URL desempata cuando el texto no dice nada", detectOperation({ title: "Piso en Goya", sourceUrl: "https://x/venta-viviendas/madrid" }) === "sale");
check("solo la descripción: venta", detectOperation({ description: "Se vende piso luminoso" }) === "sale");
check("descripción con las dos cosas: no adivina", detectOperation({ description: "Se vende piso, también alquiler posible" }) === null);
check("alquiler a 995.000 € es una venta mal marcada", detectOperation({ title: "Alquiler de piso", price: 995000 }) === "sale");
check("alquiler a 2.400 € se queda", detectOperation({ title: "Alquiler de piso", price: 2400 }) === "rent");
check("sin ninguna señal: null", detectOperation({ title: "Piso en Goya" }) === null);

console.log(failures ? `\n✗ ${failures} fallo(s)` : "\n✓ Todo en verde");
process.exit(failures ? 1 : 0);
