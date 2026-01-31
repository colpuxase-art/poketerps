-- =========================
-- HarvestDex — Migration (Supabase / Postgres)
-- =========================

-- 1) Subcategories
create table if not exists public.subcategories (
  id text primary key,
  type text not null check (type in ('hash','weed','extraction','wpff')),
  label text not null,
  sort int default 0
);

-- 2) Farms
create table if not exists public.farms (
  id bigserial primary key,
  name text not null,
  country text,
  instagram text,
  website text,
  is_active boolean not null default true
);

-- 3) Cards: add new columns
alter table public.cards
  add column if not exists subcategory_id text references public.subcategories(id),
  add column if not exists farm_id bigint references public.farms(id),
  add column if not exists is_partner boolean not null default false,
  add column if not exists partner_title text;

-- 4) Helpful indexes
create index if not exists cards_subcategory_id_idx on public.cards(subcategory_id);
create index if not exists cards_farm_id_idx on public.cards(farm_id);
create index if not exists cards_is_partner_idx on public.cards(is_partner);

-- 5) Seed subcategories (optional)
-- If you want, copy DEFAULT_SUBCATEGORIES from index.js and insert them here.
