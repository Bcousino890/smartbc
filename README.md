# SmartBC

CRM privado para **Benjamín Cousiño Propiedades**.

Plataforma cerrada que combina:

- **Portal cliente** — acceso privado donde cada cliente ve únicamente las propiedades filtradas según su perfil (zona, presupuesto, tipo de estancia, etc.), guarda favoritos y solicita visitas.
- **Dashboard admin** — gestión de clientes, propiedades, agencias colaboradoras, comisiones, filtros personalizados y seguimiento.

## Stack

- [Next.js 15](https://nextjs.org/) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) con paleta luxury custom
- Tipografías: Cinzel (logo), Playfair Display (títulos), Inter (texto)

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3137](http://localhost:3137). El proyecto está fijado al puerto `3137` para no colisionar con otros desarrollos en local.

## Estructura

```
app/                  # rutas y páginas (App Router)
  login/              # acceso privado clientes/admin
components/           # componentes UI reutilizables
lib/                  # utilidades
public/               # assets estáticos (imágenes, logos)
```
