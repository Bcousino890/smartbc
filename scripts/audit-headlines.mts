import { readFileSync } from "node:fs";
import { validatePreludeHeadline } from "../lib/services/story/prelude";
const hs = readFileSync("/tmp/headlines.txt","utf8").split("\n").map(h=>h.trim()).filter(Boolean);
let bad = 0;
for (const h of hs) {
  const v = validatePreludeHeadline(h, { operation: "sale" }, []);
  if (!v.ok) { bad++; console.log(`✗ ${h}  →  ${v.failures.join(" · ")}`); }
}
console.log(`\n${bad}/${hs.length} incumplen el contrato de titular`);
