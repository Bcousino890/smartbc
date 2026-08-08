import "server-only";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Preparación de los fotogramas base con sharp, ANTES de que entre ffmpeg.
//
// Repartir el trabajo así (sharp encuadra, ffmpeg anima) tiene dos motivos:
//   1. sharp ya es dependencia del proyecto y es muy rápido escalando.
//   2. deja el grafo de filtros de ffmpeg mucho más simple — menos sitios
//      donde el render pueda romperse.
//
// Regla del encuadre: la foto NUNCA se deforma ni se recorta. Se escala entera
// dentro del lienzo y el hueco que sobra (típico en vertical, porque las fotos
// inmobiliarias son apaisadas) se rellena con la propia foto ampliada y
// desenfocada. Es el mismo recurso que usan Reels/Stories: no queda banda
// negra y la vista sigue centrada en la propiedad.

const LOGO_WIDTH_RATIO = 0.16;
const BACKGROUND_BRIGHTNESS = 0.55;

/**
 * Halo del logo: cuánto se solidifica la silueta antes de difuminarla y hasta
 * dónde llega su opacidad.
 */
const GLOW_SOLIDIFY = 6;
const GLOW_DILATE = 3.5;
const GLOW_MAX_ALPHA = 190;

/**
 * Difumina un mapa de 1 canal y devuelve otro mapa de 1 canal.
 *
 * Dos detalles que hay que respetar sí o sí:
 *   · `.raw()`, o sharp codifica la salida (PNG) y leerla como píxeles sueltos
 *     devuelve basura.
 *   · `.toColorspace("b-w")`, o sharp asciende la entrada de 1 canal a sRGB y
 *     saca TRES canales; leyendo eso como uno solo se recorre el buffer en
 *     diagonal y el resultado sale rayado.
 */
async function blurChannel(
  input: Buffer,
  width: number,
  height: number,
  sigma: number,
): Promise<Buffer> {
  const { data, info } = await sharp(input, { raw: { width, height, channels: 1 } })
    .blur(Math.max(0.3, sigma))
    .toColorspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 1) {
    throw new Error(`El desenfoque devolvió ${info.channels} canales en vez de 1.`);
  }
  return data;
}

/** ffmpeg con yuv420p exige lados pares. */
function toEven(n: number): number {
  const rounded = Math.round(n);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Tamaño al que se prepara cada foto: la resolución de salida multiplicada por
 * el supersampling, para que el zoom del efecto Ken Burns recorte dentro de la
 * imagen en vez de ampliarla (si preparásemos a 1:1, el fotograma más ampliado
 * sería un escalado hacia arriba y se vería blando).
 */
export function canvasSize(
  width: number,
  height: number,
  supersample: number,
): { width: number; height: number } {
  return {
    width: toEven(width * supersample),
    height: toEven(height * supersample),
  };
}

/**
 * Encaja una foto en el lienzo sin deformarla ni recortarla, con fondo
 * desenfocado de la propia foto. Devuelve un JPEG listo para ffmpeg.
 */
export async function buildPhotoCanvas(
  photo: Buffer,
  target: { width: number; height: number },
): Promise<Buffer> {
  // `.rotate()` sin argumentos aplica la orientación EXIF. Sin esto, las fotos
  // hechas con el móvil en vertical salen tumbadas.
  const normalized = await sharp(photo, { failOn: "none" })
    .rotate()
    .toColorspace("srgb")
    .toBuffer();

  // El desenfoque se escala con el lienzo para que se vea igual de suave en
  // Full HD que en 4K.
  const blurSigma = Math.min(150, Math.max(12, target.width / 50));

  const background = await sharp(normalized)
    .resize(target.width, target.height, { fit: "cover", position: "centre" })
    .blur(blurSigma)
    .modulate({ brightness: BACKGROUND_BRIGHTNESS })
    .toBuffer();

  // `fit: "inside"` conserva la proporción y mete la foto ENTERA dentro del
  // lienzo: nada de recorte, nada de estiramiento.
  const foreground = await sharp(normalized)
    .resize(target.width, target.height, { fit: "inside", withoutEnlargement: false })
    .toBuffer();

  return sharp(background)
    .composite([{ input: foreground, gravity: "centre" }])
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

export type LogoOverlay = {
  buffer: Buffer;
  /**
   * Margen transparente que rodea al logo para dejar sitio al halo. Quien
   * coloca el overlay debe restarlo del margen deseado, o el logo quedaría
   * separado del borde por el doble de lo previsto.
   */
  padding: number;
};

/**
 * Prepara el logo de la agencia como PNG con transparencia, listo para
 * superponer con ffmpeg.
 *
 * El logo de la casa es de tinta oscura, así que sobre una foto oscura (un
 * salón en penumbra, una fachada al atardecer) desaparecería. Se le pone
 * detrás un halo claro y difuso: sobre fotos claras casi no se nota y sobre
 * fotos oscuras es lo que hace legible la marca.
 *
 * La atenuación del alfa se hace tocando los píxeles crudos porque
 * sharp/libvips no permite dar opacidad directa en `composite()` — mismo
 * método que ya usa lib/services/idealista/brand-watermark.ts en las fotos.
 */
export async function buildLogoOverlay(
  canvasWidth: number,
  opacity: number,
): Promise<LogoOverlay | null> {
  let source: Buffer;
  try {
    source = await readFile(join(process.cwd(), "public", "logo.png"));
  } catch {
    // Sin logo el vídeo se genera igual, solo que sin marca.
    return null;
  }

  const logoWidth = Math.max(48, Math.round(canvasWidth * LOGO_WIDTH_RATIO));
  const glowSigma = Math.max(3, logoWidth * 0.026);
  const padding = Math.ceil(glowSigma * 3);

  const resized = sharp(source).resize({ width: logoWidth }).ensureAlpha();
  const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const clamped = Math.min(1, Math.max(0, opacity));

  // Halo, en dos pasos: primero se SOLIDIFICA la silueta (el logo es un texto
  // de trazo fino y al reducirlo queda medio transparente) y luego se
  // difumina. El orden importa: amplificar DESPUÉS del desenfoque multiplica
  // también el escalón de cuantización de los 8 bits y salen bandas visibles.
  const silhouette = Buffer.alloc(width * height);
  for (let p = 0; p < width * height; p++) {
    silhouette[p] = Math.min(255, data[p * channels + 3] * GLOW_SOLIDIFY);
  }
  // Dilatar y luego suavizar, en dos pasadas: la primera engorda la silueta
  // hasta formar una base continua bajo el texto, la segunda le da el borde
  // difuso. Hacerlo de una sola pasada deja un resplandor demasiado tenue
  // para que la marca se lea sobre una foto oscura.
  const grown = await blurChannel(silhouette, width, height, glowSigma * 0.55);
  for (let p = 0; p < grown.length; p++) {
    grown[p] = Math.min(255, grown[p] * GLOW_DILATE);
  }
  const spread = await blurChannel(grown, width, height, glowSigma);

  // Atenúa el logo DESPUÉS de haber copiado la silueta, para que el halo no
  // herede también la transparencia y se quede en nada.
  for (let p = 0; p < width * height; p++) {
    data[p * channels + 3] = Math.round(data[p * channels + 3] * clamped);
  }

  const glow = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    glow[p * 4] = 255;
    glow[p * 4 + 1] = 255;
    glow[p * 4 + 2] = 255;
    glow[p * 4 + 3] = Math.min(GLOW_MAX_ALPHA, Math.round(spread[p] * clamped));
  }

  const glowPng = await sharp(glow, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  const logoPng = await sharp(data, { raw: { width, height, channels: channels as 4 } })
    .png()
    .toBuffer();

  const buffer = await sharp({
    create: {
      width: width + padding * 2,
      height: height + padding * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: glowPng, top: padding, left: padding },
      { input: logoPng, top: padding, left: padding },
    ])
    .png()
    .toBuffer();

  return { buffer, padding };
}
