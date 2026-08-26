-- Campo explícito venta/alquiler para idealista_listings.
-- Antes se inferia de si totalRentalPrice tenía valor, pero eso fallaba
-- para fichas de alquiler que solo llenan el campo "Precio (€)".
ALTER TABLE idealista_listings
  ADD COLUMN IF NOT EXISTS operation text DEFAULT 'rent' CHECK (operation IN ('sale', 'rent'));
