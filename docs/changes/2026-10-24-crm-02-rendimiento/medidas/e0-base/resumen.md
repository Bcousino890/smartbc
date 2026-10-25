
## base — 18 pasadas (LOCAL; «lat40» = 40 ms simulados; «movil» = CPU y red simuladas)

### escritorio · contrato: 31/31
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 309 (296–380) | 287 (278–292) | 0 (0–0) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 104 (97–110) | 98 (85–102) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 238 (236–261) | 213 (207–223) | 0 (0–0) | 9 | 2102 | 3 (9) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 956 (913–966) | 907 (903–918) | — | 28+9 | 55+2103 | 21 (63) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 320 (316–321) | 319 (308–674) | — | 23 | 2517 | 20 (60) | 1 (12) |
| R2 lista→ficha | — | 72 (62–76) | 64 (57–72) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 53 (50–57) | 60 (60–70) | 0 (0–0) | — | — | 1 (3) | 1 (12) |
| R2 lista→Adelante | — | 24 (21–33) | 25 (24–33) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 354 (240–361) | 253 (246–346) | 0 (0–0) | 9 | 2373 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 69 (66–85) | 72 (66–88) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 reabrir la misma galería | — | 54 (41–60) | 48 (46–60) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 42 (38–44) | 44 (40–52) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | — | 75 (75–82) | 89 (80–92) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 69 (64–73) | 64 (63–66) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 2 (1–2) | 2 (1–2) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | — | 48 (39–51) | 60 (50–68) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2 · R7=1

### escritorio-lat40 · contrato: 31/31
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 588 (561–659) | 590 (579–625) | 0 (0–0) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 634 (630–661) | 644 (638–652) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 507 (492–507) | 528 (515–574) | 0 (0–0) | 9 | 2102 | 3 (9) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 2349 (2306–2357) | 2348 (2311–2381) | — | 28+9 | 55+2103 | 21 (63) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 971 (951–996) | 982 (956–1043) | — | 23 | 2517 | 20 (60) | 1 (12) |
| R2 lista→ficha | — | 622 (620–753) | 645 (644–647) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 72 (64–73) | 59 (50–67) | 0 (0–0) | — | — | 1 (3) | 1 (12) |
| R2 lista→Adelante | — | 26 (26–27) | 27 (25–29) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 838 (831–858) | 843 (827–847) | 0 (0–0) | 9 | 2373 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 72 (56–76) | 68 (68–80) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 reabrir la misma galería | — | 41 (37–53) | 44 (42–47) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 40 (37–64) | 46 (39–47) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | — | 586 (529–599) | 577 (573–577) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 875 (857–898) | 867 (813–879) | 0 (0–126) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 2 (1–5) | 2 (2–6) | 0 (0–0) | — | — | 0 (0) | 1 (21) |
| R6 sidebar→solicitudes | — | 551 (543–558) | 552 (530–565) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2 · R7=1

### movil · contrato: 30/30
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 1971 (1871–1985) | 1911 (1855–1948) | 184 (155–238) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 614 (585–625) | 610 (572–612) | 0 (0–0) | 13 | 9 | 2 (6) | 2 (15) |
| R1 ficha→«Volver» | — | 1229 (1199–1254) | 1219 (1210–1264) | 338 (324–366) | 9 | 2102 | 2 (6) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 5689 (5672–5809) | 5678 (5632–5703) | — | 28+9 | 55+2103 | 17 (51) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 3840 (3821–3900) | 3831 (3797–3862) | — | 23 | 2517 | 12 (36) | 1 (12) |
| R2 lista→ficha | — | 556 (539–696) | 578 (569–579) | 0 (0–63) | 13 | 9 | 2 (6) | 2 (15) |
| R2 ficha→Atrás | — | 148 (119–156) | 123 (123–126) | 107 (100–158) | — | — | 0 (0) | 1 (12) |
| R2 lista→Adelante | — | 87 (70–92) | 73 (68–73) | 0 (0–180) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 1422 (1415–1588) | 1456 (1430–1482) | 148 (114–247) | 9 | 2373 | 1 (3) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 198 (124–207) | 174 (170–199) | 107 (59–127) | — | — | 2 (6) | 1 (9) |
| R10 reabrir la misma galería | — | 102 (89–157) | 95 (90–104) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 107 (89–149) | 90 (84–92) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | — | 1030 (1029–1055) | 1039 (1034–1052) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 1561 (1545–1614) | 1553 (1550–1689) | 130 (0–442) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 5 (1–5) | 6 (4–7) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | — | 937 (917–944) | 923 (905–941) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2

