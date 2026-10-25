
## pi — 18 pasadas (LOCAL; «lat40» = 40 ms simulados; «movil» = CPU y red simuladas)

### escritorio · contrato: 31/31
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | 48 (46–53) | 286 (281–351) | 273 (257–275) | 0 (0–0) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 117 (112–121) | 110 (104–112) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 240 (235–244) | 227 (207–232) | 0 (0–0) | 9 | 2102 | 1 (3) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 906 (903–916) | 896 (863–898) | — | 28+9 | 55+2103 | 9 (27) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 318 (317–350) | 309 (303–313) | — | 23 | 2517 | 7 (21) | 1 (12) |
| R2 lista→ficha | — | 73 (66–81) | 72 (67–74) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 63 (55–67) | 70 (63–75) | 0 (0–0) | — | — | 1 (3) | 1 (12) |
| R2 lista→Adelante | — | 31 (31–38) | 32 (28–33) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 239 (230–355) | 247 (236–250) | 0 (0–0) | 9 | 2373 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 77 (53–88) | 64 (57–70) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 reabrir la misma galería | — | 65 (56–69) | 54 (51–58) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 48 (42–49) | 48 (48–51) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | 41 (36–45) | 99 (95–102) | 95 (90–102) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 75 (69–92) | 82 (70–84) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 19 (17–20) | 19 (16–20) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | 26 (24–33) | 67 (62–74) | 49 (44–66) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2

### escritorio-lat40 · contrato: 31/31
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | 37 (35–40) | 562 (551–571) | 538 (534–551) | 0 (0–0) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 651 (639–651) | 657 (648–660) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 499 (499–515) | 495 (491–514) | 0 (0–0) | 9 | 2102 | 3 (9) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 2081 (2057–2083) | 2046 (2043–2053) | — | 28+9 | 55+2103 | 9 (27) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 950 (943–999) | 970 (953–974) | — | 23 | 2517 | 7 (21) | 1 (12) |
| R2 lista→ficha | — | 640 (638–698) | 642 (640–712) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 72 (63–79) | 68 (62–80) | 0 (0–0) | — | — | 1 (3) | 1 (12) |
| R2 lista→Adelante | — | 27 (27–28) | 27 (25–29) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 852 (834–852) | 854 (851–859) | 0 (0–0) | 9 | 2373 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 68 (60–72) | 66 (62–70) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 reabrir la misma galería | — | 44 (38–50) | 47 (36–48) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 44 (37–58) | 39 (38–40) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | 36 (36–49) | 578 (577–586) | 565 (561–588) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 888 (880–895) | 876 (875–882) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 20 (19–21) | 17 (10–18) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | 30 (22–33) | 541 (528–547) | 542 (531–544) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2

### movil · contrato: 30/30
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | 430 (427–438) | 1840 (1838–1842) | 1855 (1832–1856) | 158 (152–210) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 585 (585–599) | 613 (584–625) | 0 (0–0) | 13 | 9 | 2 (6) | 2 (15) |
| R1 ficha→«Volver» | — | 1202 (1202–1205) | 1216 (1214–1273) | 333 (297–429) | 9 | 2102 | 2 (6) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 5365 (5335–5369) | 5346 (5335–5357) | — | 28+9 | 55+2103 | 9 (27) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 3861 (3853–3872) | 3830 (3815–3869) | — | 23 | 2517 | 3 (9) | 1 (12) |
| R2 lista→ficha | — | 563 (548–566) | 552 (550–584) | 0 (0–0) | 13 | 9 | 2 (6) | 2 (15) |
| R2 ficha→Atrás | — | 122 (116–131) | 118 (117–120) | 54 (0–120) | — | — | 0 (0) | 1 (12) |
| R2 lista→Adelante | — | 74 (74–94) | 74 (73–83) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 1423 (1421–1443) | 1422 (1416–1425) | 114 (112–159) | 9 | 2373 | 1 (3) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 128 (123–174) | 128 (125–142) | 58 (52–105) | — | — | 2 (6) | 1 (9) |
| R10 reabrir la misma galería | — | 89 (88–92) | 90 (86–115) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 94 (85–107) | 86 (79–91) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | 412 (412–418) | 1015 (1011–1015) | 1013 (992–1022) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 1585 (1571–1635) | 1573 (1570–1574) | 0 (0–128) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 41 (40–55) | 44 (42–44) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | 409 (406–409) | 906 (895–914) | 903 (902–906) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2

