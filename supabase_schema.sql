-- Enable RLS
-- Run this in Supabase SQL Editor

-- Subscriptions
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  amount numeric not null,
  start_date date not null,
  billing_cycle text not null,
  category text not null,
  autopay text default 'OFF',
  payment_method text default 'card',
  created_at timestamptz default now()
);
alter table subscriptions enable row level security;
create policy "Users manage own subscriptions" on subscriptions
  for all using (auth.uid() = user_id);

-- Categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  icon text not null,
  created_at timestamptz default now()
);
alter table categories enable row level security;
create policy "Users manage own categories" on categories
  for all using (auth.uid() = user_id);

-- User Settings
create table if not exists user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  full_name text,
  currency text default '₹',
  monthly_budget numeric default 5000,
  notifications boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table user_settings enable row level security;
create policy "Users manage own settings" on user_settings
  for all using (auth.uid() = user_id);

-- Payment History
create table if not exists payment_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  subscription_id uuid references subscriptions(id) on delete set null,
  subscription_name text not null,
  amount numeric not null,
  payment_method text not null,
  status text default 'completed',
  created_at timestamptz default now()
);
alter table payment_history enable row level security;
create policy "Users manage own payment history" on payment_history
  for all using (auth.uid() = user_id);

-- Notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  title text not null,
  message text not null,
  read boolean default false,
  snoozed boolean default false,
  snooze_until timestamptz,
  subscription_id uuid,
  renewal_date date,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
create policy "Users manage own notifications" on notifications
  for all using (auth.uid() = user_id);
