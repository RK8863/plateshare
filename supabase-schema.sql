create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('donor', 'receiver')),
  created_at timestamptz not null default now()
);

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
  donor_id uuid references public.profiles(id) on delete set null,
  claimed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.offers add column if not exists donor_id uuid references public.profiles(id) on delete set null;
alter table public.offers add column if not exists claimed_by uuid references public.profiles(id) on delete set null;

alter table public.profiles enable row level security;
alter table public.offers enable row level security;

drop policy if exists "Anyone can read profiles" on public.profiles;
create policy "Anyone can read profiles"
  on public.profiles for select
  using (true);

drop policy if exists "Users can create their profile" on public.profiles;
create policy "Users can create their profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Anyone can read offers" on public.offers;
drop policy if exists "Anyone can create offers" on public.offers;
drop policy if exists "Anyone can update offer status" on public.offers;
drop policy if exists "Anyone can remove offers" on public.offers;
drop policy if exists "Anyone can read active offers" on public.offers;
drop policy if exists "Donors can create offers" on public.offers;
drop policy if exists "Receivers can claim open offers" on public.offers;
drop policy if exists "Donors can complete their offers" on public.offers;
drop policy if exists "Donors can remove their offers" on public.offers;

create policy "Anyone can read active offers"
  on public.offers for select
  using (true);

create policy "Donors can create offers"
  on public.offers for insert
  with check (
    auth.uid() = donor_id
    and status = 'available'
    and claimed_by is null
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'donor'
    )
  );

create policy "Receivers can claim open offers"
  on public.offers for update
  using (
    status = 'available'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'receiver'
    )
  )
  with check (
    status = 'claimed'
    and claimed_by = auth.uid()
  );

create policy "Donors can complete their offers"
  on public.offers for update
  using (donor_id = auth.uid())
  with check (
    donor_id = auth.uid()
    and status in ('available', 'claimed', 'delivered')
  );

create policy "Donors can remove their offers"
  on public.offers for delete
  using (donor_id = auth.uid());

create or replace function public.protect_offer_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.donor_id is distinct from new.donor_id then
    raise exception 'donor_id cannot be changed';
  end if;

  if old.claimed_by is distinct from new.claimed_by
    and not (
      old.claimed_by is null
      and old.status = 'available'
      and new.status = 'claimed'
      and new.claimed_by = auth.uid()
      and exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'receiver'
      )
    )
  then
    raise exception 'claimed_by can only be set by the receiver claiming an open offer';
  end if;

  if old.status = 'available' and new.status = 'claimed' and new.claimed_by is null then
    raise exception 'claimed offers must record a receiver';
  end if;

  if old.status = 'delivered' and new.status is distinct from old.status then
    raise exception 'delivered offers cannot be reopened';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_offer_ownership_before_update on public.offers;
create trigger protect_offer_ownership_before_update
  before update on public.offers
  for each row
  execute function public.protect_offer_ownership();

do $$
begin
  alter publication supabase_realtime add table public.offers;
exception
  when duplicate_object then null;
end $$;
