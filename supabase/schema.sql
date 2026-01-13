-- Create a table for Pokus sessions
create table pokus_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  duration_planned int not null default 25,
  duration_actual int,
  status text check (status in ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED')) default 'PLANNED',
  tag text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now()
);

-- Create a table for Tasks (Break mode)
create table tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  is_completed boolean default false,
  created_at timestamptz default now()
);

-- Enable RLS
alter table pokus_sessions enable row level security;
alter table tasks enable row level security;

-- Policies for pokus_sessions
create policy "Users can view their own sessions"
  on pokus_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sessions"
  on pokus_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own sessions"
  on pokus_sessions for update
  using (auth.uid() = user_id);

create policy "Users can delete their own sessions"
  on pokus_sessions for delete
  using (auth.uid() = user_id);

-- Policies for tasks
create policy "Users can view their own tasks"
  on tasks for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tasks"
  on tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tasks"
  on tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own tasks"
  on tasks for delete
  using (auth.uid() = user_id);
