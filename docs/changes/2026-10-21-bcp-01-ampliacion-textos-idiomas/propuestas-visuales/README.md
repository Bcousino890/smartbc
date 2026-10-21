# Propuestas visuales para aprobar (DA29–DA30)

Generadas en local con `sharp` y Chromium, sin tocar el código de la app. **No están implementadas.**

| Lámina | Qué enseña |
| --- | --- |
| [`tono.png`](tono.png) | Tono adaptativo por foto: exterior luminosa, salón luminoso, tono medio y una foto subexpuesta **simulada** (el salón oscurecido a propósito: en el repositorio no hay ninguna foto oscura real). |
| [`apertura.png`](apertura.png) | Pantalla 1 hoy y con la propuesta: filete interior, esquinas doradas y degradado inferior. Misma composición y tipografía. |
| [`portada.png`](portada.png) | Portada hoy y con la propuesta: mismo velo vertical, velo plano del 25 % al 8 % y filete dorado. |

## Medidas (luminancia de 0 a 1)

| Foto | Receta | Media antes → después | Percentil 98 antes → después | Píxeles quemados antes → después |
| --- | --- | --- | --- | --- |
| Exterior luminosa | luminosa | 0,672 → 0,628 | 0,957 → 0,929 | 0 % → 0 % |
| Salón luminoso | luminosa | 0,580 → 0,533 | 0,980 → 0,953 | 0,08 % → 0,01 % |
| Tono medio | media | 0,400 → 0,407 | 0,757 → 0,788 | 0 % → 0 % |
| Subexpuesta (simulada) | oscura | 0,321 → 0,391 | 0,655 → 0,737 | 0 % → 0 % |

- A las fotos luminosas **no** se les sube el brillo: recuperan altas luces, como pide el encargo para el ejemplo ya muy claro.
- Contraste del título de portada en el peor 5 % del fondo: **9,38:1 hoy, 7,94:1 con la propuesta**. Las dos superan AA (4,5:1).

## Antes de juzgar la nitidez

La portada del lector es hoy una sola imagen de 1.600 px a sangre, sin `srcset`, y en pantallas retina se amplía unas 1,8 veces. En el PDF, la portada queda a unos 80 ppi. Eso explica fotos blandas sin que sea un problema de estilo; se corrige en PR7a, aparte del acabado.

## Fotos usadas

`public/portal-hero.jpg` y `public/login-bg.jpg`, las dos únicas fotografías del repositorio. Conviene repetir la comparación con 3 o 4 fotos reales de catálogos que Fabricio elija: luminosa, oscura y normal, incluida la del ejemplo que mencionó.
