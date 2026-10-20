# BCP-01 · Descripción estructurada: resultado

**Especificación:** [`spec.md`](spec.md) (DE1–DE12) · **Plan:** [`plan.md`](plan.md).

> **La QA visual y en producción y el merge son de Fabricio.** Todo lo de abajo se ha probado con fixtures sintéticos e IA simulada; ningún agente ha llamado a DeepSeek ni tocado producción.

- **Rama:** `fabri/bcp-01-descripcion-estructurada` (worktree `wt/bcp-01-estructura`), desde `origin/main` = `e9504eda` (ya con 0217 y 0218). **Sin migración.**

## Qué cambia

- **Un organizador determinista** (`lib/catalogs/structure.ts`, puro, sin IA ni red) reparte cualquier descripción de catálogo, frase a frase, en la estructura estándar: introducción · Salón y luz · Cocina y comedor · Acabados y confort · La finca · Vivir en [zona verificada]. Reconoce palabras clave y sinónimos sin tildes, frases hechas («plaza de garaje» no deja «plaza» al barrio; «parqué de roble» frente a «parque del Retiro»), el contexto («Además…», «Este…», «Sus…» heredan el tema anterior) y los títulos escritos por el autor («Salón:», «La finca», «Vivir en Retiro»). Cada frase va **literal y una sola vez**; lo que no casa queda en la introducción; nunca hay un título vacío ni texto de relleno.
- **Los tres niveles con texto** pasan por él: texto publicado del catálogo, historia aprobada (sus capítulos compatibles conservan el título; «La vivienda», «Zona privada» y «Vida al aire libre» conservan su texto en la introducción) y descripción limpia. La prioridad entre fuentes (C2) no cambia. Los micro-capítulos siguen yendo a características.
- **Una sola representación** (`copy` del contrato público) para el lector (escritorio y móvil), el PDF y la vista previa del editor. El lector y el PDF no cambian de código: pintan los bloques con sus títulos en el mismo orden. Exactamente dos pantallas por vivienda.
- **Editor:** bajo la descripción, «Así se verá en el lector y en el PDF» se recalcula al escribir, en el navegador, con la misma función; y «Sin material sobre: la cocina, la zona» señala lo que falta (no bloquea ni inventa). Título y descripción por catálogo, «Preparar desde la ficha» y «Borrador con IA» siguen igual; la IA recibe ahora la estructura en su instrucción y la orden de no inventar. Nada se guarda ni publica sin pulsar.
- **Zona:** el título «Vivir en …» usa la subzona o zona verificada de la ficha; sin ella, «El barrio». Los nombres de la zona cuentan como palabra clave; no se añaden distancias ni servicios.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| `test:catalogs-structure` (nuevo en la CI, 52 comprobaciones): orden y partes vacías; tildes y mayúsculas; contexto; frases con varios temas (empate → primer tema; «ventanas de aluminio con climalit» → acabados; «edificio con ascensor junto al metro» → finca); negaciones literales («no tiene ascensor y es sin portero», «No dispone de calefacción… aunque sí…») sin característica nueva; títulos del autor y no estándar; introducción y entrada propia; 1.500 palabras íntegras; 60 frases mezcladas sin pérdida ni repetición; historias (compatibles con título, el resto a la introducción, dos «living» juntos, micro-capítulo a características, limpia no repetida); zona verificada y «El barrio»; contrato público = PDF; lector con dos partes; organizador sin IA ni BD | ✅ 52/52 |
| `test:catalogs-public` (DC3 adaptado a la estructura), `test:catalogs-manager`, `test:catalogs`, `test:catalogs-feedback` y el resto de suites de la CI; `tsc`; `lint-migrations.py` | ✅ |
| PDF reales (`check-catalog-pdfs.mts`, 13 PDF por el hilo, 626 comprobaciones): texto entero bloque a bloque con los títulos nuevos, sin repetir, glifos frase a frase, fotos, índice, privacidad | ✅ |
| QA en Chromium con fixtures (15 comprobaciones): texto propio, historia y solo datos con los mismos títulos y orden a 1440 y a 390; tras el detalle viene otra vivienda o el cierre (dos pantallas); descripción completa dentro de la pantalla 2; editor con vista previa en vivo, aviso de partes sin material y «Sin ascensor» literal; guardar y publicar → el lector abierto recibe la versión organizada; sin errores de consola | ✅ |
| `next build` (producción, `NEXT_BUILD_DIR=.next.qa`, `tsconfig.json` restaurado) | ✅ «Compiled successfully» |

## Capturas

[`capturas/`](capturas/): detalle de texto propio, historia y solo datos a 1440 y 390; editor con la vista previa organizada; lector tras publicar; dos páginas del PDF real (`journey.pdf`) con la misma estructura.

## Decisiones tomadas al implementar (a confirmar por Fabricio)

- **Capítulos de historia fuera de la estructura** («La vivienda», «Zona privada», «Vida al aire libre»): su texto se conserva en la introducción, sin título (DE7). Si prefieres que «Zona privada» siga saliendo como parte, es un cambio de una línea en el organizador (añadirla al orden estándar).
- **Dormitorios, baños y terrazas** en un texto escrito no tienen parte propia en la estructura aprobada: quedan en la introducción (DE4), nunca se pierden.
- **La apertura es la primera frase** del texto (o la entrada propia), aunque nombre un tema: la escribió el autor para abrir.

## Pendiente o no demostrado

- Safari real no se ha ejecutado.
- La lista de palabras clave es finita y en español: una frase que use términos fuera de la lista queda en la introducción (nunca se pierde). Se amplía en `structure.ts` con una prueba por cada término nuevo.
- Las huellas públicas de los catálogos con descripción cambian al desplegar (contenido organizado): los lectores abiertos reciben la versión nueva en vivo, como con cualquier cambio.
- Pendientes que se conservan: G-ALQ, diagnóstico de Recoletos, D13 y validación del PDF representativo.
