export type Property = {
  id: string;
  ref: string;
  title: string;
  zone: string;
  city: string;
  country: "España" | "Chile";
  price: string;
  priceNum: number;
  operation: "Venta" | "Alquiler";
  type: "Apartamento" | "Penthouse" | "Casa / Villa";
  badge?: string;
  beds: number;
  baths: number;
  sqm: number;
  cert?: string;
  cover: string;
  gallery: string[];
  videos?: Array<{ url: string; title: string }>;
  description: string;
  features: string[];
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  office: "Madrid" | "Santiago";
  phone: string;
};

export const properties: Property[] = [
  {
    id: "villa-zapallar",
    ref: "BC-CL-0124",
    title: "Villa Frente al Mar",
    zone: "Zapallar",
    city: "Valparaíso",
    country: "Chile",
    price: "USD 4.850.000",
    priceNum: 4850000,
    operation: "Venta",
    type: "Casa / Villa",
    badge: "Exclusiva",
    beds: 6,
    baths: 7,
    sqm: 820,
    cert: "A",
    cover: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1600&q=80&auto=format&fit=crop",
    ],
    description: "Residencia frente al océano en uno de los enclaves más exclusivos del litoral chileno. Arquitectura contemporánea, piscina infinita y acceso privado a la playa. Diseñada por un estudio premiado, integra materiales nobles —piedra de Pelequén, roble americano y bronce envejecido— con vistas panorámicas al Pacífico.",
    features: ["Piscina infinita", "Acceso playa privado", "Domótica integral", "Bodega climatizada", "Suite principal con vestidor", "Estacionamiento 4 vehículos", "Quincho con horno de barro", "Jardín 2.400 m²"],
    address: "Camino Costero s/n",
    office: "Santiago",
    phone: "+56 9 61791938",
  },
  {
    id: "penthouse-serrano",
    ref: "BC-ES-0218",
    title: "Penthouse Calle Serrano",
    zone: "Barrio Salamanca",
    city: "Madrid",
    country: "España",
    price: "€ 6.200.000",
    priceNum: 6200000,
    operation: "Venta",
    type: "Penthouse",
    badge: "Milla de Oro",
    beds: 4,
    baths: 5,
    sqm: 410,
    cert: "B",
    cover: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?w=1600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&q=80&auto=format&fit=crop",
    ],
    description: "Ático de dos plantas en el corazón de la Milla de Oro madrileña. Terrazas perimetrales con vistas a los tejados del Retiro, piscina privada y materiales de altísima calidad. Edificio histórico rehabilitado con portero y seguridad 24 horas.",
    features: ["Terraza 180 m²", "Piscina privada", "Portero 24h", "Garaje doble", "Climatización por suelo radiante", "Cocina Bulthaup", "Cerramientos Climalit", "Trastero"],
    address: "Calle Serrano",
    office: "Madrid",
    phone: "+34 694 209 763",
  },
  {
    id: "villa-marbella",
    ref: "BC-ES-0307",
    title: "Villa Mediterránea",
    zone: "Marbella Golden Mile",
    city: "Málaga",
    country: "España",
    price: "€ 9.500.000",
    priceNum: 9500000,
    operation: "Venta",
    type: "Casa / Villa",
    badge: "Frente al Mar",
    beds: 7,
    baths: 8,
    sqm: 1150,
    cert: "A",
    cover: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600573472556-e636c2acda88?w=1600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600585154363-67eb9e2e2099?w=1600&q=80&auto=format&fit=crop",
    ],
    description: "Villa contemporánea de líneas puras en primera línea de la Milla de Oro de Marbella. Diseño arquitectónico premiado, spa privado, gimnasio y acceso directo a la playa. Vistas al Mediterráneo y a La Concha.",
    features: ["Acceso directo a playa", "Spa y gimnasio", "Cine privado", "Piscina climatizada", "Servicio de personal", "Domótica Crestron", "Sistema seguridad perimetral", "9 plazas garaje"],
    address: "Boulevard Príncipe Alfonso",
    office: "Madrid",
    phone: "+34 694 209 763",
  },
  {
    id: "apt-vitacura",
    ref: "BC-CL-0455",
    title: "Apartamento Alonso de Córdova",
    zone: "Vitacura",
    city: "Santiago",
    country: "Chile",
    price: "USD 1.380.000",
    priceNum: 1380000,
    operation: "Venta",
    type: "Apartamento",
    beds: 3,
    baths: 3,
    sqm: 215,
    cert: "B",
    cover: "https://images.unsplash.com/photo-1600210492493-0946911123ea?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=1600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600585152915-d208bec867a1?w=1600&q=80&auto=format&fit=crop",
    ],
    description: "Apartamento de líneas elegantes en el barrio comercial más exclusivo de Santiago. Terraza con vistas a la cordillera, dos estacionamientos y bodega. Edificio boutique con piscina, gimnasio y sala de eventos.",
    features: ["Vista cordillera", "Terraza 35 m²", "2 estacionamientos", "Bodega", "Piscina edificio", "Gimnasio", "Conserje 24h"],
    address: "Av. Alonso de Córdova",
    office: "Santiago",
    phone: "+56 9 61791938",
  },
  {
    id: "casa-pozuelo",
    ref: "BC-ES-0512",
    title: "Casa Familiar La Finca",
    zone: "Pozuelo de Alarcón",
    city: "Madrid",
    country: "España",
    price: "€ 3.400.000",
    priceNum: 3400000,
    operation: "Venta",
    type: "Casa / Villa",
    beds: 6,
    baths: 6,
    sqm: 720,
    cert: "A",
    cover: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?w=1600&q=80&auto=format&fit=crop",
    ],
    description: "Chalet independiente en urbanización privada de máxima seguridad. Parcela de 2.000 m² con jardín maduro, piscina y pista de pádel. Ideal para familias internacionales.",
    features: ["Parcela 2.000 m²", "Piscina", "Pista pádel", "Casa invitados", "Garaje 3 vehículos", "Seguridad urbanización 24h"],
    address: "Urbanización La Finca",
    office: "Madrid",
    phone: "+34 694 209 763",
  },
  {
    id: "penthouse-cachagua",
    ref: "BC-CL-0623",
    title: "Penthouse Cachagua",
    zone: "Cachagua",
    city: "Valparaíso",
    country: "Chile",
    price: "USD 2.100.000",
    priceNum: 2100000,
    operation: "Alquiler",
    type: "Penthouse",
    badge: "Temporada",
    beds: 4,
    baths: 4,
    sqm: 320,
    cover: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&q=80&auto=format&fit=crop",
    ],
    description: "Penthouse con vistas al océano, a pocos pasos de la playa de Cachagua. Tres terrazas, jacuzzi exterior y materiales nobles. Disponible por temporada de verano.",
    features: ["Vista mar", "Jacuzzi exterior", "3 terrazas", "Chimenea", "Estacionamiento techado"],
    address: "Av. del Mar s/n",
    office: "Santiago",
    phone: "+56 9 61791938",
  },
];

export const featuredProperties = properties.slice(0, 4);

export function getProperty(id: string) {
  return properties.find((p) => p.id === id);
}
