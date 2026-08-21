// Constantes compartidas entre page.tsx (Server Component) y
// particulares-client.tsx ("use client"). Viven en un módulo aparte, sin
// "use client", para que un Server Component pueda importarlas sin cruzar la
// frontera cliente/servidor (mismo patrón que lib/sales-inbox/types.ts).

// Anuncios por página: page.tsx pide exactamente esta cantidad al servidor
// (offset/pageSize de getParticularesPage); el cliente la usa para pintar
// "Página X de Y". Un solo sitio para que nunca diverjan.
export const ANUNCIOS_POR_PAGINA = 60;
