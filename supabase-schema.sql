create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  food_name text not null,
  portions integer not null check (portions > 0),
  food_type text not null,
  pickup_location text not null,
  available_until time not null,
  contact text not null,
  safety_notes text,
  status text not null default 'available' check (status in ('available', 'claimed', 'delivered')),
  created_at timestamptz not null default now()
);

alter table public.offers enable row level security;

drop policy if exists "Anyone can read offers" on public.offers;
create policy "Anyone can read offers"
  on public.offers for select
  using (true);

drop policy if exists "Anyone can create offers" on public.offers;
create policy "Anyone can create offers"
  on public.offers for insert
  with check (status = 'available');

drop policy if exists "Anyone can update offer status" on public.offers;
create policy "Anyone can update offer status"
  on public.offers for update
  using (true)
  with check (status in ('available', 'claimed', 'delivered'));

drop policy if exists "Anyone can remove offers" on public.offers;
create policy "Anyone can remove offers"
  on public.offers for delete
  using (true);

do $$
begin
  alter publication supabase_realtime add table public.offers;
exception
  when duplicate_object then null;
end $$;
