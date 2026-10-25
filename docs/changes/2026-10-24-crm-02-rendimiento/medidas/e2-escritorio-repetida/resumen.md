
## e2b — 6 pasadas (LOCAL; «lat40» = 40 ms simulados; «movil» = CPU y red simuladas)

### escritorio · contrato: 31/31
| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |
|---|---|---|---|---|---|---|---|---|
| R1 sidebar→propiedades (1.ª vez) | 49 (46–50) | 302 (290–338) | 286 (268–330) | 0 (0–0) | 9 | 2103 | 1 (3) | 1 (12) |
| R1 lista→ficha | — | 123 (100–127) | 106 (104–115) | 0 (0–0) | 13 | 9 | 6 (18) | 2 (15) |
| R1 ficha→«Volver» | — | 249 (224–257) | 222 (214–242) | 0 (0–0) | 9 | 2102 | 3 (9) | 1 (12) |
| R1 sidebar→propiedades (repetida) | — | 952 (949–969) | 917 (897–920) | — | 28+9 | 55+2103 | 21 (63) | 1 (12) |
| R2 carga completa de la lista filtrada (documento) | — | 337 (318–349) | 350 (328–401) | — | 23 | 2517 | 20 (60) | 1 (12) |
| R2 lista→ficha | — | 68 (61–75) | 76 (65–90) | 0 (0–0) | 13 | 9 | 0 (0) | 2 (15) |
| R2 ficha→Atrás | — | 74 (73–76) | 70 (49–84) | 0 (0–0) | — | — | 1 (3) | 1 (12) |
| R2 lista→Adelante | — | 29 (26–29) | 35 (28–42) | 0 (0–0) | — | — | 0 (0) | 2 (15) |
| R4 Ver archivadas | — | 278 (240–376) | 240 (224–335) | 0 (0–0) | 9 | 2373 | 2 (6) | 0 (0) |
| R10 abrir galería (1.ª vez) | — | 71 (63–93) | 82 (73–160) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 reabrir la misma galería | — | 50 (31–68) | 60 (46–60) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R10 abrir la galería de otra propiedad | — | 43 (38–47) | 45 (42–50) | 0 (0–0) | — | — | 0 (0) | 1 (9) |
| R5 sidebar→clientes | 37 (29–42) | 94 (87–100) | 92 (91–93) | 0 (0–0) | 16 | 194 | 10 (30) | 1 (12) |
| R5 clientes→ficha | — | 78 (72–99) | 96 (80–109) | 0 (0–0) | 29 | 5 | 0 (0) | 0 (0) |
| R5 ficha→Atrás | — | 19 (19–20) | 19 (18–20) | 0 (0–0) | — | — | 0 (0) | 1 (12) |
| R6 sidebar→solicitudes | 25 (23–30) | 66 (64–71) | 65 (57–78) | 0 (0–0) | 16 | 3 | 0 (0) | 0 (0) |

Peticiones a /api/admin/notifications por recorrido (mediana): R1=3 · R2=3 · R4=1 · R8=3 · R9=2 · R10=1 · R5=2 · R7=1

