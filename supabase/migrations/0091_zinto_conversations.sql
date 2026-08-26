-- Create zinto_conversations table
create table if not exists zinto_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id text not null, -- Foreign key to particulares (phone_number or id)
  channel_id int not null default 4, -- Zinto channel ID (WhatsApp)
  phone_number text not null, -- Client's WhatsApp number (E.164 format)
  last_message_at timestamp with time zone,
  last_message text,
  unread_count int default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create index for faster lookups
create index if not exists idx_zinto_conversations_client_id on zinto_conversations(client_id);
create index if not exists idx_zinto_conversations_phone_number on zinto_conversations(phone_number);
create index if not exists idx_zinto_conversations_created_at on zinto_conversations(created_at desc);

-- Prevent duplicate conversations for the same client/phone (race-safe upsert target).
create unique index if not exists uq_zinto_conversations_client_phone
  on zinto_conversations(client_id, phone_number);

-- Atomic unread-count increment (avoids read-modify-write races on inbound bursts).
create or replace function zinto_increment_unread(conv_id uuid)
returns void as $$
  update zinto_conversations
    set unread_count = coalesce(unread_count, 0) + 1,
        updated_at = now()
  where id = conv_id;
$$ language sql;

-- Enable RLS
alter table zinto_conversations enable row level security;

-- RLS policies (admins only can access conversations)
drop policy if exists "Admins can view all conversations" on zinto_conversations;
drop policy if exists "Admins can insert conversations" on zinto_conversations;
drop policy if exists "Admins can update conversations" on zinto_conversations;

create policy "Admins can view all conversations" on zinto_conversations
  for select using (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Admins can insert conversations" on zinto_conversations
  for insert with check (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Admins can update conversations" on zinto_conversations
  for update using (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
