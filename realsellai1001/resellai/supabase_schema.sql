-- ResellAI Supabase Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users profile table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  stripe_customer_id text unique,
  subscription_status text default 'free', -- 'free', 'basic', 'premium'
  subscription_id text,
  plan text default 'free', -- 'free', 'basic', 'premium'
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Saved flips
create table public.saved_flips (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  item_id text not null,
  title text not null,
  image_url text,
  source_price numeric(10,2),
  current_price numeric(10,2),
  platform text,
  profit_margin numeric(5,2),
  url text,
  saved_at timestamptz default now()
);

-- Trend alerts
create table public.trend_alerts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  keyword text not null,
  category text,
  alert_threshold numeric(5,2) default 20,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Weekly flip reports (admin-generated)
create table public.weekly_reports (
  id uuid default uuid_generate_v4() primary key,
  week_of date not null,
  items jsonb not null,
  published boolean default false,
  created_at timestamptz default now()
);

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.saved_flips enable row level security;
alter table public.trend_alerts enable row level security;
alter table public.weekly_reports enable row level security;

-- Profiles: users can only see/edit their own
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Saved flips: users manage their own
create policy "Users can view own saved flips" on public.saved_flips
  for select using (auth.uid() = user_id);
create policy "Users can insert own saved flips" on public.saved_flips
  for insert with check (auth.uid() = user_id);
create policy "Users can delete own saved flips" on public.saved_flips
  for delete using (auth.uid() = user_id);

-- Trend alerts: users manage their own
create policy "Users can manage own alerts" on public.trend_alerts
  for all using (auth.uid() = user_id);

-- Weekly reports: everyone can read published ones
create policy "Anyone can view published reports" on public.weekly_reports
  for select using (published = true);

-- Function to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger on auth.users insert
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Update timestamp function
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();
