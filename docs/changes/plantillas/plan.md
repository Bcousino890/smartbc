# <Nombre de la tarea>: plan

<Enlace a `spec.md` y fecha de su aprobación.>

- **Rama:** `<rama>`
- **Estado:** <borrador | en revisión | aprobado>

## Base

<SHA de `origin/main` del que sale la rama, comprobado con `git ls-remote`. No usar el `main` local como base. Qué hacer si `main` avanza antes del PR.>

## Pasos de entorno que autoriza el plan

<Comandos exactos de preparación (fetch, worktree, instalaciones si hacen falta) y su efecto. Lo que no esté aquí se pregunta antes de ejecutarlo.>

## Tareas

<Por cada tarea, en orden:>

### T1. <Nombre>

- **Entradas:** <archivos y tareas previas de las que depende>
- **Acción:** <qué se hace, concreto>
- **Verificación:** <comando o revisión y resultado esperado>
- **Cubre:** <criterios de aceptación>
- **Commit:** <mensaje, o «sin commit»>

## Verificación final

<Comprobaciones de cierre proporcionales al cambio. La CI del PR es obligatoria.>

## Riesgos y suposiciones

<Lo que no se ha podido comprobar y qué se hace si resulta falso.>

## Aprobación

<Fecha y palabras de Fabricio. Desde aquí se puede implementar.>
