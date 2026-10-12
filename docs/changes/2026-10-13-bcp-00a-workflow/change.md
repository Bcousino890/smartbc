# BCP-00A: flujo de trabajo voluntario de Fabricio

Añade la documentación mínima para que las tareas de Fabricio con agentes de IA sigan un flujo con límites claros, sin imponerlo a otras personas ni tocar la app, los ajustes o la infraestructura.

- **Tamaño:** medio
- **Responsable:** Fabricio
- **Rama:** `fabri/bcp-00a-workflow`
- **Estado:** plan aprobado; implementación en curso

## Especificación

### Contexto

Fabricio va a trabajar en BCP con Claude y, cuando él lo pida, con Codex como revisor. Antes de empezar su HOME y su catálogo quiere un flujo propio, versionado y voluntario. Esta especificación resume el borrador v2 de BCP-00 con los ajustes B1–B3, aprobados el 2026-10-13.

Hechos comprobados en `6e677c2a37124e5a7bae2f71cdc04bffa85790df` (y en GitHub el 2026-10-12):

- `main` no tiene protección de rama ni rulesets. `.github/CODEOWNERS` sirve para pedir revisión, pero no la impone sin esa protección. `REGLAS.md` exige PR y CI en verde.
- De los 105 commits que entraron directamente en `main` entre `1506dbc` y `6e677c2` (sin contar los que llegan dentro de un merge), la API de GitHub asocia 32 a un PR fusionado y 73 a ninguno. No se deduce nada sobre autores ni métodos de trabajo.
- El script versionado [scripts/vps-autodeploy.sh](../../../scripts/vps-autodeploy.sh) describe: cron cada minuto; commit y push a `main` de lo editado en el VPS; build → migraciones → cambio de versión → health check → vuelta al build anterior si falla. `.github/workflows/deploy.yml` dice también «cada minuto». La copia que se ejecuta en el VPS y el cron **no se han comprobado**.
- Por tanto, un merge a `main` se trata como posible despliegue y posible aplicación de migraciones. Volver al build anterior no deshace la base de datos. [scripts/apply-migrations.sh](../../../scripts/apply-migrations.sh) no mete cada archivo en una transacción.
- `.claude/` está en `.gitignore`. La CI usa Node 22 y `npm ci`.

Contexto de producto (fuera de esta tarea): la HOME es el espacio de trabajo inicialmente privado de Fabricio para trabajar con todo el CRM e irlo mejorando por módulos; el book o catálogo es su primer módulo. Cada módulo tendrá su propio expediente. No es una reescritura general del CRM.

### Decisiones

- `D00-1 (2026-10-13)`: flujo versionado y voluntario, aplicable a las tareas de Fabricio que lo adopten. Solo se añade documentación y un bloque condicional al inicio de `CLAUDE.md`; otros agentes pueden leerlo, pero no se les impone.
- `D00-2 (2026-10-13)`: 00A se separa de 00B. Los controles personales (permisos, hooks) son trabajo aparte y opcional. Se recomienda retirar el permiso SSH antes de implementar el catálogo, sin que sea requisito de 00A.
- `D00-3 (2026-10-13)`: política P-1. Los agentes no acceden al VPS ni a producción, no leen credenciales, no ejecutan migraciones ni escriben en sistemas externos o datos reales. Los diagnósticos de producción los ejecuta Fabricio. Se permiten pruebas con fixtures sintéticos aislados y comprobaciones de verdad offline (B3).
- `D00-4 (2026-10-13)`: documentos nuevos en español; prompts a Claude en inglés.
- `D00-5 (2026-10-13)`: la revisión de Codex se hace siempre bajo autorización de Fabricio y solo cuando una tarea difícil lo justifique; nunca es automática.
- `D00-6 (2026-10-13)`: en BCP-00A se omite la revisión adicional de Codex por presupuesto de tokens («Sí, ejecutar el plan sin revisión de Codex»). Se mantienen la verificación documental y la CI del PR.

Ajustes de la revisión del alcance:

- **B1:** la base de la tarea es un SHA de `origin/main` fijado al preparar el worktree; nunca el `main` local, que está desactualizado. Si `main` avanza, se decide de forma explícita si actualizar la rama.
- **B2:** verificación proporcional a un cambio de documentación. Node 22, `npm ci` y el build local no son obligatorios; la CI del PR sí.
- **B3:** P-1 se redacta para no bloquear pruebas locales legítimas con fixtures sintéticos.

### Alcance

1. [docs/workflow/README.md](../../workflow/README.md): roles, orden de prioridad de las instrucciones, tamaños y fases, decisiones y aprobaciones, producción y datos, recuperación de migraciones, despliegue e infraestructura, verificación, revisión, cierre y skills.
2. [docs/workflow/revision-codex.md](../../workflow/revision-codex.md): guía para revisiones opcionales de Codex en solo lectura, con la base del diff y el formato de los hallazgos.
3. [docs/changes/README.md](../README.md) y las plantillas de [docs/changes/plantillas/](../plantillas/), más este expediente.
4. Un bloque corto y condicional al principio de `CLAUDE.md`. El resto del archivo no cambia.

### Fuera de alcance

Código de la app, HOME y book, base de datos, VPS, ajustes de Claude, hooks, plugins, skills nuevas, permisos locales (incluido retirar el permiso SSH), reorganización completa de `CLAUDE.md`, `AGENTS.md` en la raíz, configuración de GitHub, instalaciones y limpieza de Git (ramas, stash, worktrees, gitlinks).

### Criterios de aceptación

| # | Criterio |
| --- | --- |
| AC1 | `docs/workflow/README.md` y `docs/workflow/revision-codex.md` cubren roles, prioridad, tamaños y fases, rama y PR en todos los tamaños, aprobación de especificación frente a aprobación de plan, P-1 con fixtures sintéticos, recuperación de migraciones, entorno y tipos de comprobación, despliegue, revisión opcional y cierre. |
| AC2 | Existen `docs/changes/README.md` y las cuatro plantillas, y este expediente sigue la estructura de `plantillas/change.md`. |
| AC3 | El bloque de `CLAUDE.md` es corto, deja claro que la guía histórica de SSH y la rama de desarrollo no autorizan nada en las tareas del flujo, y el resto del archivo es idéntico al de la base. |
| AC4 | El diff solo contiene los archivos del alcance: sin ajustes, hooks, plugins ni skills, sin secretos nuevos y sin conceptos ajenos a BCP. |
| AC5 | La preparación del worktree se ejecutó como parte de este plan y está anotada, con el `main` local, el stash y las demás ramas intactos. |
| AC6 | Rama y PR con la CI en verde en el último commit. La revisión de Codex queda anotada como omitida por decisión de Fabricio. Fabricio hace el merge. |

### Impacto en datos y despliegue

No hay migraciones, datos ni código de la app. Aun así, el merge a `main` puede disparar el autodeploy del VPS, que compilaría y desplegaría lo que haya en `main` (incluidos commits de otras personas aún no desplegados) y aplicaría cualquier migración pendiente. El momento del merge lo elige Fabricio.

### Aprobación de la especificación

2026-10-13, Fabricio: «Sí, apruebo ese alcance para preparar el plan». Esta aprobación permitió preparar el plan, no implementar.

## Plan

### Base

`6e677c2a37124e5a7bae2f71cdc04bffa85790df`: `origin/main` tras `git fetch origin` el 2026-10-13, igual a `git ls-remote origin refs/heads/main`. El `main` local (`1506dbc`) no se usa.

Si `origin/main` avanza antes del push: sin solapamiento con `CLAUDE.md`, `docs/workflow/` o `docs/changes/`, no se rehace la rama y se anota el SHA nuevo; con solapamiento, rebase antes del primer push y se repiten las comprobaciones; si hay conflicto, se aborta y se avisa a Fabricio.

### Tareas

Versión aprobada del plan, con la adaptación «sin revisión de Codex» (se omiten T8 y T9).

- **T1. Preparar el espacio de trabajo.** Guardar el estado del `main` local, el stash y las ramas; `git fetch origin`; fijar la base; crear el worktree `/Users/fabriirguez/SMARTBC/wt/bcp-00a` con la rama nueva desde el SHA. Verificar que `HEAD` es la base y que el resto sigue igual. Cubre AC5. Sin commit.
- **T2. `docs/changes/README.md` y plantillas.** Verificar que existen, que tienen encabezados y que no quedan `TODO` ni `XXX`. Cubre AC2. Commit `docs(changes): estructura de expedientes y plantillas`.
- **T3. Este expediente.** Verificar que sus encabezados coinciden con los de `plantillas/change.md` y que contiene el SHA base. Cubre AC2. Commit `docs(changes): expediente BCP-00A`.
- **T4. `docs/workflow/README.md`.** Verificar la cobertura con la tabla de abajo. Cubre AC1. Commit `docs(workflow): flujo voluntario de Fabricio`.
- **T5. `docs/workflow/revision-codex.md`.** Guía para revisiones futuras opcionales; las opciones del CLI se comprobaron con `codex exec --help` (codex-cli 0.157.1) y no se ejecuta ninguna revisión. Cubre AC1. Commit `docs(workflow): revisión de Codex en solo lectura`.
- **T6. Bloque al principio de `CLAUDE.md`.** Verificar con `git diff --numstat` (solo líneas añadidas) y con `cmp` que el resto es idéntico a la base. Cubre AC3. Commit `docs(claude): bloque inicial del flujo voluntario`.
- **T7. Verificación del conjunto.** Diff limitado, enlaces locales, secretos, conceptos ajenos a BCP, coherencia entre documentos, conservación de `CLAUDE.md` y árbol limpio. Cubre AC1–AC4.
- **T8–T9.** Omitidas por decisión de Fabricio (D00-6).
- **T10. Resultado.** Completar la sección Resultado. Commit `docs(changes): resultado BCP-00A`.
- **T11. Avance del remoto, push y PR.** Comprobar `origin/main` según la regla de la base; `git push -u origin fabri/bcp-00a-workflow`; `gh pr create` hacia `main` con el aviso de despliegue.
- **T12. CI y registro final.** `gh pr checks --watch`; anotar el PR y la CI; commit `docs(changes): PR y CI de BCP-00A`; comprobar la CI en el último commit.
- **T13. Entrega.** Enlace del PR y aviso de despliegue. Fabricio hace el merge. El worktree y la rama se conservan.

**Tabla de cobertura** (T4, T5 y T7):

| Tema | Dónde |
| --- | --- |
| Ámbito voluntario y cómo se adopta | `docs/workflow/README.md` §1 |
| Roles | `docs/workflow/README.md` §2 |
| Orden de prioridad; la guía histórica de SSH y la rama no autorizan | `docs/workflow/README.md` §3 y bloque de `CLAUDE.md` |
| Tamaños y fases; rama y PR siempre; un módulo cada vez | `docs/workflow/README.md` §4 |
| Decisiones D#; aprobación de especificación frente a plan; pasos rutinarios sin volver a preguntar | `docs/workflow/README.md` §5 |
| P-1 con fixtures sintéticos; entorno desconocido hasta verificarlo; un `deny` no se levanta en la conversación | `docs/workflow/README.md` §6 |
| Recuperación de migraciones | `docs/workflow/README.md` §7 |
| Despliegue: script versionado frente a VPS sin comprobar; merge = posible despliegue y migraciones; el build anterior no deshace datos; sin transacción por archivo | `docs/workflow/README.md` §8 |
| Verificación proporcional y tipos de comprobación | `docs/workflow/README.md` §9 |
| Revisión de Codex opcional, base por SHA, instrucciones por stdin | `docs/workflow/README.md` §10 y `docs/workflow/revision-codex.md` |
| Cierre, merge de Fabricio, deshacer por PR | `docs/workflow/README.md` §11 |
| Skills por fase | `docs/workflow/README.md` §12 |

### Pasos de entorno que autoriza el plan

- `git fetch origin` en `/Users/fabriirguez/SMARTBC/smartbc` (T1 y T11, y en T12 si el PR tiene conflicto). Actualiza `origin/*`; no toca el `main` local ni los archivos.
- Crear `/Users/fabriirguez/SMARTBC/_revisiones/bcp-00a` (notas de verificación, fuera de todo repo) y `git worktree add -b fabri/bcp-00a-workflow /Users/fabriirguez/SMARTBC/wt/bcp-00a 6e677c2a37124e5a7bae2f71cdc04bffa85790df`.
- Commits en la rama, `git push` normal de `fabri/bcp-00a-workflow` (nunca `--force`), `gh pr create` y lectura de `gh pr checks`.
- No autoriza: merge, push a `main`, ajustes, hooks, instalaciones, build, SSH, base de datos, credenciales ni borrar el worktree o la rama.

### Aprobación del plan

2026-10-13, Fabricio: «Sí, ejecutar el plan sin revisión de Codex». Aprueba T1–T7 y T10–T13 y las correcciones ordinarias dentro del alcance.

## Resultado

### Commits

<Se completa en T10.>

### Verificaciones

<Se completa en T10.>

### Criterios de aceptación

<Se completa en T10.>

### Revisión

<Se completa en T10.>

### Pendiente o no demostrado

<Se completa en T10.>

### PR, CI y merge

<Se completa en T12.>
