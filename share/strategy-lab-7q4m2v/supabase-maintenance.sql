-- Botalin Supabase maintenance and diagnostics
-- Run this in Supabase SQL Editor when REST API returns 522/timeouts.

create index if not exists crypto_strategy_trades_user_updated_idx
  on public.crypto_strategy_trades (user_login, updated_at desc);

create index if not exists crypto_strategy_trades_status_updated_idx
  on public.crypto_strategy_trades (status, updated_at desc);

create index if not exists crypto_strategy_trades_server_updated_idx
  on public.crypto_strategy_trades (updated_at desc)
  where user_login = 'server';

create index if not exists crypto_strategy_trades_active_updated_idx
  on public.crypto_strategy_trades (updated_at desc)
  where status in ('pending', 'open', 'partial');

create index if not exists crypto_strategy_trades_opened_at_idx
  on public.crypto_strategy_trades (opened_at desc);

analyze public.crypto_strategy_trades;
analyze public.crypto_strategy_settings;

select
  count(*) as total_trades,
  count(*) filter (where user_login = 'server') as server_trades,
  count(*) filter (where status in ('pending', 'open', 'partial')) as active_trades,
  max(updated_at) as last_update_at,
  pg_size_pretty(pg_total_relation_size('public.crypto_strategy_trades')) as trades_table_size;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'crypto_strategy_trades'
order by indexname;

select
  user_login,
  status,
  count(*) as trades,
  max(updated_at) as last_update_at
from public.crypto_strategy_trades
group by user_login, status
order by last_update_at desc nulls last;
