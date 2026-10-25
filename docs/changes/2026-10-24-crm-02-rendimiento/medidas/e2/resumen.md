
## e2 — 18 pasadas (LOCAL; «lat40» = 40 ms simulados; «movil» = CPU y red simuladas)

### escritorio · contrato: 31/31
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | 44 (42–52) | 362 (280–366) | 333 (292–394) | 0 (0–0) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 119 (99–127) | 114 (107–126) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 277 (238–301) | 228 (226–317) | 0 (0–0) | 9 | 2102 | 3 (9) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 956 (956–1103) | 954 (913–1045) | — | 28+9 | 55+2103 | 21 (63) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 342 (330–529) | 355 (349–481) | — | 23 | 2517 | 20 (60) | 1 (12) |
| R2 lista→ficha | — | 166 (75–245) | 139 (67–155) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 111 (51–117) | 71 (55–114) | 0 (0–112) | — | — | 1 (3) | 1 (12) |
| R2 lista→Adelante | — | 34 (29–39) | 34 (27–41) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 348 (248–896) | 244 (228–344) | 0 (0–0) | 9 | 2373 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 74 (72–82) | 86 (77–96) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 reabrir la misma galería | — | 52 (47–288) | 50 (44–64) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 55 (44–82) | 46 (37–64) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | 29 (25–38) | 90 (78–118) | 99 (85–109) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 117 (80–146) | 92 (72–98) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 19 (18–21) | 20 (19–25) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | 26 (25–32) | 82 (64–102) | 61 (55–63) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2 · R7=1

### escritorio-lat40 · contrato: 31/31
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | 39 (35–40) | 596 (559–599) | 599 (578–600) | 0 (0–0) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 646 (644–658) | 653 (647–669) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 523 (515–525) | 522 (503–533) | 0 (0–0) | 9 | 2102 | 3 (9) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 2389 (2320–2526) | 2371 (2354–2430) | — | 28+9 | 55+2103 | 21 (63) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 1201 (989–1207) | 982 (948–992) | — | 23 | 2517 | 20 (60) | 1 (12) |
| R2 lista→ficha | — | 745 (655–804) | 652 (646–655) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 67 (59–75) | 73 (65–74) | 0 (0–0) | — | — | 1 (3) | 1 (12) |
| R2 lista→Adelante | — | 30 (29–35) | 28 (27–28) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 846 (844–856) | 853 (835–855) | 0 (0–0) | 9 | 2373 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 70 (68–82) | 75 (56–108) | 0 (0–58) | — | — | 0 (0) | 1 (9) |
| R10 reabrir la misma galería | — | 44 (39–61) | 56 (39–63) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 44 (39–51) | 37 (36–51) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | 32 (30–44) | 571 (556–581) | 577 (558–581) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 909 (900–917) | 917 (879–919) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 20 (19–23) | 21 (19–23) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | 29 (24–35) | 551 (543–554) | 530 (522–546) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2

### movil · contrato: 30/30
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | 442 (430–444) | 1868 (1865–1897) | 1839 (1829–1840) | 159 (153–216) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 598 (587–599) | 583 (578–591) | 0 (0–0) | 13 | 9 | 2 (6) | 2 (15) |
| R1 ficha→«Volver» | — | 1217 (1217–1225) | 1219 (1217–1231) | 351 (342–381) | 9 | 2102 | 2 (6) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 5640 (5624–5653) | 5618 (5607–5658) | — | 28+9 | 55+2103 | 17 (51) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 3877 (3864–3909) | 3849 (3837–3850) | — | 23 | 2517 | 12 (36) | 1 (12) |
| R2 lista→ficha | — | 569 (559–583) | 571 (570–572) | 0 (0–0) | 13 | 9 | 2 (6) | 2 (15) |
| R2 ficha→Atrás | — | 135 (127–143) | 126 (118–134) | 107 (0–130) | — | — | 0 (0) | 1 (12) |
| R2 lista→Adelante | — | 74 (70–83) | 72 (70–82) | 0 (0–150) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 1425 (1419–1427) | 1429 (1419–1431) | 116 (106–173) | 9 | 2373 | 1 (3) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 174 (172–183) | 184 (128–268) | 103 (60–173) | — | — | 2 (6) | 1 (9) |
| R10 reabrir la misma galería | — | 97 (87–101) | 93 (88–104) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 95 (90–111) | 94 (92–109) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | 428 (407–435) | 1035 (1017–1122) | 1013 (985–1018) | 0 (0–0) | 16 | 194 | 11 (33) | 1 (12) |
| R5 clientes→ficha | — | 1627 (1612–1630) | 1570 (1569–1605) | 0 (0–130) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 48 (47–49) | 43 (42–44) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | 401 (398–417) | 911 (899–932) | 900 (899–913) | 0 (0–0) | 16 | 3 | 1 (3) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2

