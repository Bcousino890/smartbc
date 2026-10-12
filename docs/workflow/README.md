# Flujo de trabajo voluntario de Fabricio

Cómo trabajan Fabricio y sus agentes de IA en este repo: quién decide, qué
fases sigue cada cambio, qué límites no se cruzan y cómo se cierra una tarea.
Origen: BCP-00A ([expediente](../changes/2026-10-13-bcp-00a-workflow/change.md)).

## 1. Ámbito y cómo se adopta

- Este flujo es **voluntario**. Se aplica a las tareas que lo adoptan
  expresamente: las que tienen expediente en [docs/changes/](../changes/README.md)
  o cuyo encargo pide seguir este documento.
- No obliga a otras personas ni a sus agentes. Pueden leerlo, pero su trabajo
  sigue sus propias reglas y [REGLAS.md](../../REGLAS.md).
- Lo complementa [revision-codex.md](revision-codex.md), solo para las
  revisiones de Codex que Fabricio pida.

## 2. Roles

| Quién | Qué hace |
| --- | --- |
| Fabricio | Decide producto, alcance, arquitectura, datos y calidad visual. Aprueba especificaciones y planes. Hace el merge. Ejecuta él mismo cualquier diagnóstico en producción. |
| Claude | Explora, propone el tamaño del cambio, redacta especificación y plan, implementa las tareas aprobadas y aporta las verificaciones con su evidencia. Es el escritor principal de las piezas acopladas. |
| Codex | Segundo revisor en solo lectura, **solo cuando Fabricio lo pide** ([revision-codex.md](revision-codex.md)). No modifica nada. |

## 3. Orden de prioridad de las instrucciones

Si dos instrucciones chocan, manda la primera de esta lista:

1. Las instrucciones y autorizaciones vigentes de Fabricio.
2. [REGLAS.md](../../REGLAS.md) (PR y CI en verde) y los límites de este
   documento.
3. Las decisiones y la especificación aprobada de la tarea, en su expediente.
4. [CLAUDE.md](../../CLAUDE.md) y la documentación de cada área, como contexto
   operativo. En las tareas de este flujo, **las indicaciones históricas de
   `CLAUDE.md` sobre acceso SSH al VPS (incluida la regla de permisos
   `ssh root@…`) y sobre la rama de desarrollo `claude/adoring-pasteur-3OgFB`
   no autorizan ninguna acción**.
5. Los hábitos genéricos de las skills.

Lo que no está comprobado se presenta como tal: comentarios, documentos
antiguos y memoria no demuestran cómo funciona el sistema hoy.

## 4. Tamaños y fases

Claude propone el tamaño y Fabricio lo confirma. El tamaño depende del riesgo,
no del número de archivos.

| Tamaño | Cuándo | Fases | Registro |
| --- | --- | --- | --- |
| Pequeño | Corrección local cuyo resultado esperado ya está claro. | Explorar → implementar → verificar lo concreto → PR. | Descripción del PR |
| Medio | Función nueva o cambio de comportamiento sin cambios estructurales. | Explorar → decisiones → especificación y plan aprobados → implementar → verificar → PR. | `change.md` |
| Grande o sensible | Migraciones o datos reales, auth o permisos en servidor, integraciones externas que escriben (Idealista, Zinto, SES…), despliegue o CI, controles de ejecución, o cambios estructurales. | Explorar → decisiones → especificación → revisión → aprobación → plan → revisión → aprobación → tareas pequeñas verificadas → QA de Fabricio → revisión opcional de Codex → correcciones → PR. | `spec.md`, `plan.md`, `result.md` |

Reglas comunes a todos los tamaños:

- **Siempre en una rama propia y por PR.** Nunca push a `main`, nunca
  `--force` sobre `main`, nunca merge por parte de un agente.
- Medio y grande trabajan en un worktree aislado creado desde un SHA de
  `origin/main` (ver §9). El `main` local no sirve como base: puede estar
  desactualizado.
- Un solo escritor principal. Repartir trabajo entre agentes solo si la
  división es segura y está en el plan aprobado.
- Si una tarea pequeña o media resulta tocar algo de la columna «grande o
  sensible», se reclasifica antes de seguir con esa parte.
- La HOME de Fabricio evoluciona **un módulo cada vez**, cada uno con su
  propio expediente. Ninguna tarea se convierte en una reescritura general del
  CRM; los defectos se demuestran en el código antes de corregirlos.

## 5. Decisiones y aprobaciones

- Las decisiones de Fabricio se anotan en el expediente como `D1`, `D2`…, con
  fecha. No se vuelven a preguntar.
- Solo se pregunta lo que afecta a producto, alcance, arquitectura, datos o
  interfaz. Los detalles de implementación sin ese efecto los decide Claude y
  los anota en el expediente.
- **Aprobar la especificación permite preparar el plan; no permite
  implementar.** Implementar requiere un plan aprobado.
- Aprobar el plan autoriza: editar, hacer commits en la rama de la tarea, hacer
  push de esa rama, abrir el PR y ejecutar **los pasos de entorno que el plan
  nombra** con su comando y su efecto. Esos pasos rutinarios no se vuelven a
  preguntar entre tareas.
- Aprobar el plan **no** autoriza: nada en producción, leer credenciales,
  ejecutar migraciones, escribir en sistemas externos o datos reales, ni
  instalaciones o cambios de ajustes que el plan no nombre.
- Si aparece una decisión nueva o una suposición del plan resulta falsa, se
  actualiza el expediente antes de seguir con esa parte.
- Antes de cada fase que cambie archivos o el entorno, Claude explica en breve
  qué hará, quién escribe y quién revisa, qué skills usará y qué herramientas
  externas necesita.

## 6. Producción y datos (política P-1)

Los agentes **no**:

- acceden al VPS ni a producción (nada de SSH, `scp`, `rsync` ni ediciones en
  el checkout del VPS);
- leen ni imprimen credenciales: `.env*`, claves, tokens, `~/.ssh` ni valores
  sensibles de `app_settings`;
- ejecutan migraciones, `psql`, `docker exec` ni
  [scripts/apply-migrations.sh](../../scripts/apply-migrations.sh);
- escriben en sistemas externos ni en datos reales (scripts de backfill, de
  escritura, smoke tests contra servicios reales…).

Los agentes **sí** pueden:

- leer el código del repo;
- ejecutar comprobaciones de verdad offline y pruebas con **fixtures
  sintéticos aislados** que no se conectan a ningún sistema real.

Además:

- El destino de una credencial es **desconocido hasta verificarlo**. Que
  existan credenciales no demuestra que apunten a producción ni a otro
  entorno. No se usan sin esa verificación, y verificarlas es tarea de
  Fabricio.
- Un script no es seguro por su nombre. Antes de ejecutar cualquiera, se lee
  qué hace, incluidos los scripts a los que llama.
- Si hace falta un diagnóstico en producción, Claude prepara el comando exacto
  y Fabricio lo ejecuta en su propio terminal.
- Si un permiso está denegado en la configuración, un «sí» en la conversación
  no lo levanta. Cambiar un control es un cambio de configuración que hace o
  aprueba Fabricio y que queda registrado. Un agente nunca desactiva ni rodea
  un control.

## 7. Migraciones: estrategia de recuperación

Toda migración convierte la tarea en grande o sensible. Su especificación
incluye, para cada archivo:

- **Estrategia de recuperación justificada:** revertir con SQL cuando sea
  seguro; si no, una migración correctiva hacia delante o una restauración
  desde una copia de seguridad comprobada.
- **Efectos irreversibles y posibles pérdidas**, dichos de forma explícita.
  Un rollback con SQL no reconstruye datos borrados.
- **Compatibilidad del código anterior con el esquema nuevo**, o la
  estrategia aprobada si no la hay (ver §8: si falla el health check, vuelve
  el build anterior pero el esquema ya es el nuevo).
- **Transacción:** el runner ejecuta cada archivo sin envolverlo en una
  transacción y lo registra en una instrucción aparte. Una migración que falla
  a mitad puede quedar aplicada en parte y se volverá a intentar en el
  siguiente despliegue. Se decide y se anota si el archivo lleva su propio
  `BEGIN`/`COMMIT` y si es idempotente.
- [scripts/lint-migrations.py](../../scripts/lint-migrations.py) en verde
  (también lo pasa la CI). Nunca credenciales en una migración.
- El aviso de que **fusionar el PR equivale a una posible aplicación en
  producción**.

## 8. Despliegue e infraestructura

Lo que describe el script versionado
[scripts/vps-autodeploy.sh](../../scripts/vps-autodeploy.sh) (la copia que de
verdad se ejecuta en el VPS y su cron **no se han comprobado**):

- Un cron cada minuto sincroniza el VPS con GitHub en los dos sentidos: lo que
  se edita en el checkout del VPS se commitea y se sube a `main`.
- Si `main` tiene algo nuevo: build → migraciones → cambio de versión →
  health check → si la app no responde, vuelve al build anterior.
- Si el VPS y GitHub cambian las mismas líneas, producción se queda con lo del
  VPS y lo nuevo de GitHub no se despliega hasta que una persona lo resuelva.

Consecuencias para este flujo:

- **Un merge a `main` se trata como posible despliegue y posible aplicación de
  migraciones**, aunque el cambio sea solo documentación. Puede desplegar
  también commits de otras personas que estén en `main` y aún no se hayan
  desplegado.
- **Volver al build anterior no deshace los cambios en la base de datos.**
- La CI informa en el PR, pero según el script el despliegue no espera a que
  esté en verde.
- Nunca se edita el checkout del VPS: lo que se edita allí acaba en `main` sin
  PR.
- `main` no tiene protección de rama. `.github/CODEOWNERS` sirve para pedir
  revisión, pero no la impone sin esa protección.

Notas operativas detalladas (stack propio en el VPS, trampas del build,
correo, integraciones…): [CLAUDE.md](../../CLAUDE.md), leído con el orden de
prioridad de §3.

## 9. Verificación

La verificación es proporcional al cambio: se eligen las comprobaciones que
pueden detectar problemas reales en lo que se ha tocado, no las máximas
posibles. La CI del PR ([.github/workflows/ci.yml](../../.github/workflows/ci.yml))
es obligatoria y no se debilita para que pase.

Cada comprobación se clasifica por lo que de verdad ejecuta:

| Comprobación | Qué ejecuta |
| --- | --- |
| `python3 scripts/lint-migrations.py` | Offline: solo lee archivos del repo. |
| `npx tsc --noEmit` | Local; necesita `node_modules` instalado. |
| `npm run test:particulares`, `test:idealista`, `test:lead-merge`, `test:zinto-v2` | La CI los describe como offline; revisar sus imports antes de ejecutarlos. |
| `npm run build` con variables ficticias | **Puede usar la red** durante el prerender, aunque las variables sean ficticias. |
| `npm ci` | **Instalación:** descarga paquetes y puede ejecutar scripts de instalación. Solo si el plan lo nombra. |
| `git fetch` | Red (lectura de GitHub); actualiza las referencias remotas locales. |

Preparación del espacio de trabajo (cuando el plan la incluye):

1. `git fetch origin` y fijar el SHA de `origin/main`, comprobado con
   `git ls-remote origin refs/heads/main`. Ese SHA es la base de la tarea y
   del diff que se revisa.
2. `git worktree add -b <rama> <ruta fuera de .claude/worktrees> <SHA>`, sin
   tocar el `main` local, el stash ni otras ramas.
3. Si la tarea necesita dependencias: Node 22 como la CI y `npm ci`, ambos
   nombrados en el plan como instalaciones.
4. No se copian archivos `.env`.
5. Si `origin/main` avanza antes del PR: sin solapamiento con los archivos de
   la tarea, se anota el SHA nuevo; con solapamiento, se actualiza la rama
   antes del primer push y se repiten las comprobaciones; si hay conflicto, se
   para y se avisa a Fabricio.

Las interfaces las revisa Fabricio (QA): móvil y escritorio, estados de carga,
error y reconexión. Unas pruebas en verde no sustituyen su aprobación visual.

## 10. Revisión

- La revisión de Codex es **opcional**: solo cuando Fabricio la pide, en
  tareas cuya dificultad lo justifique. Nunca es automática ni obligatoria.
- Cómo se hace: [revision-codex.md](revision-codex.md). Recibe el expediente y
  el diff contra el SHA base, nunca contra el `main` local.
- Claude verifica cada hallazgo en el código antes de darlo por bueno, lo
  resume a Fabricio y **aplica correcciones solo con su OK**.
- Si la revisión no se hizo, el expediente lo dice así; nunca se da por
  superada.
- No se usan funciones que permitan a un revisor modificar código o actuar
  sin supervisión.

## 11. Cierre

1. Verificaciones del plan ejecutadas y anotadas con su comando y su
   resultado.
2. Resultado en el expediente: criterios con su evidencia; lo no demostrado,
   con su motivo y su riesgo.
3. Push de la rama y PR hacia `main` con el propósito, las evidencias y el
   aviso de posible despliegue.
4. CI en verde en el último commit de la rama. Si falla por algo ajeno a la
   tarea, se informa sin tocar código fuera del alcance.
5. **El merge lo hace Fabricio**, cuando él decida.
6. Deshacer un cambio también va por rama y PR (por ejemplo, `git revert` del
   merge) y lo fusiona Fabricio. Nunca con comandos en producción.

## 12. Skills por fase

Se usan las skills ya disponibles a nivel de usuario; no se copian al repo.
Solo se cargan las que la fase necesita.

| Fase | Skill |
| --- | --- |
| Decisiones pendientes | `grilling` |
| Redactar documentos para agentes | `writing-for-agents` |
| Lógica que el plan elija hacer test-first | `tdd` |
| Algo falla o va lento | `diagnosing-bugs` |
| Revisión complementaria | `/code-review`, `/security-review` |
