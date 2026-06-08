create table if not exists public.crypto_strategy_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists crypto_strategy_settings_updated_at_idx
  on public.crypto_strategy_settings (updated_at desc);

alter table public.crypto_strategy_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'crypto_strategy_settings'
      and policyname = 'Allow shared settings read'
  ) then
    create policy "Allow shared settings read"
      on public.crypto_strategy_settings
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'crypto_strategy_settings'
      and policyname = 'Allow shared settings insert'
  ) then
    create policy "Allow shared settings insert"
      on public.crypto_strategy_settings
      for insert
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'crypto_strategy_settings'
      and policyname = 'Allow shared settings update'
  ) then
    create policy "Allow shared settings update"
      on public.crypto_strategy_settings
      for update
      using (true)
      with check (true);
  end if;
end $$;
