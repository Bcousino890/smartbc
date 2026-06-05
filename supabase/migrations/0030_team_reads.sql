-- Tracks when each user last read a team direct conversation.
-- Used to calculate unread message counts per user per conversation.
CREATE TABLE IF NOT EXISTS team_conversation_reads (
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES team_direct_conversations(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS team_conversation_reads_user_idx
  ON team_conversation_reads(user_id);
