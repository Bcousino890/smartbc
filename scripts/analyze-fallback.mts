// ANÁLISIS de los fallback restantes. Read-only: no escribe nada.
import { createAdminClient } from "../lib/db/admin";
import { planPublication, evaluateGate, GATE_LABELS, NARRATIVE_CHAPTERS } from "../lib/services/story/gate";
const db = createAdminClient() as any;
const norm = (s: any) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

const { data: active } = await db.from("properties").select("id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at, latitude, longitude").is("archived_at", null).neq("status","archived").limit(2000);
const { data: approvedV } = await db.from("property_story_versions").select("property_id").eq("status","approved");
const already = new Set((approvedV ?? []).map((r: any) => r.property_id));
const versions: any[] = [];
for (let f=0;;f+=1000){const {data}=await db.from("property_story_versions").select("id, property_id, created_at").eq("status","generated").order("created_at",{ascending:false}).range(f,f+999);if(!data?.length)break;versions.push(...data);if(data.length<1000)break;}
const latest = new Map<string,any>(); for(const v of versions) if(!latest.has(v.property_id)) latest.set(v.property_id,v);
const { data: hoods } = await db.from("neighborhoods").select("zone_key, display_name");
const hoodMap = new Map((hoods ?? []).map((h:any)=>[h.zone_key,h.display_name]));

const M = { chapters:{0:0,1:0,2:0,"3+":0}, photos:{"0-3":0,"4-7":0,"8+":0}, video:0, plan:0, hood:0, noHood:0 };
const reasons: Record<string,number> = {};
let recoverBy2Chapters=0, recoverByPhotos=0, overlap=0, trueFallback=0;
const detail2ch: string[] = [], detailPhoto: string[] = [];

for (const p of active ?? []) {
  if (already.has(p.id)) continue;
  const v = latest.get(p.id);
  if (!v) { reasons["sin story"]=(reasons["sin story"]??0)+1; M.chapters[0]++; M.photos["0-3"]++; continue; }
  const [{data:blocks},{data:claims},{data:photos},{data:media}] = await Promise.all([
    db.from("property_story_blocks").select("id, chapter, copy, status, claim_ids").eq("version_id",v.id).order("position"),
    db.from("property_story_claims").select("id, source_text, fact, category, conflict").eq("version_id",v.id),
    db.from("property_photos").select("position, ai_class, ai_confidence, class_override").eq("property_id",p.id).order("position"),
    db.from("property_media").select("type").eq("property_id",p.id),
  ]);
  const hoodName = hoodMap.get(norm(p.subzone)||norm(p.zone)) ?? null;
  const plan = planPublication({ property:p, blocks:blocks??[], claims:claims??[], photos:photos??[], neighborhoodDisplayName:hoodName });
  if (plan.publishable) continue; // ya contabilizada como publicable

  const nPhotos = (photos??[]).length;
  const hasVideo = (media??[]).some((m:any)=>m.type==="video");
  const hasPlan = (media??[]).some((m:any)=>m.type==="plan");
  // capítulos narrativos limpios tras exclusiones
  const excluded = new Set(plan.excluded.map(e=>e.blockId));
  const clean = (blocks??[]).filter((b:any)=>b.status!=="rejected" && !excluded.has(b.id));
  const nNarr = clean.filter((b:any)=>NARRATIVE_CHAPTERS.includes(b.chapter)).length;
  M.chapters[nNarr===0?0:nNarr===1?1:nNarr===2?2:"3+"]++;
  M.photos[nPhotos<=3?"0-3":nPhotos<=7?"4-7":"8+"]++;
  if(hasVideo)M.video++; if(hasPlan)M.plan++; if(hoodName)M.hood++; else M.noHood++;
  const first = plan.storyFailures[0];
  const rl = first ? GATE_LABELS[first.code] : "sin bloques publicables";
  reasons[rl]=(reasons[rl]??0)+1;

  // ── Escenario B: exactamente 2 capítulos + ficha rica ──
  const detailsPopulated = ([...(p.features??[]),...(p.features_manual??[])]).length >= 3;
  const validLocation = p.latitude != null && p.longitude != null;
  const extras = [hoodName?1:0, detailsPopulated?1:0, hasVideo?1:0, hasPlan?1:0, validLocation?1:0, nPhotos>=8?1:0].reduce((a,b)=>a+b,0);
  const otherFailsOk = plan.storyFailures.every((f:any)=>["few_chapters","low_photos"].includes(f.code));
  const okB = nNarr===2 && extras>=2 && otherFailsOk && nPhotos>=4;
  // ── Escenario C: gate de fotos relajado (4-7) con ≥3 capítulos ──
  const okC = nNarr>=3 && nPhotos>=4 && nPhotos<8 && otherFailsOk;
  if (okB && okC) { overlap++; recoverBy2Chapters++; }
  else if (okB) { recoverBy2Chapters++; if(detail2ch.length<5) detail2ch.push(`${p.bc_reference} (${nNarr}cap ${nPhotos}f extras:${extras})`); }
  else if (okC) { recoverByPhotos++; if(detailPhoto.length<5) detailPhoto.push(`${p.bc_reference} (${nNarr}cap ${nPhotos}f)`); }
  else trueFallback++;
}
console.log("=== A · CAPÍTULOS LIMPIOS TRAS EXCLUSIONES ==="); console.log(JSON.stringify(M.chapters));
console.log("=== B · FOTOS ==="); console.log(JSON.stringify(M.photos));
console.log(`=== C · MEDIA === vídeo:${M.video} plano:${M.plan}`);
console.log(`=== D · BARRIO === curado:${M.hood} sin curar:${M.noHood}`);
console.log("=== E · MOTIVO ==="); console.log(JSON.stringify(reasons,null,1));
console.log(`\n=== ESCENARIOS ===`);
console.log(`B · 2 capítulos + ficha rica:      ${recoverBy2Chapters}  ej. ${detail2ch.join(", ")}`);
console.log(`C · fotos 4-7 con ≥3 capítulos:    ${recoverByPhotos}  ej. ${detailPhoto.join(", ")}`);
console.log(`   solapamiento (cumplen ambos):   ${overlap}`);
console.log(`TRUE FALLBACK tras relajación:     ${trueFallback}`);
