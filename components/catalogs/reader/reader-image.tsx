"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import styles from "./reader.module.css";

// Foto del lector con estados (BCP-01 E1, L4). Una foto puede estar:
//   · cargando  → tono del papel y, en los marcos grandes, «Cargando foto…»;
//   · cargada   → la foto;
//   · con error → «Foto no disponible» (sin el icono roto del navegador).
// Nunca se reintenta sola: un error se queda en error hasta que cambie la
// foto. Si la foto ya estaba en caché y cargó antes de hidratar, se detecta
// al montar (img.complete). La animación de carga respeta «reducir
// movimiento» (CSS).

export type ImageState = "loading" | "loaded" | "error";

export function ReaderImage({
  variant,
  alt,
  ...img
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "onLoad" | "onError"> & {
  /** frame: marco grande · thumb: miniatura · gallery: galería a pantalla completa. */
  variant: "frame" | "thumb" | "gallery";
  alt: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<ImageState>("loading");
  const src = img.src;

  // Foto nueva (o ya cargada antes de hidratar): estado según el elemento.
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete) setState(el.naturalWidth > 0 ? "loaded" : "error");
    else setState("loading");
  }, [src]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        {...img}
        alt={alt}
        data-img-state={state}
        className={`${img.className ?? ""} ${state === "error" ? styles.imgHidden : ""}`}
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
      {state === "loading" ? (
        <span className={`${styles.imgLoading} ${variant === "thumb" ? styles.imgLoadingQuiet : ""}`} aria-hidden="true">
          {variant === "thumb" ? null : "Cargando foto…"}
        </span>
      ) : null}
      {state === "error" ? (
        <span className={`${styles.imgError} ${variant === "thumb" ? styles.imgErrorThumb : ""}`} role={variant === "thumb" ? undefined : "img"} aria-label={variant === "thumb" ? undefined : "Foto no disponible"} data-testid="img-error">
          {variant === "thumb" ? "—" : variant === "gallery" ? "Esta foto no se puede mostrar" : "Foto no disponible"}
        </span>
      ) : null}
    </>
  );
}
