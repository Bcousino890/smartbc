# Reglas del repo — cómo trabajar sin tumbar producción

Producción (`portal.bcousinoprop.com`) se despliega **automáticamente** desde la
rama `main` (el VPS hace `git pull && build && pm2 restart` cada pocos minutos).
Por eso, **cualquier cosa rota que llegue a `main` tumba la web en directo.**

## Regla de oro
**NUNCA se empuja directo a `main`.** Todo cambio entra por **Pull Request**.

## Flujo correcto
1. Crea una rama: `git checkout -b fabri/lo-que-sea`
2. Haz tus cambios y súbelos: `git push origin fabri/lo-que-sea`
3. Abre un **Pull Request** hacia `main`.
4. Espera a que la **CI esté en verde** (✅). Si está en rojo (❌), **el código no
   compila** — arréglalo antes de mergear. La CI revisa TypeScript, el build y
   las migraciones.
5. Cuando esté verde y aprobado, mergea.

## Qué NO hacer (lo que ha tumbado la web)
- ❌ Empujar a `main` sin PR.
- ❌ Mergear con la CI en rojo.
- ❌ Hardcodear bypasses, endpoints sin auth, o "soluciones nucleares" en
  caliente. Si algo no entra, se piensa, no se fuerza.
- ❌ Aplicar migraciones a mano sin avisar (dejan la cola en estado inconsistente).

## Por qué
La CI (`.github/workflows/ci.yml`) caza los errores **antes** de que lleguen a
producción. Con la protección de rama activa, un PR en rojo **no se puede
mergear** — así la web no se cae. El objetivo no es burocracia: es que nadie
pueda romper el sitio en directo por accidente.
