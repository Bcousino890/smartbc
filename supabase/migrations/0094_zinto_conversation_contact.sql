-- Enrich Zinto conversations with the lead's contact info so the WhatsApp
-- inbox can show the client's name + a compact "ficha" instead of a raw number.
alter table zinto_conversations add column if not exists contact_name text;
alter table zinto_conversations add column if not exists contact_message text;
alter table zinto_conversations add column if not exists property_title text;
alter table zinto_conversations add column if not exists lead_id text;
