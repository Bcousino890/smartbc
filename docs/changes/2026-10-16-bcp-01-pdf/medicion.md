# PDF del catálogo · medición (T10)

Medido el 17-10-2026, antes de fijar los límites. Todo es local y con datos sintéticos; no se ha medido nada en producción.

## Cómo se midió

- **Máquina:** Apple M2, 8 núcleos, Node 22.
- **Fotos:** JPEG sintéticos con grano, de 3.600 px de lado mayor y unos 2–2,5 MB cada uno, que es el tamaño de una foto real del almacén. Se generan una vez y se guardan en disco (`lib/catalogs/export/fixture-photo-big.ts`, solo fixtures). Lo que se mide es leer los bytes, convertirlos y maquetar el PDF, como en producción tras descargar la foto. La descarga desde el almacén del VPS no está incluida.
- **Método:** `scripts/pdf/measure.mts`, con un proceso limpio por caso. Primero una pasada de calentamiento y después 3 pasadas medidas; la tabla da la mediana.
- **Memoria:** RSS muestreada cada 20 ms.
- **Bloqueo del proceso:** reloj de 10 ms; se anota cada parón de más de 100 ms. Es lo que nota la web, porque comparte el proceso de PM2.

## Resultados

| Catálogo | Viviendas | Fotos en el PDF | Tiempo (mediana) | Peso del PDF | RSS base → pico | Bloqueos (ms) |
|---|---:|---:|---:|---:|---:|---|
| `one` | 1 | 5 | 0,75 s | 0,17 MB | 315 → 331 MB | 196 + 189 |
| `pdf` (historia de 12 capítulos, descripción de 1.530 palabras) | 5 | 29 | 1,86 s | 0,86 MB | 383 → 397 MB | 460 + 385 |
| `journey12` | 12 | 50 | 2,47 s | 1,37 MB | 402 → 397 MB | 519 + 515 |
| `journey24` (máximo de la HOME) | 24 | 102 | 5,31 s (4,8–5,8) | 2,49 MB | 483 → 541 MB | ~900 + ~900 (uno de 1.390) |

- **Dos bloqueos por PDF.** Corresponden a las dos pasadas de maquetación: la primera anota en qué página empieza cada vivienda y la segunda imprime esos números en el índice. La maquetación de react-pdf es síncrona.
- **Probado y descartado:** usar en la primera pasada imágenes sustitutas del mismo tamaño solo ahorra un 15 % (1.174 → 1.012 ms), porque el coste es la maquetación del texto.
- **Memoria:** el pico añade como mucho unos 60 MB sobre la base. No condiciona nada.
- **Peso:** 2,5 MB en el peor caso, así que se puede enviar por correo.

### Latencia de la web mientras se genera

Medida en el servidor de desarrollo aislado, que es más lento que el de producción. Se hicieron peticiones a `/api/seleccion/<token>/estado` cada 50 ms mientras se generaba el PDF de 24 viviendas (5,9 s, 2,5 MB):

| | p50 | p95 | máximo |
|---|---:|---:|---:|
| En reposo | 31 ms | 39 ms | 51 ms |
| Generando el PDF de 24 viviendas | 36 ms | 719 ms | 1.363 ms |

## Límites fijados (`EXPORT_LIMITS`, `lib/catalogs/export/generate.ts`)

| Límite | Valor | Por qué |
|---|---|---|
| PDF a la vez | 1 | Dos a la vez sumarían sus bloqueos. |
| Cola | 3 | Tres más esperando turno. Con la cola llena, 503 con `Retry-After: 15`. |
| Espera máxima de turno | 30 s | Unos 5 PDF del peor caso. |
| Espera máxima de la petición | 55 s | Por debajo de los 60 s por defecto de nginx: se responde un 503 propio y no un 504 del proxy. |
| Presupuesto del trabajo | 50 s | Pasado ese tiempo se cancela la fase de fotos. El renderizado no se puede cancelar y retiene el turno hasta acabar. |
| Por enlace | 6/min | `pdfLinkLimiter`; si se supera, 429. |
| Por dueño | 12/min | `pdfOwnerLimiter`; si se supera, 429. |
| Ancho de las fotos | portada y apertura 1.400 px, recorrido 1.100 px, «Más fotos» 800 px | Con 102 fotos el PDF pesa 2,5 MB. |

No se ha recortado nada del contenido aprobado.

## Para decidir (Fabricio)

**Hecho:** en el peor caso (24 viviendas), mientras se maqueta el PDF el proceso web queda parado unas dos veces ~0,9 s en un M2 (una vez llegó a 1,4 s). En el VPS, con vCPU más lentas, puede ser algo más. Durante esos instantes, cualquier página del CRM o del lector que se pida tarda ese tiempo de más. Solo ocurre mientras alguien descarga un PDF, y nunca hay más de uno a la vez.

| Opción | Qué supone |
|---|---|
| **A. Aceptarlo así** (lo entregado) | Es poco frecuente y breve. Ojo: el lector en vivo muestra «Sin conexión» si pasa más de 2 s sin noticias del servidor (`OFFLINE_AFTER_MS`). En el M2 los parones se quedan por debajo, pero en el VPS uno largo podría enseñar ese aviso un instante a quien tenga un catálogo abierto; se quita solo al volver el latido. |
| **B. Maquetar en un hilo aparte** (`worker_threads`), como tarea posterior | Elimina el parón. Es un cambio de arquitectura con su propio riesgo en el build de Next, y por eso no va en esta entrega. |
