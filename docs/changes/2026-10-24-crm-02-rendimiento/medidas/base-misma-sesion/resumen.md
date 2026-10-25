
## base2 — 17 pasadas (LOCAL; «lat40» = 40 ms simulados; «movil» = CPU y red simuladas)

### escritorio · contrato: 31/31
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 314 (296–345) | 307 (277–309) | 0 (0–0) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 122 (118–125) | 114 (107–118) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 229 (210–243) | 231 (217–233) | 0 (0–0) | 9 | 2102 | 2 (6) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 936 (930–943) | 916 (907–936) | — | 28+9 | 55+2103 | 21 (63) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 344 (322–350) | 316 (310–320) | — | 23 | 2517 | 20 (60) | 1 (12) |
| R2 lista→ficha | — | 72 (64–85) | 74 (70–75) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 69 (57–69) | 63 (60–64) | 0 (0–0) | — | — | 1 (3) | 1 (12) |
| R2 lista→Adelante | — | 30 (27–33) | 32 (31–33) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 242 (232–253) | 251 (244–255) | 0 (0–0) | 9 | 2373 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 84 (77–94) | 67 (60–70) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 reabrir la misma galería | — | 50 (46–51) | 44 (36–45) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 41 (36–50) | 38 (37–41) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | — | 99 (95–102) | 91 (85–96) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 83 (82–95) | 66 (64–85) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 19 (18–22) | 18 (14–19) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | — | 60 (58–62) | 59 (54–64) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2

### escritorio-lat40 · contrato: 31/31
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 578 (571–597) | 560 (559–572) | 0 (0–0) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 648 (641–657) | 624 (620–638) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 513 (488–520) | 512 (498–519) | 0 (0–0) | 9 | 2102 | 3 (9) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 2383 (2361–2386) | 2359 (2355–2375) | — | 28+9 | 55+2103 | 21 (63) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 964 (954–973) | 958 (933–958) | — | 23 | 2517 | 20 (60) | 1 (12) |
| R2 lista→ficha | — | 642 (638–648) | 639 (598–644) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 63 (59–69) | 64 (52–68) | 0 (0–0) | — | — | 1 (3) | 1 (12) |
| R2 lista→Adelante | — | 28 (22–30) | 28 (26–29) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 842 (838–859) | 842 (842–847) | 0 (0–0) | 9 | 2373 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 63 (59–64) | 58 (54–69) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 reabrir la misma galería | — | 44 (42–55) | 39 (37–43) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 43 (43–45) | 47 (47–51) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | — | 589 (580–599) | 602 (584–610) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 902 (878–924) | 875 (869–879) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 19 (17–20) | 18 (17–20) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | — | 568 (561–575) | 557 (527–574) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2 · R7=1

### movil · contrato: 30/30
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 1841 (1831–1861) | 1827 (1819–1835) | 154 (153–227) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 602 (581–608) | 591 (589–592) | 0 (0–0) | 13 | 9 | 2 (6) | 2 (15) |
| R1 ficha→«Volver» | — | 1227 (1216–1250) | 1216 (1215–1216) | 354 (306–366) | 9 | 2102 | 2 (6) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 5606 (5586–5620) | 5604 (5600–5608) | — | 28+9 | 55+2103 | 17 (51) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 3863 (3852–3870) | 3840 (3830–3849) | — | 23 | 2517 | 12 (36) | 1 (12) |
| R2 lista→ficha | — | 575 (556–576) | 546 (540–552) | 0 (0–0) | 13 | 9 | 2 (6) | 2 (15) |
| R2 ficha→Atrás | — | 116 (107–122) | 120 (115–125) | 102 (0–128) | — | — | 0 (0) | 1 (12) |
| R2 lista→Adelante | — | 79 (76–86) | 81 (74–87) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 1417 (1410–1427) | 1421 (1419–1422) | 113 (110–171) | 9 | 2373 | 1 (3) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 124 (118–173) | 121 (116–126) | 57 (54–111) | — | — | 2 (6) | 1 (9) |
| R10 reabrir la misma galería | — | 87 (82–98) | 95 (87–103) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 104 (93–104) | 93 (92–94) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | — | 1003 (997–1008) | 1012 (991–1032) | 0 (0–0) | 16 | 194 | 11 (33) | 1 (12) |
| R5 clientes→ficha | — | 1572 (1570–1580) | 1605 (1582–1628) | 0 (0–138) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 41 (40–41) | 43 (42–44) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | — | 911 (892–917) | 897 (891–903) | 0 (0–0) | 16 | 3 | 1 (3) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2

