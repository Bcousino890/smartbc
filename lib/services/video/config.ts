// Ajustes y constantes de la generación de vídeos de propiedad.
//
// Este módulo es la ÚNICA fuente de verdad de los defaults: la migración 0115
// siembra los mismos valores en app_settings, pero si esa fila falta, está
// incompleta o trae basura, aquí se rellena y se valida. Así un ajuste mal
// guardado nunca deja el render en un estado imposible (0 fotos, duración
// negativa, formato inventado…).

export type VideoFormat = "horizontal" | "vertical";
export type VideoResolution = "fullhd" | "4k";

/**
 * Esquina donde se incrusta el logo de la agencia.
 *
 * Arriba es lo habitual en inmobiliaria: la parte baja del encuadre suele
 * llevar el suelo o el mobiliario (donde la marca se pierde) y, además, los
 * reproductores incrustados pintan ahí sus controles y la tapan.
 */
export type LogoPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";

export const LOGO_POSITIONS: LogoPosition[] = [
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
];

export const LOGO_POSITION_LABELS: Record<LogoPosition, string> = {
  "top-right": "Arriba a la derecha",
  "top-left": "Arriba a la izquierda",
  "bottom-right": "Abajo a la derecha",
  "bottom-left": "Abajo a la izquierda",
};

export type VideoSettings = {
  /** Generación automática para las propiedades sincronizadas de Idealista. */
  enabled: boolean;
  /** Segundos que se ve cada foto, transición incluida. */
  secondsPerPhoto: number;
  /** Duración del fundido cruzado entre foto y foto. */
  transitionSeconds: number;
  /** Tope de fotos por vídeo (las siguientes se descartan). */
  maxPhotos: number;
  /** Tope duro de duración; recorta fotos hasta caber. */
  maxDurationSeconds: number;
  defaultFormat: VideoFormat;
  defaultResolution: VideoResolution;
  /** Volumen de la música, 0–1. */
  musicVolume: number;
  /** Opacidad del logo superpuesto, 0–1. */
  logoOpacity: number;
  /** Esquina donde se coloca el logo. */
  logoPosition: LogoPosition;
  /** Regenerar el vídeo cuando cambien las fotos de la propiedad. */
  regenerateOnPhotoChange: boolean;
  /** Pista por defecto; null = la marcada `is_default` en video_music_tracks. */
  defaultMusicTrackId: string | null;
};

export const SETTINGS_KEY = "video_generation";

export const DEFAULT_SETTINGS: VideoSettings = {
  enabled: false,
  // Ritmo aprobado por el cliente en producción (2026-08-11): con 22 fotos son
  // ~1:04, casi 3 s de imagen quieta entre transición y transición. El valor
  // importa más de lo que parece porque el Ken Burns recorre todo su zoom en
  // el tiempo que dura la foto: acortarla no solo cambia rápido, también
  // convierte el movimiento de cámara en un barrido brusco.
  secondsPerPhoto: 3.5,
  transitionSeconds: 0.6,
  maxPhotos: 40,
  maxDurationSeconds: 150, // 2:30, el tope que pidió el cliente
  defaultFormat: "horizontal",
  defaultResolution: "fullhd",
  musicVolume: 0.5,
  // A plena opacidad: es el logo de la marca, con sus colores. Bajarlo lo
  // convierte en una marca de agua gris — el logo es tinta oscura, así que
  // atenuarlo no lo hace "sutil", lo destiñe.
  logoOpacity: 1,
  logoPosition: "top-right",
  regenerateOnPhotoChange: true,
  defaultMusicTrackId: null,
};

// ─── Límites duros ───────────────────────────────────────────────────────────

/**
 * Tope de subida del contenedor `storage` del VPS (FILE_SIZE_LIMIT).
 * Configurado a 500MB; si se cambia allí, cámbialo aquí — el estimador lo usa
 * para no producir NUNCA un fichero que luego no se pueda subir.
 */
export const STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;

/** Margen sobre el límite: el MP4 lleva cabeceras y el muxer no es exacto. */
export const STORAGE_SAFETY_FACTOR = 0.92;

export const FPS = 30;

/** Zoom máximo del efecto Ken Burns (1.15 = 15% de acercamiento). */
export const MAX_ZOOM = 1.15;

/**
 * Las fotos se preparan a este múltiplo de la resolución de salida para que el
 * fotograma más ampliado siga teniendo resolución nativa (si preparásemos a
 * 1:1, al hacer zoom estaríamos escalando hacia arriba y se vería blando).
 * Debe ser ≥ MAX_ZOOM.
 */
export const SUPERSAMPLE = 1.18;

export const MIN_PHOTOS = 3;

export const AUDIO_BITRATE_KBPS = 192;

export const RESOLUTIONS: Record<
  VideoResolution,
  Record<VideoFormat, { width: number; height: number }>
> = {
  fullhd: {
    horizontal: { width: 1920, height: 1080 },
    vertical: { width: 1080, height: 1920 },
  },
  "4k": {
    horizontal: { width: 3840, height: 2160 },
    vertical: { width: 2160, height: 3840 },
  },
};

/**
 * Bitrates de vídeo en kbps por resolución.
 *
 * `typical` es el bitrate MEDIO de partida. Medido renderizando el motor real
 * con contenido sintético de complejidad creciente (CRF 20, 1080p30):
 *
 *     color plano   0,2 Mbps  · textura suave  1,9 Mbps
 *     fotográfico   3,2 Mbps  · muy detallado  7,6 Mbps  · ruido puro 9,4 Mbps
 *
 * Las fotos de interiores caen en la franja fotográfico–detallado, de ahí el
 * valor de partida. Como el rango real es amplio, el sistema NO se queda con
 * esta constante: `video_calibration` guarda el bitrate medido en los renders
 * de verdad y el estimador lo usa en cuanto hay muestras (ver getCalibration).
 *
 * `cap` es el techo que se le pasa a ffmpeg (-maxrate): el fichero nunca supera
 * el peso máximo anunciado.
 */
export const VIDEO_BITRATE_KBPS: Record<
  VideoResolution,
  { typical: number; cap: number; floor: number }
> = {
  fullhd: { typical: 4500, cap: 9000, floor: 2500 },
  // El valor de 4K es más bajo de lo que parecería porque las fotos de los
  // portales rara vez son 4K de verdad: al ampliarlas el resultado es más
  // suave y comprime mucho mejor que un 4K nativo. Medido: 3,6 Mbps con fotos
  // de ~2400px ampliadas a 2160×3840.
  "4k": { typical: 9000, cap: 28000, floor: 6000 },
};

/**
 * Ancho de la horquilla que se le enseña al usuario alrededor del bitrate
 * estimado.
 *
 * Sin calibrar la incertidumbre es grande (el peso varía casi ×50 entre una
 * foto plana y uno con muchísimo detalle), así que la horquilla es ancha y se
 * dice claramente que es una estimación. Con renders ya medidos sabemos cómo
 * son las fotos de ESTA agencia y la horquilla se estrecha.
 */
export const ESTIMATE_SPREAD = {
  uncalibrated: { low: 0.35, high: 2.0 },
  calibrated: { low: 0.7, high: 1.4 },
} as const;

/**
 * Cuántos segundos de CPU cuesta cada segundo de vídeo, medido con este mismo
 * motor sobre 4 núcleos a 2,8 GHz. Sirve para avisar de cuánto va a tardar el
 * render; se reescala con los núcleos que tenga la máquina.
 *
 * A este ritmo, un vídeo de 2:30 sale en ~5 min en Full HD y ~18 min en 4K
 * sobre 4 núcleos.
 */
export const RENDER_SECONDS_PER_VIDEO_SECOND: Record<VideoResolution, number> = {
  fullhd: 2.1,
  "4k": 7.1,
};
export const RENDER_REFERENCE_CORES = 4;

/** CRF por resolución: calidad objetivo. Menor = mejor calidad y más peso. */
export const CRF: Record<VideoResolution, number> = { fullhd: 20, "4k": 22 };

/** Preset de x264. En 4K bajamos la exigencia o el render se eterniza. */
export const X264_PRESET: Record<VideoResolution, string> = {
  fullhd: "medium",
  "4k": "faster",
};

// ─── Carga y validación ──────────────────────────────────────────────────────

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function isVideoFormat(value: unknown): value is VideoFormat {
  return value === "horizontal" || value === "vertical";
}

export function isVideoResolution(value: unknown): value is VideoResolution {
  return value === "fullhd" || value === "4k";
}

export function isLogoPosition(value: unknown): value is LogoPosition {
  return LOGO_POSITIONS.includes(value as LogoPosition);
}

/**
 * Normaliza un objeto cualquiera (lo leído de app_settings o lo enviado por la
 * UI) a unos ajustes válidos. Nunca lanza: los campos malos caen al default.
 */
export function normalizeSettings(input: unknown): VideoSettings {
  const src = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const d = DEFAULT_SETTINGS;

  const transitionSeconds = num(src.transitionSeconds, d.transitionSeconds, 0, 3);
  // La transición no puede comerse la foto entera: si fuese ≥ secondsPerPhoto,
  // el offset del xfade sería ≤ 0 y ffmpeg fallaría con un grafo inválido.
  const secondsPerPhoto = num(
    src.secondsPerPhoto,
    d.secondsPerPhoto,
    Math.max(1, transitionSeconds + 0.5),
    15,
  );

  return {
    enabled: bool(src.enabled, d.enabled),
    secondsPerPhoto,
    transitionSeconds,
    maxPhotos: Math.floor(num(src.maxPhotos, d.maxPhotos, MIN_PHOTOS, 100)),
    maxDurationSeconds: num(src.maxDurationSeconds, d.maxDurationSeconds, 10, 600),
    defaultFormat: isVideoFormat(src.defaultFormat) ? src.defaultFormat : d.defaultFormat,
    defaultResolution: isVideoResolution(src.defaultResolution)
      ? src.defaultResolution
      : d.defaultResolution,
    musicVolume: num(src.musicVolume, d.musicVolume, 0, 1),
    logoOpacity: num(src.logoOpacity, d.logoOpacity, 0, 1),
    logoPosition: isLogoPosition(src.logoPosition) ? src.logoPosition : d.logoPosition,
    regenerateOnPhotoChange: bool(src.regenerateOnPhotoChange, d.regenerateOnPhotoChange),
    defaultMusicTrackId:
      typeof src.defaultMusicTrackId === "string" && src.defaultMusicTrackId
        ? src.defaultMusicTrackId
        : null,
  };
}
