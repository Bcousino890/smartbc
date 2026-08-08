/**
 * Test del planificador de vídeos de propiedad.
 *
 * Comprueba las funciones REALES del source (`buildVideoPlan`,
 * `photosFingerprint`, `totalDuration`) en los casos que importan: que la
 * duración cuadra con la fórmula de las transiciones, que se respetan los
 * topes de fotos y de duración, que el peso anunciado nunca puede superarse, y
 * que la huella de las fotos es estable (si no lo fuera, el cron regeneraría
 * los mismos vídeos indefinidamente).
 *
 * No toca la base de datos ni ffmpeg: es aritmética pura.
 *
 * Ejecutar:  node --experimental-strip-types scripts/test-video-plan.mts
 */
import {
  buildVideoPlan,
  photosFingerprint,
  totalDuration,
} from "../lib/services/video/plan.ts";
import {
  DEFAULT_SETTINGS,
  MIN_PHOTOS,
  STORAGE_LIMIT_BYTES,
  normalizeSettings,
} from "../lib/services/video/config.ts";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function planOrThrow(params: Parameters<typeof buildVideoPlan>[0]) {
  const result = buildVideoPlan(params);
  if (!result.ok) throw new Error(`plan rechazado: ${result.error}`);
  return result.plan;
}

const base = {
  settings: DEFAULT_SETTINGS,
  format: "horizontal" as const,
  resolution: "fullhd" as const,
};

// ── Duración ────────────────────────────────────────────────────────────────
console.log("\nDuración");
{
  // Con N fotos de D segundos y transiciones de T: N·D − (N−1)·T.
  check(
    "fórmula con 6 fotos de 3,5s y transición de 0,6s",
    Math.abs(totalDuration(6, 3.5, 0.6) - (6 * 3.5 - 5 * 0.6)) < 1e-9,
    String(totalDuration(6, 3.5, 0.6)),
  );
  check("una sola foto dura lo que dura la foto", totalDuration(1, 3.5, 0.6) === 3.5);
  check("cero fotos duran cero", totalDuration(0, 3.5, 0.6) === 0);

  const plan = planOrThrow({ ...base, availablePhotos: 6 });
  check(
    "el plan usa la misma fórmula",
    Math.abs(plan.durationSeconds - totalDuration(6, 3.5, 0.6)) < 0.01,
    `${plan.durationSeconds}s`,
  );
}

// ── Topes ───────────────────────────────────────────────────────────────────
console.log("\nTopes de fotos y duración");
{
  const plan = planOrThrow({ ...base, availablePhotos: 200 });
  check("nunca pasa del tope de fotos", plan.usedPhotos <= DEFAULT_SETTINGS.maxPhotos);
  check(
    "nunca pasa del tope de duración (2:30)",
    plan.durationSeconds <= DEFAULT_SETTINGS.maxDurationSeconds,
    `${plan.durationSeconds}s`,
  );
  check("informa de las fotos descartadas", plan.droppedPhotos === 200 - plan.usedPhotos);
  check("avisa al usuario de que descarta fotos", plan.warnings.length > 0);

  // Con fotos muy largas manda la duración, no el número de fotos.
  const slow = planOrThrow({
    ...base,
    availablePhotos: 40,
    settings: normalizeSettings({ ...DEFAULT_SETTINGS, secondsPerPhoto: 10 }),
  });
  check(
    "con 10s por foto manda el tope de duración",
    slow.usedPhotos < 40 && slow.durationSeconds <= DEFAULT_SETTINGS.maxDurationSeconds,
    `${slow.usedPhotos} fotos, ${slow.durationSeconds}s`,
  );
}

// ── Mínimo de fotos ─────────────────────────────────────────────────────────
console.log("\nMínimo de fotos");
{
  const tooFew = buildVideoPlan({ ...base, availablePhotos: MIN_PHOTOS - 1 });
  check("rechaza por debajo del mínimo", !tooFew.ok);

  const exact = buildVideoPlan({ ...base, availablePhotos: MIN_PHOTOS });
  check("acepta justo en el mínimo", exact.ok);
}

// ── Peso ────────────────────────────────────────────────────────────────────
console.log("\nEstimación de peso");
{
  for (const resolution of ["fullhd", "4k"] as const) {
    for (const format of ["horizontal", "vertical"] as const) {
      const plan = planOrThrow({ ...base, format, resolution, availablePhotos: 40 });
      const label = `${resolution}/${format}`;

      check(
        `${label}: el máximo cabe en el límite del almacenamiento`,
        plan.maxBytes <= STORAGE_LIMIT_BYTES,
        `${(plan.maxBytes / 1024 / 1024).toFixed(0)} MB > ${STORAGE_LIMIT_BYTES / 1024 / 1024} MB`,
      );
      check(
        `${label}: la horquilla contiene el valor previsto`,
        plan.estimatedLowBytes <= plan.estimatedBytes &&
          plan.estimatedBytes <= plan.estimatedHighBytes,
      );
      check(
        `${label}: el máximo no queda por debajo de la horquilla`,
        plan.estimatedHighBytes <= plan.maxBytes,
      );
    }
  }

  // Con calibración el peso previsto sigue al bitrate medido.
  const calibrated = planOrThrow({
    ...base,
    availablePhotos: 20,
    calibratedBitrateKbps: 2000,
  });
  const uncalibrated = planOrThrow({ ...base, availablePhotos: 20 });
  check("marca cuándo el peso viene de renders reales", calibrated.calibrated);
  check("sin calibrar no lo marca", !uncalibrated.calibrated);
  check(
    "un bitrate medido más bajo baja el peso previsto",
    calibrated.estimatedBytes < uncalibrated.estimatedBytes,
  );
  check(
    "calibrado estrecha la horquilla",
    calibrated.estimatedHighBytes / calibrated.estimatedBytes <
      uncalibrated.estimatedHighBytes / uncalibrated.estimatedBytes,
  );
}

// ── Ajustes inválidos ───────────────────────────────────────────────────────
console.log("\nAjustes inválidos no rompen el render");
{
  // Una transición más larga que la foto daría un offset de xfade ≤ 0 y ffmpeg
  // fallaría con un grafo inválido.
  const bad = normalizeSettings({ secondsPerPhoto: 1, transitionSeconds: 3 });
  check(
    "la transición nunca alcanza a la duración de la foto",
    bad.transitionSeconds < bad.secondsPerPhoto,
    `${bad.transitionSeconds} vs ${bad.secondsPerPhoto}`,
  );

  const junk = normalizeSettings({
    secondsPerPhoto: "no soy un número",
    maxPhotos: -5,
    defaultFormat: "diagonal",
    musicVolume: 99,
  });
  check("un valor no numérico cae al default", junk.secondsPerPhoto === DEFAULT_SETTINGS.secondsPerPhoto);
  check("un máximo negativo se sube al mínimo", junk.maxPhotos >= MIN_PHOTOS);
  check("un formato inventado cae al default", junk.defaultFormat === DEFAULT_SETTINGS.defaultFormat);
  check("el volumen se recorta a 0–1", junk.musicVolume <= 1);
  check("normalizar null no lanza", normalizeSettings(null).maxPhotos === DEFAULT_SETTINGS.maxPhotos);
}

// ── Huella de las fotos ─────────────────────────────────────────────────────
console.log("\nHuella de las fotos");
{
  const urls = ["https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg"];
  const extra = {
    format: "horizontal" as const,
    resolution: "fullhd" as const,
    secondsPerPhoto: 3.5,
    transitionSeconds: 0.6,
    musicTrackId: "track-1",
  };
  const reference = photosFingerprint(urls, extra);

  check("misma entrada, misma huella", photosFingerprint(urls, extra) === reference);
  check(
    "cambiar una foto cambia la huella",
    photosFingerprint([...urls.slice(0, 2), "https://a/9.jpg"], extra) !== reference,
  );
  check(
    "reordenar las fotos cambia la huella",
    photosFingerprint([urls[1], urls[0], urls[2]], extra) !== reference,
  );
  check(
    "añadir una foto cambia la huella",
    photosFingerprint([...urls, "https://a/4.jpg"], extra) !== reference,
  );
  check(
    "cambiar de formato cambia la huella",
    photosFingerprint(urls, { ...extra, format: "vertical" }) !== reference,
  );
  check(
    "cambiar de música cambia la huella",
    photosFingerprint(urls, { ...extra, musicTrackId: "track-2" }) !== reference,
  );
  check(
    "quitar la música cambia la huella",
    photosFingerprint(urls, { ...extra, musicTrackId: null }) !== reference,
  );
}

console.log(
  failures === 0
    ? "\n✅ Todas las comprobaciones pasan\n"
    : `\n❌ ${failures} comprobación(es) fallan\n`,
);
process.exit(failures === 0 ? 0 : 1);
