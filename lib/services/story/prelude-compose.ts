// PROPERTY PRELUDE · composición con el modelo.
//
// El bucle de intentos vive aquí y NO en cada llamador: el panel de admin y
// el generador en lote deben comportarse exactamente igual, incluido el
// fail-closed. Si el modelo no produce algo que pase el contrato en `attempts`
// intentos, no se guarda nada — nunca un texto "casi bueno".
//
// El contrato (prelude.ts) es puro y testeable; esto es solo la parte que
// habla con la IA.

import { aiComplete } from "@/lib/services/ai/chat";
import {
  parsePreludeCompletion,
  preludeSystemPrompt,
  preludeUserPrompt,
  validatePrelude,
  validatePreludeHeadline,
  type PreludeContext,
  type PreludeEvidence,
} from "./prelude";

export type ComposeResult =
  | { ok: true; headline: string; body: string; words: number; paragraphs: number }
  | { ok: false; failures: string[] };

export async function composePrelude(
  ctx: PreludeContext,
  evidence: PreludeEvidence,
  attempts = 3,
): Promise<ComposeResult> {
  let feedback = "";
  let last: string[] = ["el modelo no respondió"];

  for (let attempt = 0; attempt < attempts; attempt++) {
    let raw: string;
    try {
      raw = await aiComplete({
        system: preludeSystemPrompt(ctx),
        userText: preludeUserPrompt(evidence) + feedback,
        maxTokens: 600,
      });
    } catch (e: any) {
      return { ok: false, failures: [`IA: ${e?.message ?? "error"}`] };
    }

    const { headline, body } = parsePreludeCompletion(raw);
    const bodyVerdict = validatePrelude(body, ctx, evidence.texts);
    // El titular es opcional en la BD pero NO en la generación: si el modelo
    // no lo da (o no cumple), se reintenta. Un spread sin titular es una
    // degradación aceptable para textos heredados, no un resultado a producir.
    const headVerdict = validatePreludeHeadline(headline, ctx, evidence.texts);

    if (bodyVerdict.ok && headVerdict.ok) {
      return {
        ok: true,
        headline,
        body,
        words: bodyVerdict.words,
        paragraphs: bodyVerdict.paragraphs,
      };
    }

    last = [
      ...headVerdict.failures.map((f) => `TITULAR: ${f}`),
      ...bodyVerdict.failures.map((f) => `CUERPO: ${f}`),
    ];
    feedback = `\n\nEL INTENTO ANTERIOR INCUMPLIÓ: ${last.join("; ")}. Corrígelo respetando el formato TITULAR + dos párrafos.`;
  }

  return { ok: false, failures: last };
}
