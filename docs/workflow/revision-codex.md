# Revisión de Codex en solo lectura

Guía para las revisiones de Codex dentro del
[flujo voluntario de Fabricio](README.md). Es una guía para cuando haga falta,
no un paso obligatorio.

## 1. Cuándo

- **Solo cuando Fabricio la pide** para una tarea concreta, normalmente una
  tarea difícil. Nunca es automática ni obligatoria, en ningún tamaño.
- Si Fabricio la descarta, el expediente lo anota como omitida por su
  decisión; nunca como hecha o superada.

## 2. Qué se revisa

- El expediente de la tarea (`docs/changes/<carpeta>/`) y el diff de la rama:
  `git diff <SHA_BASE>...HEAD`.
- `<SHA_BASE>` es el SHA de `origin/main` anotado en el expediente al preparar
  el worktree. **Nunca se usa el nombre `main` local como base**: puede estar
  desactualizado y el diff incluiría cambios ajenos a la tarea.
- Si la rama se actualizó sobre un `origin/main` más nuevo, la base es el SHA
  nuevo anotado en el expediente.

## 3. Cómo le llegan las instrucciones

Codex no carga este archivo por sí solo, y en la raíz del repo no hay un
`AGENTS.md` con su papel. Por eso las instrucciones se le pasan **en la propia
orden**: este archivo y el expediente van por stdin, y la petición concreta va
como argumento. `codex exec` añade lo que recibe por stdin como un bloque
`<stdin>` detrás de la petición.

## 4. Orden

Comprobada con `codex exec --help` en codex-cli 0.157.1. Si cambia la
versión, se vuelve a mirar `--help` antes de usarla.

```sh
cat docs/workflow/revision-codex.md docs/changes/<carpeta>/change.md \
  | codex exec -s read-only --disable multi_agent --ephemeral \
      -C <ruta del worktree> -o <ruta fuera del repo>/codex-<n>.md \
      "You are a read-only second reviewer. Follow the instructions in the <stdin> block (revision-codex.md, then the task record). Review only the changes from git diff <SHA_BASE>...HEAD against the record's acceptance criteria. Do not modify files or run commands that write, use the network, or read credentials. Report findings in Spanish."
```

- `-s read-only`: el sandbox no deja escribir.
- `--disable multi_agent`: Codex no lanza subagentes propios.
- `--ephemeral`: no guarda la sesión en disco.
- `-o`: la respuesta final va a un archivo **fuera del repo**; el autor
  traslada los hallazgos al expediente.
- Para una tarea grande se cambia `change.md` por `spec.md` y `plan.md`.

`codex review --base` solo admite el nombre de una rama, no un SHA, así que no
es la vía por defecto. No se usan funciones de Codex que puedan modificar
código o actuar sin supervisión.

## 5. Límites del revisor

El revisor:

- no crea, modifica ni borra archivos, ni ejecuta operaciones de Git que
  escriban (commit, checkout, switch, stash, reset, merge, push, tag);
- no ejecuta scripts de npm, el build ni nada que use la red;
- no abre `.env*`, `~/.ssh` ni credenciales, y no usa SSH, `psql` ni `docker`;
- no decide cuestiones de producto: si algo depende de una decisión, la
  señala como pregunta para Fabricio.

## 6. En qué se fija en BCP

- Que el cambio cumple los criterios de aceptación del expediente y no se sale
  del alcance.
- **Migraciones:** se aplican al fusionar; estrategia de recuperación,
  compatibilidad del código anterior con el esquema nuevo y transacción (ver
  [README.md](README.md), §7).
- **Permisos:** que se comprueban en el servidor (`is_admin()`, `is_staff()`,
  RLS), no solo en la interfaz.
- **Llamadas externas:** `fetch` sin timeout durante la generación estática o
  en layouts compartidos pueden romper el build de producción.
- **Datos y secretos:** nada de credenciales en código, migraciones o
  documentos; nada de datos privados expuestos.
- **Texto del producto:** que no se cambie ni se traduzca sin que se haya
  pedido.
- **Pruebas:** que las comprobaciones del expediente demuestran de verdad lo
  que dicen.

## 7. Formato de los hallazgos

Por cada hallazgo:

- archivo y línea;
- qué problema hay y por qué importa;
- **confirmado** o **sospecha**, con su nivel de confianza;
- qué cambio sugiere.

Primero los confirmados, ordenados por gravedad; después las sospechas. Si no
encuentra nada, lo dice.

## 8. Después de la revisión

1. El autor compara `git status --porcelain` y `git rev-parse HEAD` antes y
   después: deben ser iguales.
2. Claude verifica cada hallazgo en el código antes de darlo por bueno.
3. Claude resume a Fabricio los hallazgos verificados y **solo aplica las
   correcciones que él apruebe**.
4. Se repiten las comprobaciones afectadas.
5. Cada hallazgo y lo que se hizo con él quedan en el expediente.
