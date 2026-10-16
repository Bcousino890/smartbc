# PDF del catálogo · muestras para la revisión visual

> **Aprobación visual: PENDIENTE.** Fabricio todavía no ha dado su aprobación (P9). No se hace merge hasta que la dé.

Son PDF reales, generados por el mismo camino que el servidor con los datos sintéticos de desarrollo (T9, `scripts/pdf/check-catalog-pdfs.mts`).

- **Fotos:** son sintéticas. Cada una lleva un recuadro de casillas blancas y negras, que es su código para la verificación automática (K5). En un catálogo real salen las fotos de verdad, enteras y sin recortar, en su marco.
- **Contacto y textos:** son de prueba.

## PDF

| Archivo | Qué enseña |
|---|---|
| `muestra-casos-dificiles.pdf` (21 págs.) | Los casos difíciles: una historia de 12 capítulos, una descripción de 1.530 palabras, una vivienda sin fotos ni precio y reservada, una dual con 14 fotos, una foto que no se puede leer («Foto no disponible»), dos fotos excluidas por E3 que no aparecen y el contacto de una asesora. |
| `muestra-salamanca-chamberi.pdf` (12 págs.) | Un catálogo normal de 4 viviendas, con una dual en venta y alquiler. |
| `muestra-recorrido.pdf` (13 págs.) | Los tres niveles de texto: texto propio, historia aprobada y solo datos. |

## Páginas

- **Hojas de contacto** con todas las páginas de cada PDF: `paginas-casos-dificiles.png`, `paginas-salamanca-chamberi.png` y `paginas-recorrido.png`.
- **Páginas sueltas**, sacadas de `muestra-casos-dificiles.pdf`:

| Archivo | Página |
|---|---|
| `pagina-01-portada.png` | Portada |
| `pagina-02-presentacion-indice.png` | Presentación e índice |
| `pagina-03-apertura.png` | Apertura de una vivienda |
| `pagina-04-recorrido.png` | Recorrido |
| `pagina-08-detalle-y-mas-fotos.png` | Detalle y «Más fotos» |
| `pagina-15-sin-fotos-reservada.png` | Vivienda sin fotos y reservada |
| `pagina-20-foto-no-disponible.png` | Foto que no se puede leer |
| `pagina-21-cierre.png` | Cierre |

## Botones

| Archivo | Dónde está el botón |
|---|---|
| `boton-lector-indice-1440.png` | Lector, en el índice: «Descargar en PDF», en discreto |
| `boton-lector-cierre-362.png` | Lector en el móvil, en el cierre: debajo de «Llamar», que sigue siendo la acción principal |
| `boton-gestor-compartir-1440.png` | Gestor, en la sección Compartir: el bloque «PDF del catálogo» |
| `boton-gestor-menu-362.png` | Gestor en el móvil, en el menú «⋯»: «Descargar PDF» |

## Qué mirar

1. La portada y su arco, el logo, el título y la versión con fecha y hora.
2. El índice: cada número es la página real de su vivienda y lleva a ella al pulsarlo.
3. Las aperturas: la foto, el rótulo, el título, el precio y los datos clave.
4. El recorrido: aparecen todas las secciones, y ningún título queda solo al pie de una página.
5. La descripción larga y las características.
6. «Más fotos»: hasta 6, sin repetir ninguna de las de antes.
7. El cierre: el contacto editable y el aviso de copia fija.
8. Que no haya ni enlace en vivo ni QR.
