-- Shared rate-limit counters for the folia-analyze edge function.
-- Keys are salted SHA-256 hashes of client addresses (never raw IPs) or a
-- per-day global key. Rows older than two days are deleted on each call.

create table if not exists public.folia_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

-- No policies: only the service role, which bypasses RLS, can touch the table.
alter table public.folia_rate_limits enable row level security;

create or replace function public.folia_rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window interval := make_interval(secs => p_window_seconds);
  v_row public.folia_rate_limits%rowtype;
begin
  insert into public.folia_rate_limits as r (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set window_start = case when r.window_start <= v_now - v_window then v_now else r.window_start end,
        count = case when r.window_start <= v_now - v_window then 1 else r.count + 1 end
  returning * into v_row;

  allowed := v_row.count <= p_limit;
  retry_after := greatest(1, ceil(extract(epoch from (v_row.window_start + v_window - v_now)))::integer);

  delete from public.folia_rate_limits where window_start < v_now - interval '2 days';
  return next;
end;
$$;

revoke all on function public.folia_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.folia_rate_limit_hit(text, integer, integer) to service_role;
