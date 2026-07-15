-- Create zinto_messages table
create table if not exists zinto_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references zinto_conversations(id) on delete cascade,
  from_number text not null,
  to_number text not null,
  message_text text not null,
  type text not null check (type in ('sent', 'received')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  zinto_message_id text, -- ID returned by Zinto API (for sent messages)
  channel_id int not null default 4, -- Zinto channel ID
  timestamp_sent timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create indexes for faster queries
create index if not exists idx_zinto_messages_conversation_id on zinto_messages(conversation_id);
create index if not exists idx_zinto_messages_created_at on zinto_messages(created_at desc);
create index if not exists idx_zinto_messages_status on zinto_messages(status);
create index if not exists idx_zinto_messages_zinto_id on zinto_messages(zinto_message_id);

-- Enable RLS
alter table zinto_messages enable row level security;

-- RLS policies (admins only can access messages)
create policy "Admins can view all messages" on zinto_messages
  for select using (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Admins can insert messages" on zinto_messages
  for insert with check (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Admins can update messages" on zinto_messages
  for update using (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
