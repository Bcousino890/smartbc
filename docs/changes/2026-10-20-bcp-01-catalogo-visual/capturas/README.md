# Capturas de la enmienda visual (20 de octubre de 2026)

Referencia y catálogo rediseñado **a los mismos tamaños de ventana**, con contenido sintético (fixtures de `scripts/dev-fixtures.sh`; las «fotos» son SVG generados) y la referencia con sus imágenes de muestra del repo (`/v/design-preview`). Chromium de Playwright. Nada de esto toca producción ni datos reales.

## Referencia frente a catálogo

| Pantalla | Referencia (`/v`) | Catálogo (`/seleccion`) |
| --- | --- | --- |
| Portada 1440×900 | [referencia-1440-portada](referencia-1440-portada.png) | [catalogo-1440-portada](catalogo-1440-portada.png) |
| Índice 1440×900 | [referencia-1440-indice](referencia-1440-indice.png) | [catalogo-1440-indice](catalogo-1440-indice.png) |
| Vivienda 1440×900 | [referencia-1440-residencia](referencia-1440-residencia.png) | [catalogo-1440-vivienda](catalogo-1440-vivienda.png) |
| Contenido largo 1440×900 | — (la referencia no tiene recorrido) | [recorrido a](catalogo-1440-recorrido-a.png) · [recorrido b](catalogo-1440-recorrido-b.png) · [detalle](catalogo-1440-detalle.png) |
| Galería 1440×900 | [referencia-1440-galeria](referencia-1440-galeria.png) | [catalogo-1440-galeria](catalogo-1440-galeria.png) · [mosaico](catalogo-1440-galeria-mosaico.png) |
| Cierre 1440×900 | [referencia-1440-asesor](referencia-1440-asesor.png) · [colofón](referencia-1440-colofon.png) | [catalogo-1440-cierre](catalogo-1440-cierre.png) · [colofón](catalogo-1440-colofon.png) |
| Portada 390×844 | [referencia-390-portada](referencia-390-portada.png) | [catalogo-390-portada](catalogo-390-portada.png) |
| Índice 390×844 | — | [catalogo-390-indice](catalogo-390-indice.png) |
| Vivienda 390×844 | [referencia-390-residencia](referencia-390-residencia.png) | [catalogo-390-vivienda](catalogo-390-vivienda.png) |
| Colofón 390×844 | — | [catalogo-390-colofon](catalogo-390-colofon.png) |
| Vivienda 1024×768 | [referencia-1024-residencia](referencia-1024-residencia.png) | [catalogo-1024-vivienda](catalogo-1024-vivienda.png) |
| Vivienda 768×1024 | [referencia-768-residencia](referencia-768-residencia.png) | [catalogo-768-vivienda](catalogo-768-vivienda.png) (una columna hasta 900 px, DV6) |

## Casos del catálogo

- Índice de 24 viviendas: [1440](catalogo-1440-indice-24.png) · [390](catalogo-390-indice-24.png) (se desplaza dentro de la página con «Más viviendas ↓»).
- Catálogo vacío: [catalogo-1440-vacio](catalogo-1440-vacio.png).
- HOME: estantería con las miniaturas nuevas [home-estanteria-1440](home-estanteria-1440.png); gestor, sección Diseño con la vista previa [gestor-diseno-1440](gestor-diseno-1440.png).

## Comprobaciones (script `qa.mjs`, Chromium)

- Movimiento reducido: [qa-reduced-p3](qa-reduced-p3.png) (0 animaciones en curso al pasar página).
- Teclado: foco visible en «Siguiente» [qa-focus-siguiente](qa-focus-siguiente.png); ← → Inicio Fin Av Pág, Tab y Enter, galería con Enter/→/Esc.
- Fotos fallidas: [apertura](qa-foto-fallida.png) · [galería](qa-foto-fallida-galeria.png).
- Actualización en vivo durante la lectura (D12): [qa-en-vivo-d12](qa-en-vivo-d12.png).
- Ventana baja (1280×560, recorrido vertical forzado): [qa-ventana-baja-1280x560](qa-ventana-baja-1280x560.png).
- Modo desplazamiento en escritorio: [qa-desplazar-1440](qa-desplazar-1440.png).
- Enlace no válido: [qa-enlace-no-valido](qa-enlace-no-valido.png).

## PDF reales (fixtures, por el mismo camino que el servidor)

- [`pdf-salamanca-chamberi.pdf`](pdf-salamanca-chamberi.pdf): cuatro viviendas (texto, dual, reservada sin fotos, alquiler).
- [`pdf-casos-dificiles.pdf`](pdf-casos-dificiles.pdf): historia de 12 capítulos, descripción de ~1.500 palabras, vivienda sin fotos ni precio, dual con muchas fotos y una foto que falla.
- Páginas renderizadas: [portada](pdf-pagina-01-portada.png) · [índice](pdf-pagina-02-indice.png) · [vivienda](pdf-pagina-03-vivienda.png) · [cierre](pdf-pagina-cierre.png) · [colofón](pdf-pagina-colofon.png).
