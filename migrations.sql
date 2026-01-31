-- =========================================================
-- HarvestDex — Migration (Supabase / Postgres)
-- Aligné sur ton schéma (subcategories bigserial + farms + partner + season)
-- =========================================================

-- 4) SAISONS
create table if not exists public.seasons (
  id text primary key,
  label text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_seasons_active on public.seasons(is_active);

insert into public.seasons(id, label, is_active)
values ('25-26', 'Harvest 25-26', true)
on conflict (id) do nothing;

-- 5) SOUS-CATEGORIES
create table if not exists public.subcategories (
  id bigserial primary key,
  type text not null check (type in ('hash','weed','extraction','wpff')),
  label text not null,
  sort int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (type, label)
);

create index if not exists idx_subcategories_type on public.subcategories(type);
create index if not exists idx_subcategories_active on public.subcategories(is_active);
create index if not exists idx_subcategories_sort on public.subcategories(sort);

-- 6) LIENS cards : season + subcategory_id
alter table public.cards
add column if not exists season text;

alter table public.cards
add column if not exists subcategory_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cards_subcategory_fk'
  ) then
    alter table public.cards
    add constraint cards_subcategory_fk
    foreign key (subcategory_id)
    references public.subcategories(id)
    on delete set null;
  end if;
end $$;

create index if not exists idx_cards_season on public.cards(season);
create index if not exists idx_cards_subcategory_id on public.cards(subcategory_id);

-- 7) SEED: Sous-catégories "base"
insert into public.subcategories(type,label,sort) values
('hash','Dry Sift / Kief',10),
('hash','Static Sift',12),
('hash','Dry Ice Sift',14),
('hash','Bubble Hash / Ice Water Hash',20),
('hash','Full Melt',22),
('hash','Temple Ball',30),
('hash','Piatella',32),
('hash','Charas',40),
('hash','Moroccan',50),
('hash','Afghan',52),
('hash','Rosin',60),
('hash','Live Rosin',62),
('hash','Cured Rosin',64)
on conflict (type,label) do nothing;

insert into public.subcategories(type,label,sort) values
('weed','Indoor',10),
('weed','Greenhouse',20),
('weed','Outdoor / Sun-grown',30),
('weed','Top Shelf',40),
('weed','Mid',50),
('weed','Smalls',60)
on conflict (type,label) do nothing;

insert into public.subcategories(type,label,sort) values
('extraction','Live Resin',10),
('extraction','Cured Resin',12),
('extraction','Distillate',20),
('extraction','Shatter',30),
('extraction','Wax',32),
('extraction','Crumble',34),
('extraction','Budder / Badder',36),
('extraction','Sauce',40),
('extraction','Diamonds',42),
('extraction','CO2 Oil',50),
('extraction','RSO',60),
('extraction','Vape Oil / Cart',70)
on conflict (type,label) do nothing;

insert into public.subcategories(type,label,sort) values
('wpff','WPFF Bubble Hash',10),
('wpff','WPFF Full Melt',20),
('wpff','WPFF Hash Rosin',30)
on conflict (type,label) do nothing;

-- 8) FARMS
create table if not exists public.farms (
  id bigserial primary key,
  name text not null unique,
  country text,
  instagram text,
  website text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_farms_active on public.farms(is_active);
create index if not exists idx_farms_name on public.farms(name);

-- 9) LIEN cards → farm
alter table public.cards
add column if not exists farm_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cards_farm_fk'
  ) then
    alter table public.cards
    add constraint cards_farm_fk
    foreign key (farm_id)
    references public.farms(id)
    on delete set null;
  end if;
end $$;

create index if not exists idx_cards_farm_id on public.cards(farm_id);

-- 10) PARTENAIRE DU MOMENT
alter table public.cards
add column if not exists is_partner boolean not null default false;

alter table public.cards
add column if not exists partner_title text;

create index if not exists idx_cards_is_partner on public.cards(is_partner);
