# <Nombre de la tarea>

<Una frase: qué cambia y para qué.>

- **Tamaño:** medio
- **Responsable:** <Fabricio>
- **Rama:** `<rama>`
- **Estado:** <borrador | especificación aprobada | plan aprobado | implementado | fusionado>

## Especificación

### Contexto

<Por qué se hace. Qué existe hoy, comprobado en el código o en el repo, y qué no se ha podido comprobar.>

### Decisiones

<Una línea por decisión: `D1 (AAAA-MM-DD)`: lo que decidió Fabricio, con sus palabras o un resumen fiel.>

### Alcance

<Lo que entra, como lista concreta.>

### Fuera de alcance

<Lo que no entra, para que nadie lo añada por su cuenta.>

### Criterios de aceptación

<Tabla `AC1`, `AC2`…: cada criterio debe poder observarse o comprobarse.>

### Impacto en datos y despliegue

<Si toca migraciones, datos reales, integraciones externas o el despliegue. Recordar que un merge a `main` puede desplegar y aplicar migraciones. Si no toca nada de esto, decirlo.>

### Aprobación de la especificación

<Fecha y palabras de Fabricio. Esta aprobación permite preparar el plan; no permite implementar.>

## Plan

### Base

<SHA de `origin/main` del que sale la rama, comprobado con `git ls-remote`. No usar el `main` local como base.>

### Tareas

<Por cada tarea: archivos y entradas, acción, verificación con el resultado esperado, criterios que cubre y commit.>

### Pasos de entorno que autoriza el plan

<Comandos exactos de preparación (fetch, worktree, instalaciones si hacen falta) y su efecto. Lo que no esté aquí se pregunta antes de ejecutarlo.>

### Aprobación del plan

<Fecha y palabras de Fabricio. Desde aquí se puede implementar.>

## Resultado

### Commits

<Lista de commits de la rama.>

### Verificaciones

<Cada comprobación con su comando, dónde se ejecutó y su salida o resultado.>

### Criterios de aceptación

<Tabla: criterio | estado (demostrado, fallido, no demostrado) | evidencia.>

### Revisión

<Si Fabricio pidió revisión de Codex: hallazgos y qué se hizo con cada uno. Si no la pidió o la descartó, decirlo así; nunca darla por superada.>

### Pendiente o no demostrado

<Qué queda sin demostrar, por qué y qué riesgo supone. Si no hay nada, decirlo.>

### PR, CI y merge

<Enlace del PR, estado de la CI en el último commit y aviso de que el merge lo hace Fabricio y puede disparar un despliegue.>
