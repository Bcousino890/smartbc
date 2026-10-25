
## e3 — 18 pasadas (LOCAL; «lat40» = 40 ms simulados; «movil» = CPU y red simuladas)

### escritorio · contrato: 33/33
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 307 (304–369) | 301 (270–311) | 0 (0–0) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 119 (108–121) | 107 (97–115) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 240 (227–248) | 214 (212–250) | 0 (0–0) | 9 | 2103 | 3 (9) | 0 (0) |
| R1 sidebar→propiedades (repetida) | — | 935 (920–936) | 926 (907–943) | — | 28+9 | 55+2103 | 21 (63) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 323 (320–345) | 315 (309–326) | — | 23 | 2517 | 20 (60) | 1 (12) |
| R2 lista→ficha | — | 78 (72–143) | 71 (65–83) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 63 (61–70) | 61 (58–62) | 0 (0–0) | — | — | 1 (3) | 0 (0) |
| R2 lista→Adelante | — | 32 (31–37) | 36 (34–43) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 248 (247–249) | 247 (241–249) | 0 (0–0) | 9 | 2373 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 78 (71–79) | 82 (75–95) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 reabrir la misma galería | — | 56 (44–62) | 49 (46–54) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 62 (54–67) | 50 (48–58) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | — | 87 (80–97) | 83 (80–91) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 91 (77–95) | 78 (75–84) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 28 (19–34) | 21 (18–24) | 0 (0–0) | — | — | 0 (0) | 0 (0) |
| R6 sidebar→solicitudes | — | 58 (43–74) | 69 (67–71) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=2 · R2=1 · R4=1 · R8=2 · R9=2 · R10=1 · R12=2 · R5=1 · R7=1

### escritorio-lat40 · contrato: 33/33
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 613 (599–614) | 596 (579–599) | 0 (0–0) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 646 (641–662) | 655 (633–665) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 523 (518–580) | 515 (514–549) | 0 (0–0) | 9 | 2103 | 3 (9) | 0 (0) |
| R1 sidebar→propiedades (repetida) | — | 2401 (2367–2418) | 2358 (2335–2430) | — | 28+9 | 55+2103 | 21 (63) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 983 (969–988) | 954 (943–983) | — | 23 | 2517 | 20 (60) | 1 (12) |
| R2 lista→ficha | — | 641 (630–682) | 641 (633–656) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 67 (61–77) | 73 (67–79) | 0 (0–0) | — | — | 1 (3) | 0 (0) |
| R2 lista→Adelante | — | 29 (27–35) | 31 (26–32) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 842 (829–853) | 839 (829–839) | 0 (0–0) | 9 | 2373 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 83 (71–151) | 86 (80–98) | 0 (0–104) | — | — | 0 (0) | 1 (9) |
| R10 reabrir la misma galería | — | 55 (41–56) | 46 (40–55) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 50 (42–52) | 47 (39–56) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | — | 589 (569–598) | 581 (576–583) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 931 (927–931) | 900 (871–918) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 21 (20–24) | 19 (14–20) | 0 (0–0) | — | — | 0 (0) | 0 (0) |
| R6 sidebar→solicitudes | — | 507 (499–512) | 507 (496–514) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=2 · R2=1 · R4=1 · R8=2 · R9=2 · R10=1 · R12=2 · R5=1

### movil · contrato: 31/31
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | — | 1876 (1838–1976) | 1849 (1837–1908) | 163 (156–262) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 595 (594–622) | 595 (584–625) | 0 (0–0) | 13 | 9 | 2 (6) | 2 (15) |
| R1 ficha→«Volver» | — | 1216 (1204–1218) | 1216 (1202–1216) | 342 (327–369) | 9 | 2103 | 2 (6) | 0 (0) |
| R1 sidebar→propiedades (repetida) | — | 5650 (5647–5667) | 5645 (5631–5650) | — | 28+9 | 56+2103 / 55+2103 | 17 (51) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 3862 (3857–3871) | 3852 (3836–3861) | — | 23 | 2517 | 12 (36) | 1 (12) |
| R2 lista→ficha | — | 567 (557–579) | 573 (554–611) | 0 (0–0) | 13 | 9 | 2 (6) | 2 (15) |
| R2 ficha→Atrás | — | 120 (117–127) | 128 (121–137) | 101 (0–128) | — | — | 0 (0) | 0 (0) |
| R2 lista→Adelante | — | 76 (75–92) | 74 (73–75) | 0 (0–153) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 1430 (1421–1440) | 1429 (1420–1432) | 113 (107–176) | 9 | 2373 | 1 (3) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 185 (176–185) | 179 (172–198) | 113 (109–122) | — | — | 2 (6) | 1 (9) |
| R10 reabrir la misma galería | — | 85 (84–101) | 98 (83–99) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 95 (82–97) | 85 (85–91) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | — | 1003 (989–1010) | 1008 (994–1015) | 0 (0–0) | 16 | 194 | 11 (33) | 1 (12) |
| R5 clientes→ficha | — | 1629 (1625–1639) | 1633 (1576–1681) | 124 (0–140) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 43 (41–44) | 40 (38–51) | 0 (0–0) | — | — | 0 (0) | 0 (0) |
| R6 sidebar→solicitudes | — | 907 (899–909) | 920 (899–924) | 0 (0–0) | 16 | 3 | 1 (3) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=2 · R2=1 · R4=1 · R8=2 · R9=2 · R10=1 · R12=1 · R5=1

