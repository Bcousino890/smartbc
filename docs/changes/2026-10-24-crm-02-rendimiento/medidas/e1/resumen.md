
## e1 — 18 pasadas (LOCAL; «lat40» = 40 ms simulados; «movil» = CPU y red simuladas)

### escritorio · contrato: 36/36
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 306 (237–451) | 249 (208–258) | 0 (0–0) | 9 | 879 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 116 (116–119) | 106 (98–115) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 194 (192–201) | 181 (171–182) | 0 (0–0) | 9 | 878 | 3 (9) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 907 (904–914) | 890 (860–900) | — | 28+9 | 55+879 | 21 (63) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 247 (245–301) | 233 (232–244) | — | 23 | 1191 | 20 (60) | 1 (12) |
| R2 lista→ficha | — | 64 (61–67) | 69 (62–73) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 63 (62–69) | 61 (60–65) | 0 (0–0) | — | — | 1 (3) | 1 (12) |
| R2 lista→Adelante | — | 27 (24–29) | 31 (24–32) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 222 (214–233) | 224 (221–233) | 0 (0–0) | 9 | 992 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | 29 (17–29) | 74 (59–82) | 67 (55–73) | 0 (0–0) | — | — | 0 (0) | 2 (13) |
| R10 reabrir la misma galería | — | 63 (50–72) | 57 (51–63) | 0 (0–0) | — | — | 0 (0) | 2 (13) |
| R10 abrir la galería de otra propiedad | 26 (26–29) | 41 (41–45) | 43 (41–48) | 0 (0–0) | — | — | 0 (0) | 2 (13) |
| R5 sidebar→clientes | — | 85 (81–85) | 76 (72–92) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 67 (66–80) | 64 (63–70) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 3 (2–3) | 2 (2–3) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | — | 60 (54–68) | 65 (62–66) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R11=1 · R5=2

### escritorio-lat40 · contrato: 36/36
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 490 (479–498) | 487 (446–508) | 0 (0–0) | 9 | 879 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 636 (630–641) | 636 (622–646) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 415 (414–419) | 427 (413–439) | 0 (0–0) | 9 | 878 | 3 (9) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 2300 (2298–2303) | 2288 (2280–2328) | — | 28+9 | 55+879 | 21 (63) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 884 (877–889) | 872 (871–1297) | — | 23 | 1191 | 20 (60) | 1 (12) |
| R2 lista→ficha | — | 639 (638–654) | 644 (631–657) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 65 (62–65) | 59 (59–68) | 0 (0–0) | — | — | 1 (3) | 1 (12) |
| R2 lista→Adelante | — | 25 (24–26) | 28 (26–31) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 846 (842–847) | 843 (833–846) | 0 (0–0) | 9 | 992 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | 22 (14–23) | 206 (198–225) | 202 (201–237) | 0 (0–0) | — | — | 0 (0) | 2 (13) |
| R10 reabrir la misma galería | — | 51 (49–52) | 50 (47–61) | 0 (0–0) | — | — | 0 (0) | 2 (13) |
| R10 abrir la galería de otra propiedad | 38 (36–41) | 217 (216–220) | 212 (209–217) | 0 (0–0) | — | — | 0 (0) | 2 (13) |
| R5 sidebar→clientes | — | 586 (581–590) | 575 (564–591) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 870 (862–879) | 878 (876–883) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 3 (3–3) | 3 (2–3) | 0 (0–0) | — | — | 0 (0) | 1 (21) |
| R6 sidebar→solicitudes | — | 569 (565–571) | 548 (540–561) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R11=1 · R5=2

### movil · contrato: 35/35
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 1452 (1419–1464) | 1463 (1382–1490) | 59 (55–126) | 9 | 879 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 583 (576–584) | 598 (584–603) | 0 (0–0) | 13 | 9 | 2 (6) | 2 (15) |
| R1 ficha→«Volver» | — | 731 (719–745) | 739 (731–745) | 150 (0–162) | 9 | 878 | 2 (6) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 5181 (5170–5194) | 5183 (5181–5214) | — | 28+9 | 55+879 | 17 (51) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 3264 (3252–3267) | 3266 (3260–3269) | — | 23 | 1191 | 12 (36) | 1 (12) |
| R2 lista→ficha | — | 543 (540–551) | 540 (532–541) | 0 (0–0) | 13 | 9 | 2 (6) | 2 (15) |
| R2 ficha→Atrás | — | 126 (117–134) | 125 (123–126) | 118 (0–126) | — | — | 0 (0) | 1 (12) |
| R2 lista→Adelante | — | 71 (70–72) | 70 (68–73) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 912 (911–914) | 912 (906–913) | 55 (51–102) | 9 | 992 | 1 (3) | 0 (0) |
| R10 abrir galería (1.ª vez) | 21 (20–35) | 198 (198–214) | 208 (202–312) | 92 (88–94) | — | — | 2 (6) | 2 (13) |
| R10 reabrir la misma galería | — | 95 (94–106) | 104 (99–114) | 0 (0–0) | — | — | 0 (0) | 2 (13) |
| R10 abrir la galería de otra propiedad | 45 (37–64) | 217 (212–235) | 216 (212–223) | 0 (0–0) | — | — | 0 (0) | 2 (13) |
| R5 sidebar→clientes | — | 1028 (1005–1039) | 1021 (1010–1021) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 1548 (1541–1550) | 1544 (1543–1545) | 113 (104–198) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 2 (2–6) | 5 (2–6) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | — | 923 (908–955) | 924 (897–937) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R11=1 · R5=2

