-- Estados «Alquilada» y «No disponible» de la propiedad, para que coincidan con
-- las etiquetas ALQUILADO / NO DISPONIBLE (ver lib/properties/reserved-sync.ts).
-- Fuera de la web pública y de los catálogos igual que «sold»: esos filtros
-- listan solo available/reserved. Los valores de un enum no se pueden quitar.
ALTER TYPE property_status ADD VALUE IF NOT EXISTS 'rented';
ALTER TYPE property_status ADD VALUE IF NOT EXISTS 'unavailable';
