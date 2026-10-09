import { fetchHtml } from "../lib/sync/import-by-link/fetch-html";
import { writeFileSync } from "node:fs";
const url = "https://www.idealista.com/venta-viviendas/madrid/chamberi/con-precio-hasta_1000000,precio-desde_800000/";
const r: any = await fetchHtml(url);
console.log("ok:", r.ok, r.ok ? r.html.length : (r.reason ?? r.error));
if (r.ok) writeFileSync(process.argv[2], r.html);
process.exit(0);
