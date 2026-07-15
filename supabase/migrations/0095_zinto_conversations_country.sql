-- Add country support to zinto_conversations to separate Spain and Chile chats
-- Spain uses channel #4, Chile uses channel #50

ALTER TABLE zinto_conversations
ADD COLUMN country text NOT NULL DEFAULT 'es'
CHECK (country IN ('es', 'cl'));

-- Create index for faster filtering by country
CREATE INDEX idx_zinto_conversations_country
ON zinto_conversations(country, last_message_at DESC NULLS LAST);

-- Update zinto_config to store channel IDs per country
ALTER TABLE zinto_config
ADD COLUMN channel_id_es integer DEFAULT 4;

ALTER TABLE zinto_config
ADD COLUMN channel_id_cl integer DEFAULT 50;

-- Keep existing channel_id as default for backwards compatibility (use Spain's)
-- New code should use country-specific channel IDs
