-- Feature 2: role storage. Google OAuth carries no role info, so a role is
-- claimed once at signup and stored here.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('applicant', 'lender')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "individuals can view own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "individuals can claim own profile once"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);
