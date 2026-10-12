# <Nombre de la tarea>: especificación

<Una frase: qué cambia y para qué.>

- **Tamaño:** grande o sensible
- **Responsable:** <Fabricio>
- **Estado:** <borrador | en revisión | aprobada>

## Contexto

<Por qué se hace. Qué existe hoy, comprobado en el código o en el repo, y qué no se ha podido comprobar.>

## Decisiones

<Una línea por decisión: `D1 (AAAA-MM-DD)`: lo que decidió Fabricio, con sus palabras o un resumen fiel.>

## Alcance

<Lo que entra, como lista concreta.>

## Fuera de alcance

<Lo que no entra.>

## Invariantes

<Lo que tiene que seguir siendo cierto pase lo que pase: permisos, identidad de los datos, coherencia ante fallos.>

## Datos e impacto

<Tablas, columnas, integraciones externas y despliegue afectados. Origen, transformación y verificación de los datos. Recordar que un merge a `main` puede desplegar y aplicar migraciones.>

## Recuperación de migraciones

<Solo si hay migraciones. Para cada una: estrategia justificada (revertir con SQL si es seguro; si no, migración correctiva o restauración desde una copia comprobada), efectos irreversibles, compatibilidad del código anterior con el esquema nuevo y si el archivo va en una transacción propia. Si no hay migraciones, decirlo.>

## Criterios de aceptación

<Tabla `AC1`, `AC2`…: cada criterio debe poder observarse o comprobarse.>

## Preguntas abiertas

<Lo que falta decidir antes de aprobar. Si no queda nada, decirlo.>

## Aprobación

<Fecha y palabras de Fabricio. Esta aprobación permite preparar el plan; no permite implementar.>
