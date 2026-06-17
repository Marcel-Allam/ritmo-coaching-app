create table if not exists public.client_review_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  review_date date not null default current_date,
  client_status text not null default 'on_track',
  main_win text,
  main_issue text,
  decisions_made text,
  client_actions text,
  coach_actions text,
  plan_changes text,
  next_review_date date,
  private_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_review_logs enable row level security;

drop policy if exists "Coaches can manage client review logs" on public.client_review_logs;
create policy "Coaches can manage client review logs"
on public.client_review_logs
for all
using (exists (
  select 1
  from public.profiles
  where profiles.id = auth.uid()
  and profiles.role = 'coach'
))
with check (exists (
  select 1
  from public.profiles
  where profiles.id = auth.uid()
  and profiles.role = 'coach'
));

drop trigger if exists set_client_review_logs_updated_at on public.client_review_logs;
create trigger set_client_review_logs_updated_at
before update on public.client_review_logs
for each row
execute function public.set_updated_at();

create index if not exists idx_client_review_logs_client_date
on public.client_review_logs(client_id, review_date desc);

create index if not exists idx_client_review_logs_next_review
on public.client_review_logs(next_review_date);
