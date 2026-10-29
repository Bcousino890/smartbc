"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isOptimizableSrc } from "@/lib/images/optimizable-src";
import {
  ALL_ROOMS_FILTER,
  roomsInOrder,
  type FurnishingTexts,
  type FurnishingViewerImage,
} from "@/lib/furnishing/proposal";
import s from "./furnishing-viewer.module.css";

// Visor de la propuesta de mobiliario: diseño e interacciones aprobados en la
// referencia estática (filtros por estancia, miniaturas, propuesta amueblada,
// comparación deslizable, vista doble, anterior/siguiente, teclado y
// pantalla completa). Los datos llegan por props, por propiedad.
//   · variant="page": página del cliente (/compartir/[slug]/propuesta y
//     /c/[token]/propuesta), con cabecera, cierre y pie.
//   · variant="embedded": vista previa en la ficha del admin (solo el visor).

type Mode = "final" | "compare" | "double";

const STAGE_SIZES = "(max-width: 760px) 100vw, min(1300px, 90vw)";

export type FurnishingViewerProps = {
  images: FurnishingViewerImage[];
  texts: FurnishingTexts;
  reference: string | null;
  /** Hechos del registro de la propiedad (operación, precio, zona, m²…). */
  facts?: string[];
  contactHref?: string;
  /** Vuelta a la ficha compartida desde la que se abrió. */
  backHref?: string;
  variant?: "page" | "embedded";
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function FurnishingViewer({
  images,
  texts,
  reference,
  facts = [],
  contactHref,
  backHref,
  variant = "page",
}: FurnishingViewerProps) {
  const rooms = useMemo(() => roomsInOrder(images), [images]);
  const [filter, setFilter] = useState<string>(ALL_ROOMS_FILTER);
  const [selected, setSelected] = useState(0);
  const [mode, setModeState] = useState<Mode>("final");
  const [slider, setSlider] = useState(50);
  const [status, setStatus] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => images.filter((p) => filter === ALL_ROOMS_FILTER || p.room === filter),
    [images, filter],
  );
  const index = filtered.length ? ((selected % filtered.length) + filtered.length) % filtered.length : 0;
  const current = filtered[index];
  const next = filtered.length > 1 ? filtered[(index + 1) % filtered.length] : null;
  // Sin «antes» de la misma toma no hay comparación: se ve la fotografía.
  const effectiveMode: Mode = current?.compare ? mode : "final";

  const show = useCallback(
    (i: number, announce: boolean) => {
      if (!filtered.length) return;
      const n = ((i % filtered.length) + filtered.length) % filtered.length;
      setSelected(n);
      setSlider(50);
      if (announce) {
        const p = filtered[n];
        setStatus(`${p.label}, fotografía ${n + 1} de ${filtered.length}`);
        const thumb = thumbsRef.current?.children[n] as HTMLElement | undefined;
        thumb?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "nearest", inline: "nearest" });
      }
    },
    [filtered],
  );

  const applyFilter = (label: string) => {
    setFilter(label);
    setSelected(0);
    setSlider(50);
  };

  const setMode = (value: Mode) => {
    if (!current) return;
    if (!current.compare && value !== "final") return;
    setModeState(value);
    setStatus(
      value === "final"
        ? "Mostrando propuesta"
        : value === "compare"
          ? "Comparación deslizable activada"
          : "Vista doble activada",
    );
  };

  // Teclado: ← → cambian de fotografía. En la página escucha el documento
  // (como la referencia); en la vista previa del admin, solo el propio visor
  // para no robar las flechas al resto de la ficha. El deslizador y los campos
  // de texto conservan sus flechas.
  useEffect(() => {
    const target: Document | HTMLElement | null =
      variant === "page" ? document : viewerRef.current?.parentElement ?? null;
    if (!target) return;
    const onKey = (e: Event) => {
      const ev = e as KeyboardEvent;
      const el = ev.target as HTMLElement | null;
      if (el && (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.isContentEditable)) return;
      if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        show(index - 1, true);
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault();
        show(index + 1, true);
      }
    };
    target.addEventListener("keydown", onKey);
    return () => target.removeEventListener("keydown", onKey);
  }, [variant, show, index]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await viewerRef.current?.requestFullscreen();
    } catch {
      setStatus("Puedes ampliar las imágenes con el zoom de tu navegador.");
    }
  };

  if (!current) return null;

  const ratio = current.after.width / current.after.height;
  const viewNote =
    effectiveMode === "compare"
      ? "Desliza para comparar el piso actual con la propuesta"
      : effectiveMode === "double"
        ? "Fotografía actual y propuesta de mobiliario"
        : current.compare
          ? "Propuesta de mobiliario virtual"
          : "Fotografía del inmueble";
  const unopt = (url: string) => !isOptimizableSrc(url);

  const viewer = (
    <section className={s.experience} aria-label="Visor de fotografías">
      <div className={s.galleryTop}>
        <div className={s.filters} aria-label="Filtrar por estancia">
          {[ALL_ROOMS_FILTER, ...rooms].map((label) => (
            <button
              key={label}
              type="button"
              className={filter === label ? s.active : undefined}
              aria-pressed={filter === label}
              onClick={() => applyFilter(label)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={s.counter}>
          <span>{pad(index + 1)}</span>
          <span className={s.counterLine} />
          <span>{pad(filtered.length)}</span>
        </div>
      </div>

      <div className={s.viewer} ref={viewerRef}>
        <div className={s.viewerToolbar}>
          <div className={s.current}>
            <span className={s.photoId}>{current.number}</span>
            <h2>{current.label}</h2>
          </div>
          <div className={s.modes} role="group" aria-label="Forma de ver las fotografías">
            {(
              [
                ["final", current.compare ? "Amueblado" : "Fotografía"],
                ["compare", "Comparar"],
                ["double", "Vista doble"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                className={effectiveMode === m ? s.active : undefined}
                aria-pressed={effectiveMode === m}
                disabled={m !== "final" && !current.compare}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`${s.iconButton} ${s.expand}`}
            aria-label={isFullscreen ? "Salir de pantalla completa" : "Ampliar fotografías"}
            title="Ampliar"
            onClick={toggleFullscreen}
          >
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5" />
            </svg>
          </button>
        </div>

        <div className={s.stageShell}>
          <div
            className={s.stage}
            hidden={effectiveMode === "double"}
            style={
              {
                aspectRatio: `${current.after.width}/${current.after.height}`,
                width: `min(100%, ${70 * ratio}vh)`,
                "--ratio": ratio,
              } as React.CSSProperties
            }
          >
            <Image
              key={`a-${current.after.url}`}
              src={current.after.url}
              alt={`${current.label} · ${current.compare ? "propuesta virtual" : "fotografía del inmueble"}`}
              fill
              sizes={STAGE_SIZES}
              priority={index === 0}
              unoptimized={unopt(current.after.url)}
            />
            {current.before && effectiveMode === "compare" && (
              <Image
                key={`b-${current.before.url}`}
                src={current.before.url}
                alt={`${current.label} · fotografía actual`}
                fill
                sizes={STAGE_SIZES}
                unoptimized={unopt(current.before.url)}
                style={{ clipPath: `inset(0 ${100 - slider}% 0 0)` }}
              />
            )}
            <div className={`${s.imageTag} ${s.beforeTag}`} hidden={effectiveMode !== "compare"} style={{ opacity: slider < 15 ? 0 : 1 }}>
              Actual
            </div>
            <div className={`${s.imageTag} ${s.afterTag}`} style={{ opacity: effectiveMode === "compare" && slider > 85 ? 0 : 1 }}>
              {current.compare ? "Propuesta virtual" : "Vista del inmueble"}
            </div>
            <div className={s.divider} hidden={effectiveMode !== "compare"} style={{ left: `${slider}%` }}>
              <span>↔</span>
            </div>
            <input
              className={s.slider}
              type="range"
              min={0}
              max={100}
              value={slider}
              aria-label="Comparar fotografía actual y propuesta amueblada"
              hidden={effectiveMode !== "compare"}
              onChange={(e) => setSlider(Number(e.target.value))}
            />
          </div>

          {effectiveMode === "double" && current.before && (
            <div className={s.doubleStage}>
              <figure>
                <Image
                  src={current.before.url}
                  alt={`${current.label} · fotografía actual`}
                  width={current.before.width}
                  height={current.before.height}
                  sizes="(max-width: 760px) 50vw, 550px"
                  unoptimized={unopt(current.before.url)}
                />
                <figcaption>Fotografía actual</figcaption>
              </figure>
              <figure>
                <Image
                  src={current.after.url}
                  alt={`${current.label} · propuesta virtual`}
                  width={current.after.width}
                  height={current.after.height}
                  sizes="(max-width: 760px) 50vw, 550px"
                  unoptimized={unopt(current.after.url)}
                />
                <figcaption>Propuesta de mobiliario</figcaption>
              </figure>
            </div>
          )}
        </div>

        <div className={s.viewerBottom}>
          <p>{viewNote}</p>
          <div className={s.arrows}>
            <button type="button" className={s.iconButton} aria-label="Fotografía anterior" onClick={() => show(index - 1, true)}>
              ←
            </button>
            <button type="button" className={s.iconButton} aria-label="Fotografía siguiente" onClick={() => show(index + 1, true)}>
              →
            </button>
          </div>
        </div>
      </div>

      <div className={s.thumbnails} ref={thumbsRef} aria-label="Todas las fotografías">
        {filtered.map((p, i) => (
          <button
            key={`${p.number}-${p.after.url}`}
            type="button"
            className={s.thumb}
            aria-label={`Ver ${p.label}`}
            aria-current={i === index}
            onClick={() => show(i, true)}
          >
            <Image
              src={p.after.url}
              alt=""
              width={116}
              height={77}
              sizes="116px"
              loading="lazy"
              unoptimized={unopt(p.after.url)}
            />
            <span>
              {p.number} · {p.label.split(" · ")[0]}
            </span>
          </button>
        ))}
      </div>

      {/* Precarga de la siguiente propuesta con el mismo `sizes` del escenario. */}
      {next && (
        <div className={s.preload} aria-hidden="true">
          <Image src={next.after.url} alt="" fill sizes={STAGE_SIZES} loading="eager" unoptimized={unopt(next.after.url)} />
        </div>
      )}
      <div className={s.srOnly} role="status" aria-live="polite">
        {status}
      </div>
    </section>
  );

  if (variant === "embedded") {
    return <div className={`${s.root} ${s.embedded}`}>{viewer}</div>;
  }

  return (
    <div className={`${s.root} ${s.page}`}>
      <header className={s.masthead}>
        {backHref ? (
          <Link href={backHref} className={s.brand} aria-label="Volver a la ficha de la vivienda">
            <img src="/logo.png" alt="Benjamín Cousiño Propiedades" width={3282} height={519} />
          </Link>
        ) : (
          <span className={s.brand}>
            <img src="/logo.png" alt="Benjamín Cousiño Propiedades" width={3282} height={519} />
          </span>
        )}
        {reference && <span className={s.reference}>{reference}</span>}
        {backHref && (
          <Link href={backHref} className={s.back} style={reference ? undefined : { marginLeft: "auto" }}>
            ← Ficha<span className={s.backLong}> de la vivienda</span>
          </Link>
        )}
        {contactHref && (
          <a className={s.contact} href={contactHref} target="_blank" rel="noopener noreferrer">
            Consultar esta vivienda <span aria-hidden="true">↗</span>
          </a>
        )}
      </header>

      <main className={s.main}>
        <section className={s.intro}>
          <div>
            <p className={s.kicker}>
              Propuesta de amueblamiento <span className={s.tinyLine} /> {reference && <span>{reference}</span>}
            </p>
            <h1>{texts.headline}</h1>
            <p className={s.subtitle}>{texts.subtitle}</p>
            {facts.length > 0 && (
              <ul className={s.facts} aria-label="Datos de la vivienda">
                {facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </div>
          <div className={s.introNote}>
            <span className={s.smallDot} />
            <span>
              Mismo piso.
              <br />
              Una nueva forma de verlo.
            </span>
          </div>
        </section>

        {viewer}

        <section className={s.closing}>
          <div>
            <p className={s.kicker}>Una vivienda, distintas posibilidades</p>
            <h2>
              {/* El espacio antes del <br>: en móvil el salto se oculta. */}
              Del espacio real <br />a una idea de hogar.
            </h2>
          </div>
          <div>
            <p>
              Desliza entre las dos imágenes para descubrir la propuesta. Las fotografías del piso te permiten
              reconocer cada estancia, y el mobiliario virtual te ayuda a imaginar sus posibilidades.
            </p>
            <p className={s.disclaimer}>{texts.disclaimer}</p>
            {contactHref && (
              <a className={s.contact} href={contactHref} target="_blank" rel="noopener noreferrer">
                Consultar esta vivienda <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <span>Benjamín Cousiño Propiedades · Propuesta de amueblamiento</span>
        {reference && <span>{reference}</span>}
      </footer>
    </div>
  );
}
