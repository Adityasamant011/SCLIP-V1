-- Apply once in Supabase SQL Editor. Only service_role can mutate billing.
create table public.sclip_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'none' check (plan in ('none','byok','managed')),
  paid_until timestamptz,
  blocked boolean not null default false
);
create table public.sclip_credit_periods (
  invoice_id text primary key,
  user_id uuid not null references public.sclip_accounts(user_id),
  subscription_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  allowance bigint not null check (allowance >= 0),
  spent bigint not null default 0 check (spent >= 0),
  reserved bigint not null default 0 check (reserved >= 0),
  unique(subscription_id, starts_at, ends_at)
);
create table public.sclip_billing_events (
  event_id text primary key,
  recorded_at timestamptz not null default now()
);
create table public.sclip_usage (
  request_id uuid primary key,
  user_id uuid not null references public.sclip_accounts(user_id),
  invoice_id text not null references public.sclip_credit_periods(invoice_id),
  reserved bigint not null check (reserved > 0),
  actual bigint,
  provider_id text,
  state text not null default 'held' check (state in ('held','settled','released')),
  created_at timestamptz not null default now()
);
create index sclip_usage_user_time on public.sclip_usage(user_id, created_at desc);
create table public.sclip_daily_budget (
  day date primary key,
  spent bigint not null default 0,
  reserved bigint not null default 0
);
create table public.sclip_stock_quota (
  user_id uuid not null references public.sclip_accounts(user_id),
  day date not null,
  searches integer not null default 0,
  primary key(user_id, day)
);
create table public.sclip_stock_global (window text primary key, hits integer not null default 0);
alter table public.sclip_accounts enable row level security;
alter table public.sclip_credit_periods enable row level security;
alter table public.sclip_billing_events enable row level security;
alter table public.sclip_usage enable row level security;
alter table public.sclip_daily_budget enable row level security;
alter table public.sclip_stock_quota enable row level security;
alter table public.sclip_stock_global enable row level security;
revoke all on public.sclip_stock_global from anon, authenticated;
grant all on public.sclip_stock_global to service_role;
-- No anonymous/authenticated policies: the gateway authenticates via Auth and
-- selects one verified user. Browser clients cannot grant money or entitlements.
revoke all on public.sclip_accounts, public.sclip_credit_periods,
  public.sclip_billing_events, public.sclip_usage, public.sclip_daily_budget,
  public.sclip_stock_quota from anon, authenticated;
grant all on public.sclip_accounts, public.sclip_credit_periods,
  public.sclip_billing_events, public.sclip_usage, public.sclip_daily_budget,
  public.sclip_stock_quota to service_role;

create function public.sclip_record_payment(p_event text, p_invoice text,
  p_user uuid, p_subscription text, p_plan text, p_start timestamptz,
  p_end timestamptz, p_allowance bigint) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if p_plan not in ('byok','managed') or p_end <= p_start or
     p_allowance <> case when p_plan='managed' then 12000000 else 0 end then
    raise exception 'Invalid paid period';
  end if;
  -- Event claim, period insert, balance and entitlement update are one tx.
  insert into sclip_billing_events(event_id) values(p_event) on conflict do nothing;
  if not found then return; end if;
  perform 1 from sclip_accounts where user_id=p_user for update;
  insert into sclip_credit_periods(invoice_id,user_id,subscription_id,starts_at,ends_at,allowance)
    values(p_invoice,p_user,p_subscription,p_start,p_end,p_allowance)
    on conflict do nothing;
  update sclip_accounts set plan=p_plan, paid_until=p_end,
    stripe_subscription_id=p_subscription
    where user_id=p_user and (paid_until is null or paid_until <= p_end);
end $$;

create function public.sclip_reserve(p_user uuid,p_request uuid,p_amount bigint,p_daily_cap bigint)
returns text language plpgsql security invoker set search_path=public as $$
declare b sclip_credit_periods; a sclip_accounts; d sclip_daily_budget;
begin
  select * into a from sclip_accounts where user_id=p_user for update;
  if a.user_id is null or a.blocked or a.plan<>'managed' or a.paid_until is null or a.paid_until<=now() then raise exception 'Payment required'; end if;
  if p_amount is null or p_daily_cap is null or p_amount<=0 or p_daily_cap<=0 then raise exception 'Managed AI not funded'; end if;
  -- Serialize global daily reservations as well as each account balance.
  insert into sclip_daily_budget(day) values(current_date) on conflict do nothing;
  select * into d from sclip_daily_budget where day=current_date for update;
  if d.spent+d.reserved+p_amount>p_daily_cap then raise exception 'Daily beta limit reached'; end if;
  if (select count(*) from sclip_usage where user_id=p_user and state='held')>=2 or
     (select count(*) from sclip_usage where user_id=p_user and created_at>now()-interval '1 hour')>=120 then
    raise exception 'Request limit reached';
  end if;
  select * into b from sclip_credit_periods where user_id=p_user
    and subscription_id=a.stripe_subscription_id and starts_at<=now() and ends_at>now()
    order by ends_at desc limit 1 for update;
  if b.invoice_id is null or b.allowance-b.spent-b.reserved<p_amount then raise exception 'AI allowance exhausted'; end if;
  insert into sclip_usage(request_id,user_id,invoice_id,reserved) values(p_request,p_user,b.invoice_id,p_amount);
  update sclip_credit_periods set reserved=reserved+p_amount where invoice_id=b.invoice_id;
  update sclip_daily_budget set reserved=reserved+p_amount where day=current_date;
  return b.invoice_id;
end $$;

create function public.sclip_settle(p_request uuid,p_actual bigint,p_provider text default null)
returns void language plpgsql security invoker set search_path=public as $$
declare u sclip_usage;
begin
  -- Match reservation lock ordering: account first, usage next, period/budget.
  perform 1 from sclip_accounts where user_id=(select user_id from sclip_usage where request_id=p_request) for update;
  select * into u from sclip_usage where request_id=p_request for update;
  if u.request_id is null or u.state<>'held' then return; end if;
  if p_actual is null then
    update sclip_usage set provider_id=coalesce(p_provider,provider_id) where request_id=p_request;
    return;
  end if;
  if p_actual<0 then raise exception 'Invalid usage'; end if;
  update sclip_usage set actual=p_actual,provider_id=p_provider,
    state=case when p_actual=0 then 'released' else 'settled' end where request_id=p_request;
  update sclip_credit_periods set reserved=reserved-u.reserved,spent=spent+p_actual where invoice_id=u.invoice_id;
  update sclip_daily_budget set reserved=reserved-u.reserved,spent=spent+p_actual where day=(u.created_at at time zone 'UTC')::date;
  if p_actual>u.reserved then update sclip_accounts set blocked=true where user_id=u.user_id; end if;
end $$;

create function public.sclip_take_stock_quota(p_user uuid,p_provider text) returns void
language plpgsql security invoker set search_path=public as $$
declare n integer; h text; d text; max_day integer;
begin
  if p_provider not in ('pexels','pixabay') then raise exception 'Invalid stock provider'; end if;
  h := p_provider || ':hour:' || to_char(now() at time zone 'UTC','YYYY-MM-DD-HH24');
  d := p_provider || ':day:' || to_char(now() at time zone 'UTC','YYYY-MM-DD');
  max_day := case when p_provider='pexels' then 500 else 2000 end;
  -- 150/hour and 500/day keep a shared Pexels key below default hourly and
  -- monthly quotas, even if every request is a cache miss.
  insert into sclip_stock_global(window,hits) values(h,1)
    on conflict(window) do update set hits=sclip_stock_global.hits+1 returning hits into n;
  if n>150 then raise exception 'Shared stock hourly limit'; end if;
  insert into sclip_stock_global(window,hits) values(d,1)
    on conflict(window) do update set hits=sclip_stock_global.hits+1 returning hits into n;
  if n>max_day then raise exception 'Shared stock daily limit'; end if;
  insert into sclip_stock_quota(user_id,day,searches) values(p_user,current_date,1)
    on conflict(user_id,day) do update set searches=sclip_stock_quota.searches+1 returning searches into n;
  if n>40 then raise exception 'Daily stock search limit reached'; end if;
end $$;

revoke execute on function public.sclip_record_payment(text,text,uuid,text,text,timestamptz,timestamptz,bigint),
  public.sclip_reserve(uuid,uuid,bigint,bigint),public.sclip_settle(uuid,bigint,text),public.sclip_take_stock_quota(uuid,text)
  from public,anon,authenticated;
grant execute on function public.sclip_record_payment(text,text,uuid,text,text,timestamptz,timestamptz,bigint),
  public.sclip_reserve(uuid,uuid,bigint,bigint),public.sclip_settle(uuid,bigint,text),public.sclip_take_stock_quota(uuid,text)
  to service_role;
