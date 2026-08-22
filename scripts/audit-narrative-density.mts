// AUDITORÍA DE DENSIDAD NARRATIVA (§8 del cierre).
//
// Clasifica cada propiedad activa en tres cajones, con el MISMO criterio de
// seguridad que usa la publicación — nada de aflojar invariantes:
//
//   A · SOURCE-RICH / OUTPUT-THIN
//       Hay evidencia segura de sobra (claims sin conflicto) pero lo que se
//       renderiza es pobre. El problema es de composición, no de datos.
//   B · DATA-RICH / DESCRIPTION-POOR
//       La descripción da poco, pero los datos estructurados (features) traen
//       atributos distintivos que NO son Key Facts.
//   C · GENUINELY CONTENT-POOR
//       No hay material. Aquí el SmartLink debe ser corto a propósito.
//
// Solo lee. No escribe nada.

import { createAdminClient } from "../lib/db/admin";
import { collectPreludeEvidence } from "../lib/services/story/prelude";
import { NARRATIVE_CHAPTERS } from "../lib/services/story/gate";
import { isMicroChapter } from "../lib/services/story/micro-chapter";

/** Los capítulos que ocupan banda propia en el SmartLink. `overview` y
 *  `barrio` no cuentan: el primero lo silencia el prelude y el segundo se
 *  renderiza en su propia sección. */
const RENDERED_CHAPTERS = ["living", "kitchen", "private", "outdoor", "finishes", "building"];

/** Atributos de `features` que aportan carácter y NO están en Key Facts. */
const KEY_FACT_LIKE =
  /^(dormitorio|habitacion|baño|aseo|superficie|metros|planta|precio|garaje|ascensor)/i;
const DISTINCTIVE =
  /(reform|terraza|balcón|balcon|jardín|jardin|piscina|chimenea|moldura|carpinter|madera|parquet|tarima|suelo radiante|aerotermia|domótic|domotic|vistas|exterior|luminos|trastero|portero|conserje|climatiza|aire acondicionado|calefacc|cocina|armario|vestidor|orientaci)/i;

function words(t: string): number {
  return (t.trim().match(/\S+/g) ?? []).length;
}

async function main() {
  const db = createAdminClient() as any;

  const props: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("properties")
      .select("id, bc_reference, slug, description, features, features_manual, status, archived_at")
      .is("archived_at", null)
      .neq("status", "archived")
      .range(from, from + 999);
    if (!data?.length) break;
    props.push(...data);
    if (data.length < 1000) break;
  }

  const versions: any[] = [];
  for (const status of ["approved", "generated"]) {
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from("property_story_versions")
        .select("id, property_id, status, notes, prelude, prelude_status, created_at")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .range(from, from + 999);
      if (!data?.length) break;
      versions.push(...data);
      if (data.length < 1000) break;
    }
  }
  const byProp = new Map<string, any>();
  for (const v of versions) {
    const prev = byProp.get(v.property_id);
    if (!prev || (prev.status !== "approved" && v.status === "approved")) byProp.set(v.property_id, v);
  }

  const buckets = { A: [] as string[], B: [] as string[], C: [] as string[], ok: 0 };
  const micro: Array<{ ref: string; chapter: string; copy: string }> = [];
  let losesAll = 0;
  const causes = { conflictBlocks: 0, draftVersion: 0, fewChapters: 0, unusedClaims: 0 };
  let noPrelude = 0;

  for (const p of props) {
    const v = byProp.get(p.id);
    const [{ data: claims }, { data: blocks }] = await Promise.all([
      v
        ? db.from("property_story_claims")
            .select("id, fact, source_text, category, conflict, is_duplicate")
            .eq("version_id", v.id)
        : Promise.resolve({ data: [] }),
      v
        ? db.from("property_story_blocks")
            .select("chapter, copy, status")
            .eq("version_id", v.id)
        : Promise.resolve({ data: [] }),
    ]);

    const visible = (blocks ?? []).filter(
      (b: any) => b.status !== "rejected" && b.status !== "conflict" && b.copy,
    );
    const narrative = visible.filter((b: any) => NARRATIVE_CHAPTERS.includes(b.chapter));
    // Lo que el cliente lee incluye la APERTURA EDITORIAL, no solo los
    // capítulos: contar únicamente los bloques daba por pobre a una ficha con
    // un prelude de 90 palabras y un capítulo. Es el texto que se ve.
    const preludeWords =
      v?.prelude_status === "approved" ? words(v.prelude ?? "") : 0;
    const renderedWords =
      visible.reduce((a: number, b: any) => a + words(b.copy), 0) + preludeWords;
    const evidence = collectPreludeEvidence((claims ?? []) as any);

    // Micro-capítulos: un capítulo que ocupa sitio para decir un dato suelto.
    let microHere = 0;
    for (const b of visible) {
      if (!RENDERED_CHAPTERS.includes(b.chapter)) continue;
      if (isMicroChapter(b.chapter, b.copy)) {
        micro.push({ ref: p.bc_reference, chapter: b.chapter, copy: b.copy });
        microHere++;
      }
    }
    const renderedChapters = visible.filter((b: any) => RENDERED_CHAPTERS.includes(b.chapter));
    if (renderedChapters.length > 0 && microHere === renderedChapters.length) losesAll++;

    const feats: string[] = [
      ...(p.features ?? []),
      ...(p.features_manual ?? []),
    ].filter((f: string) => f && !KEY_FACT_LIKE.test(f));
    const distinctive = feats.filter((f: string) => DISTINCTIVE.test(f));
    const descWords = words(p.description ?? "");

    // El listón de "pobre a la vista": poca narrativa renderizada.
    // Pobre a la vista = poco texto Y poca estructura. Con prelude aprobado
    // el listón de capítulos baja: la apertura ya sostiene la lectura.
    const thinOutput = renderedWords < 90 || (narrative.length < 2 && preludeWords === 0);

    if (!thinOutput) {
      buckets.ok++;
      continue;
    }
    if (evidence.claimIds.length >= 6) {
      buckets.A.push(p.bc_reference);
      if (preludeWords === 0) noPrelude++;
      // §10 · por qué la salida es pobre teniendo materia prima.
      const conflicted = (blocks ?? []).filter((b: any) => b.status === "conflict").length;
      if (conflicted > 0) causes.conflictBlocks++;
      else if (v?.status !== "approved") causes.draftVersion++;
      else if (narrative.length < 2) causes.fewChapters++;
      else causes.unusedClaims++;
    } else if (descWords < 40 && distinctive.length >= 2) {
      buckets.B.push(p.bc_reference);
    } else {
      buckets.C.push(p.bc_reference);
    }
  }

  console.log(`ACTIVAS: ${props.length}`);
  console.log(`CON NARRATIVA SUFICIENTE: ${buckets.ok}`);
  console.log(`A · SOURCE-RICH / OUTPUT-THIN: ${buckets.A.length}`);
  console.log(`B · DATA-RICH / DESCRIPTION-POOR: ${buckets.B.length}`);
  console.log(`C · GENUINELY CONTENT-POOR: ${buckets.C.length}`);
  console.log(`MICRO-CAPÍTULOS (solo capítulos con banda propia): ${micro.length}`);
  console.log(`  props que se quedarían SIN ningún capítulo: ${losesAll}`);
  console.log(`  de ellas, SIN apertura editorial (recuperable): ${noPrelude}`);
  console.log(`CAUSAS EN EL GRUPO A: bloques en conflicto=${causes.conflictBlocks} · versión borrador=${causes.draftVersion} · pocos capítulos=${causes.fewChapters} · claims sin usar=${causes.unusedClaims}`);
  console.log(`\nA (primeros 25): ${buckets.A.slice(0, 25).join(", ")}`);
  console.log(`\nB (primeros 25): ${buckets.B.slice(0, 25).join(", ")}`);
  console.log(`\nC (primeros 15): ${buckets.C.slice(0, 15).join(", ")}`);
  console.log(`\nMicro-capítulos (primeros 15):`);
  for (const m of micro.slice(0, 15)) console.log(`  ${m.ref} · ${m.chapter} · "${m.copy.slice(0, 70)}"`);
  process.exit(0);
}

void main();
