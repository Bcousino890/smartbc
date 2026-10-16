# Fuentes del PDF del catálogo (dirección C · Boutique)

Archivos **estáticos** (react-pdf no admite fuentes variables) de las dos fuentes del catálogo, incluidos en el repositorio para que generar un PDF **no dependa de Google Fonts** ni de la red.

| Archivo | Fuente | Peso / estilo | sha256 |
| --- | --- | --- | --- |
| `fraunces-latin-400-normal.woff` | Fraunces | 400 normal | `695442434f77c44190b48a022f943e052bb60d49ed3c7940ea60a16ac3faf8b3` |
| `fraunces-latin-400-italic.woff` | Fraunces | 400 cursiva | `72d11200925b4a71aec864f6c62501ad8b9a5d787aecd8bb3740000a5eeb1891` |
| `fraunces-latin-600-normal.woff` | Fraunces | 600 normal | `d78e988f844f474ce9b1cc10c72501add6c5056763bfe83ff2a8e2fcb6708ad0` |
| `fraunces-latin-600-italic.woff` | Fraunces | 600 cursiva | `2fe1be4297dfa2080b9206a8dc20618a70b983305a39241252e90bfa2a014c91` |
| `karla-latin-400-normal.woff` | Karla | 400 normal | `ab7cfc2a46ab3c5744c559629bf50d640be7fb7965aeca0b84fe47f7f60b5cf7` |
| `karla-latin-600-normal.woff` | Karla | 600 normal | `d7312cfe12ed68946cb0b90b5742c2aef0249b1f9aec85c577e9c92e89fdd010` |

- **Procedencia:** paquetes npm `@fontsource/fraunces@5.3.0` (sha256 del `.tgz`: `c4d77f0157ec3128e53ee83aafa0f1ef0ab0ae5a23708f611e49584821c1f6ce`) y `@fontsource/karla@5.3.0` (`c7f1cdea4f386d5a9f259c6b01fa46412a3955110ecc56d886a3e4c5b8d67b8e`). Se bajaron una vez con `npm pack` (16 de octubre de 2026) y se copiaron solo estos archivos; **no** son dependencias del proyecto.
- **Subconjunto «latin»:** U+0000–00FF, la puntuación general (U+2000–206F), € y otros. Cubre los caracteres del catálogo en español: á é í ó ú ñ ü ¿ ¡ « » € ² º ª · —. El ornamento ✦ no está: se dibuja como vector.
- **Licencia:** SIL Open Font License 1.1 ([`OFL-Fraunces.txt`](OFL-Fraunces.txt), [`OFL-Karla.txt`](OFL-Karla.txt)). La OFL permite incrustarlas en documentos.
- Las usa `lib/pdf/catalog/fonts.ts` (`Font.register`).
