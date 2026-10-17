# PDF en un hilo · medición antes y después (T5)

Medido el 17-10-2026 en el mismo Mac (Apple M2, 8 núcleos, Node 22) y en la misma sesión.

- **Antes:** `main` = `ab7bbcd`.
- **Después:** la rama `fabri/bcp-01-pdf-worker`.
- **Mismas condiciones:** las mismas fotos sintéticas de 3.600 px y el mismo simulador. Todo es local.

Los umbrales (W2–W5) son **criterios de evaluación locales**. No son garantías de la CI ni de producción, y estos números **no** dicen cómo irá en el VPS, porque no se conocen sus vCPU ni su memoria.

## 1 · En proceso (`scripts/pdf/measure.mts`, la herramienta de #323)

5 pasadas por caso. Un reloj de 10 ms anota cada parón del bucle de eventos de más de 100 ms.

| Viviendas (fotos) | Duración, antes | Duración, después | Δ | Parón máximo por pasada, antes | Después | p99 del retraso, antes → después |
|---|---|---|---|---|---|---|
| 1 (5) | 772 ms | 962 ms | **+25 %** | 198–214 ms | **ninguno** | 210 → 11 ms |
| 12 (50) | 2.571 ms | 2.764 ms | +7,5 % | 529–590 ms | **ninguno** | 520 → 11 ms |
| 24 (102) | 4.386 ms | 4.772 ms | +8,8 % | 820–1.162 ms | **ninguno** | 101 → 12 ms |

**W2 se cumple:** ningún parón de más de 100 ms y p99 de 11–12 ms (el criterio era ≤ 150 ms y p99 ≤ 50 ms).

## 2 · Build de producción compilado (`next start` + simulador)

- **Cómo se mide:**
  - el PDF se pide por la ruta pública del enlace;
  - mientras tanto, una sonda pide `/api/seleccion/x/estado` cada 50 ms (una ruta mínima, que no toca la base);
  - se toman la RSS y la **huella física** (`footprint`, que en macOS incluye la memoria comprimida que la RSS no cuenta) del proceso del servidor cada 100 ms.
- **Calentamiento:** un PDF de cada caso antes de medir.
- **Pasadas:** 5 por caso.

| | Antes | Después |
|---|---|---|
| Web en reposo (p50 / p95 / máx.) | 5 / 13 / 71 ms | 4 / 8 / 39 ms |
| **Latencia máx. de la web durante el PDF de 24 viviendas** | 832–931 ms | **40–44 ms** |
| … de 12 viviendas | 577–796 ms | **39–60 ms** |
| … de 1 vivienda | 158–1.356 ms | **38–42 ms** |
| Duración, 24 viviendas (mediana, intervalo) | 4.854 ms (4.739–5.370) | 5.058 ms (4.907–5.481), +4 % |
| Duración, 12 viviendas | 2.923 ms (2.861–8.051) | 3.105 ms (2.952–3.512), +6 % |
| Duración, 1 vivienda | 1.341 ms (911–3.969) ¹ | 921 ms (911–1.030) |
| Huella física pico del proceso | 704–766 MB | 750–839 MB |
| RSS pico del proceso | 498–581 MB | 587–698 MB |

¹ El «antes» de 1 vivienda tuvo valores atípicos en esta pasada. En la pasada anterior, con el mismo método y 3 repeticiones, dio una mediana de 710 ms (705–750) frente a **941 ms** (896–989) después: **+33 %**. Es ahí donde se ve el exceso sobre el criterio W4.

- **W3 se cumple:** el máximo baja de casi 1 s a ~40 ms. La web deja de pararse mientras se genera un PDF.
- **Todos los PDF los maquetó el hilo:** cada uno dejó su línea `[catalogos] pdf hilo: …`, y no hubo ninguna de respaldo.

## 3 · Memoria (W5)

- **Heap de V8 del hilo** (lo que el hilo informa al terminar):

| Viviendas | Usado / total |
|---|---|
| 1 | 28 / 64 MB |
| 12 | 56 / 119 MB |
| 24 | 79 / 124 MB |

- **Huella física pico del proceso:** **+50–75 MB** más que antes mientras vive el hilo, es decir, el heap propio del hilo. Al salir el hilo se libera: la base vuelve a valores parecidos.
- **`resourceLimits.maxOldGenerationSizeMb = 256`:** unas 2 veces el pico medido.
  - Es un límite **del heap de V8 del hilo**, **no** de la memoria total del proceso. Las fotos van en `ArrayBuffer`, fuera de ese heap, y el proceso suma el hilo principal, `sharp` y los buffers.
  - Si el hilo lo supera, la petición recibe un error y el proceso sigue (probado en T3).
- **Copias de las fotos:** una por foto (los `Buffer` de `sharp` no son transferibles), del orden del peso de los JPEG del PDF (≈ 3,5 MB con 24 viviendas).

## 4 · De dónde sale el tiempo extra

- El hilo arranca en ~0,45 s (cargar react-pdf y las fuentes en un hilo nuevo). Ahora arranca **mientras se descargan las fotos**, así que en 12 y 24 viviendas casi no se nota.
- En 1 vivienda las fotos tardan poco, así que el arranque y la maquetación «en frío» (react-pdf todavía sin optimizar por V8 en un hilo nuevo) quedan al descubierto: unos **+0,2 s**.

## 5 · Puerta T5

| Criterio local | Resultado |
|---|---|
| W2, bucle libre | **cumple** |
| W3, la web no se para | **cumple** |
| W5, memoria medida y acotada | **medida**: +50–75 MB de pico mientras vive el hilo |
| W4, duración ≤ +25 % | **cumple** en 12 y 24 viviendas (+4 % a +9 %). **En 1 vivienda queda en el límite o algo por encima: +25 % en proceso y +33 % en la pasada limpia del build** (unos +0,2 s: de ~0,7–0,8 s a ~0,9–1 s) |

Según el plan, **se paró aquí** y se presentó a Fabricio.

**Decisión (17-10-2026, Fabricio, D4 = opción A):**
- se acepta el aumento medido de ~0,2 s en el PDF de 1 vivienda;
- se mantiene un hilo por PDF, con la cola y la concurrencia de siempre;
- no hay hilo persistente;
- se acepta el compromiso medido en local, no una garantía de rendimiento en producción.

Se sigue con T6.
