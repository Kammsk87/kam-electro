create table if not exists public.crypto_strategy_trades (
  id text primary key,
  client_id text,
  session_id text,
  user_login text,
  asset text,
  timeframe text,
  side text,
  status text,
  opened_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  pnl numeric default 0,
  trade jsonb not null
);

create index if not exists crypto_strategy_trades_updated_at_idx
  on public.crypto_strategy_trades (updated_at desc);

create index if not exists crypto_strategy_trades_asset_timeframe_idx
  on public.crypto_strategy_trades (asset, timeframe, side);

alter table public.crypto_strategy_trades
  add column if not exists user_login text;

create index if not exists crypto_strategy_trades_user_login_idx
  on public.crypto_strategy_trades (user_login);

create table if not exists public.crypto_strategy_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists crypto_strategy_settings_updated_at_idx
  on public.crypto_strategy_settings (updated_at desc);

alter table public.crypto_strategy_trades enable row level security;
alter table public.crypto_strategy_settings enable row level security;

create policy "Allow shared journal read"
  on public.crypto_strategy_trades
  for select
  using (true);

create policy "Allow shared journal insert"
  on public.crypto_strategy_trades
  for insert
  with check (true);

create policy "Allow shared journal update"
  on public.crypto_strategy_trades
  for update
  using (true)
  with check (true);

create policy "Allow shared settings read"
  on public.crypto_strategy_settings
  for select
  using (true);

create policy "Allow shared settings insert"
  on public.crypto_strategy_settings
  for insert
  with check (true);

create policy "Allow shared settings update"
  on public.crypto_strategy_settings
  for update
  using (true)
  with check (true);
