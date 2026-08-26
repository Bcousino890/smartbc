-- Las fichas de Idealista de este negocio se manejan casi todas como
-- "inspo" con reference_code (BC-xxxx) pero SIN fila en properties
-- (property_id queda null). El matching de leads contra properties.id
-- (matched_property_id) nunca puede alcanzarlas, así que se agrega un
-- segundo match directo contra idealista_listings, que sí tiene su propia
-- dirección/precio (address_street, address_city, price/total_rental_price).
ALTER TABLE idealista_leads
  ADD COLUMN IF NOT EXISTS matched_listing_id uuid REFERENCES idealista_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idealista_leads_matched_listing_id_idx
  ON idealista_leads (matched_listing_id);

NOTIFY pgrst, 'reload schema';
