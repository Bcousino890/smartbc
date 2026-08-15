/**
 * Comprobación de fugas sobre el HTML REALMENTE SERVIDO por /v/design-preview.
 *
 * Complementa a scripts/test-viewing-collections-projection.mts: aquel prueba
 * la función de proyección en aislamiento; este prueba lo que sale por el
 * cable después de que React lo serialice, que es donde aparecerían las fugas
 * por props (un objeto interno pasado a un Client Component viaja en el
 * payload RSC aunque no se pinte).
 *
 * Requiere el servidor de desarrollo levantado:
 *   npm run dev
 *   node scripts/check-viewing-collection-html.mjs
 */
// Verifica sobre el HTML SERVIDO que la capa de diseño no ha abierto ninguna
// fuga. La garantía a nivel de PROYECCIÓN (area_only → sin dirección ni
// coordenadas) la cubren los 60 asserts de test:viewing-collections; aquí se
// comprueba lo que de verdad sale por el cable.
const html = await (await fetch("http://localhost:3137/v/design-preview")).text();

const FORBIDDEN = [
  ["owner_*", /owner_(name|phone|email)/i],
  ["internal_notes", /internal_notes/],
  ["agent_notes", /agent_notes/],
  ["source_url", /source_url/],
  ["external_id", /external_id/],
  ["UUID interno", /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ["ruta de Storage", /\/storage\/v1\/object/],
  ["carpeta synced/", /synced\//],
  ["label de SmartLink", /Viewing Collection · /],
];

let bad = 0;
for (const [name, re] of FORBIDDEN) {
  const hit = re.test(html);
  console.log(`  ${hit ? "❌" : "✅"} sin ${name}`);
  if (hit) bad++;
}

// La residencia 3 es area_only: su nombre de calle no debe aparecer.
const areaOnlyLeak = /Calle Alenza/.test(html);
console.log(`  ${areaOnlyLeak ? "❌" : "✅"} la residencia area_only no revela calle`);
if (areaOnlyLeak) bad++;

// Y lo autorizado sí debe verse: si esto falla, el diseño ha roto el producto.
for (const [name, re] of [
  ["la dirección autorizada se muestra", /Calle José Abascal 21/],
  ["el aviso de zona aparece en area_only", /dirección exacta se facilita/],
  ["los estados se dicen con palabras", /POR CONFIRMAR|Por confirmar/i],
]) {
  const ok = re.test(html);
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
  if (!ok) bad++;
}

console.log(bad === 0 ? "\n✅ Sin fugas y sin regresiones funcionales" : `\n❌ ${bad} problema(s)`);
process.exit(bad === 0 ? 0 : 1);
