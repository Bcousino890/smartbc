// Núcleo de los filtros de la extensión (chrome-extension/filters-core.js): sin DOM ni red.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const core = createRequire(import.meta.url)("../chrome-extension/filters-core.js");
const { extract, passes, sanitize, emptyState, agencyPasses } = core;

const card = (o) => extract({ operation: "sale", ...o });
let n = 0;
const t = (name, fn) => { fn(); n++; };

t("habitaciones y estudios", () => {
  assert.equal(card({ details: "3 hab. | 90 m²" }).rooms, 3);
  assert.equal(card({ details: "4 bed. | 157 m²" }).rooms, 4);
  assert.equal(card({ title: "Estudio en Calle Mayor", details: "35 m²" }).rooms, 0);
  assert.equal(card({ details: "90 m²" }).rooms, null);
  const st = { ...emptyState(), rooms: ["0"] };
  assert.equal(passes(card({ title: "Estudio en Sol", details: "30 m²" }), st), true);
  assert.equal(passes(card({ details: "1 hab." }), st), false);
  assert.equal(passes(card({ details: "90 m²" }), st), false, "sin dato no entra en 'solo estudios'");
  const four = { ...emptyState(), rooms: ["4"] };
  assert.equal(passes(card({ details: "6 hab." }), four), true);
  assert.equal(passes(card({ details: "3 hab." }), four), false);
  const two = { ...emptyState(), rooms: ["2"] };
  assert.equal(passes(card({ details: "3 hab." }), two), false, "exacto: 2 no es 3");
});

t("baños", () => {
  assert.equal(card({ details: "3 habs · 2 baños · 120 m²" }).baths, 2);
  assert.equal(card({ text: "2 bathrooms" }).baths, 2);
  assert.equal(passes(card({ details: "2 baños" }), { ...emptyState(), baths: ["3"] }), false);
  assert.equal(passes(card({ details: "4 baños" }), { ...emptyState(), baths: ["3"] }), true);
});

t("situación de la vivienda", () => {
  assert.deepEqual(card({ description: "Vendo en nuda propiedad" }).situation, ["nuda"]);
  assert.deepEqual(card({ description: "Piso alquilado con inquilino hasta 2027" }).situation, ["inquilino"]);
  assert.deepEqual(card({ description: "Vivienda sin inquilinos, libre de cargas" }).situation, ["libre"]);
  assert.deepEqual(card({ description: "Buen nivel de bueno inquilino mercado" }).situation.includes("inquilino"), true);
  assert.deepEqual(card({ description: "Ocupada ilegalmente, se vende así" }).situation, ["ocupada"]);
  assert.deepEqual(card({ description: "Casa no ocupada, entrega inmediata" }).situation, ["libre"]);
  assert.deepEqual(card({ description: "Procedente de subasta judicial" }).situation, ["subasta"]);
  assert.deepEqual(card({ description: "Piso reformado en Chamberí" }).situation, ["libre"]);
  const st = { ...emptyState(), situation: ["nuda", "ocupada"] };
  assert.equal(passes(card({ description: "nuda propiedad" }), st), true);
  assert.equal(passes(card({ description: "piso normal" }), st), false);
  assert.equal(passes(extract({ operation: "rent", description: "piso normal" }), st), true, "la situación no se aplica en alquiler");
});

t("estancia en alquiler", () => {
  const r = (description) => extract({ operation: "rent", description });
  assert.equal(r("Alquiler de temporada, de septiembre a junio").stay, "corta");
  assert.equal(r("Contrato de larga estancia de un año").stay, "larga");
  assert.equal(r("Piso luminoso en Goya").stay, "larga");
  assert.equal(card({ description: "temporada" }).stay, null, "en venta no hay estancia");
  assert.equal(passes(r("temporada"), { ...emptyState(), stay: ["larga"] }), false);
  assert.equal(passes(card({ description: "x" }), { ...emptyState(), stay: ["larga"] }), true);
});

t("mascotas, lujo, accesible", () => {
  assert.deepEqual(card({ description: "Se admiten mascotas." }).perks, ["mascotas"]);
  assert.deepEqual(card({ description: "No se admiten mascotas." }).perks, []);
  assert.deepEqual(card({ description: "Sin mascotas" }).perks, []);
  assert.deepEqual(card({ badges: { luxury: true } }).perks, ["lujo"]);
  assert.deepEqual(card({ description: "Edificio accesible con rampa" }).perks, ["accesible"]);
  const st = { ...emptyState(), perks: ["mascotas", "accesible"] };
  assert.equal(passes(card({ description: "admite mascotas y accesible" }), st), true);
  assert.equal(passes(card({ description: "admite mascotas" }), st), false, "deben cumplirse todas");
});

t("multimedia y precio rebajado", () => {
  const f = card({ badges: { plan: true, video: true, tour3d: false, priceDrop: true } });
  assert.deepEqual(f.media, ["plan", "video"]);
  assert.equal(f.priceDrop, true);
  assert.equal(passes(f, { ...emptyState(), media: ["video"], priceDrop: true }), true);
  assert.equal(passes(f, { ...emptyState(), media: ["tour3d"] }), false);
  assert.equal(card({ text: "Precio rebajado | 300.000 €" }).priceDrop, true);
  assert.equal(card({ text: "Ayuda pública a la entrada" }).aid, true);
  assert.equal(passes(card({ text: "x" }), { ...emptyState(), aid: true }), false);
});

t("estado guardado e incompleto", () => {
  assert.deepEqual(sanitize(null), emptyState());
  const s = sanitize({ rooms: ["1", "9", 3], perks: ["mascotas", "x"], priceDrop: "si", only: ["gilmar", 4] });
  assert.deepEqual(s.rooms, ["1"]);
  assert.deepEqual(s.perks, ["mascotas"]);
  assert.equal(s.priceDrop, false);
  assert.deepEqual(s.only, ["gilmar"]);
  assert.equal(core.isActive(emptyState()), false);
  assert.equal(core.isActive({ ...emptyState(), aid: true }), true);
});

t("agencias: ocultar y solo estas", () => {
  assert.equal(agencyPasses("gilmar chamberi", ["gilmar"], []), false);
  assert.equal(agencyPasses("engel volkers", ["gilmar"], []), true);
  assert.equal(agencyPasses("engel volkers", [], ["engel"]), true);
  assert.equal(agencyPasses("gilmar", [], ["engel"]), false);
  assert.equal(agencyPasses(null, [], ["engel"]), false, "un particular no entra si piden solo agencias");
  assert.equal(agencyPasses(null, ["gilmar"], []), true);
  assert.equal(agencyPasses("gilmar", ["gilmar"], ["gilmar"]), false, "ocultar manda sobre solo-estas");
});

console.log(`OK · ${n} grupos de pruebas del núcleo de filtros`);
