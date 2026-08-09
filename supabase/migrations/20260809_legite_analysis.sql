create table if not exists public.analysis_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Padel Player',
  level text not null default 'Beginner' check (level in ('Beginner', 'Intermediate', 'Advanced')),
  preferred_side text not null default 'Both' check (preferred_side in ('Left', 'Right', 'Both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analysis_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Padel Match',
  video_name text,
  duration_minutes integer not null default 0 check (duration_minutes between 0 and 600),
  overall_score integer not null default 0 check (overall_score between 0 and 100),
  status text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_shot_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.analysis_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shot_type text not null check (shot_type in ('forehand', 'backhand', 'bandeja', 'bajada', 'lob', 'error')),
  quality integer not null default 0 check (quality between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  winners integer not null default 0 check (winners >= 0),
  errors integer not null default 0 check (errors >= 0),
  created_at timestamptz not null default now(),
  unique (match_id, shot_type)
);

create index if not exists analysis_matches_user_played_idx on public.analysis_matches (user_id, played_at desc);
create index if not exists analysis_shot_stats_user_match_idx on public.analysis_shot_stats (user_id, match_id);

alter table public.analysis_profiles enable row level security;
alter table public.analysis_matches enable row level security;
alter table public.analysis_shot_stats enable row level security;

grant select, insert, update, delete on public.analysis_profiles to authenticated;
grant select, insert, update, delete on public.analysis_matches to authenticated;
grant select, insert, update, delete on public.analysis_shot_stats to authenticated;

drop policy if exists "analysis_profiles_select_own" on public.analysis_profiles;
drop policy if exists "analysis_profiles_insert_own" on public.analysis_profiles;
drop policy if exists "analysis_profiles_update_own" on public.analysis_profiles;
drop policy if exists "analysis_profiles_delete_own" on public.analysis_profiles;
drop policy if exists "analysis_matches_select_own" on public.analysis_matches;
drop policy if exists "analysis_matches_insert_own" on public.analysis_matches;
drop policy if exists "analysis_matches_update_own" on public.analysis_matches;
drop policy if exists "analysis_matches_delete_own" on public.analysis_matches;
drop policy if exists "analysis_shot_stats_select_own" on public.analysis_shot_stats;
drop policy if exists "analysis_shot_stats_insert_own" on public.analysis_shot_stats;
drop policy if exists "analysis_shot_stats_update_own" on public.analysis_shot_stats;
drop policy if exists "analysis_shot_stats_delete_own" on public.analysis_shot_stats;

create policy "analysis_profiles_select_own" on public.analysis_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "analysis_profiles_insert_own" on public.analysis_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "analysis_profiles_update_own" on public.analysis_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "analysis_profiles_delete_own" on public.analysis_profiles for delete to authenticated using ((select auth.uid()) = user_id);
create policy "analysis_matches_select_own" on public.analysis_matches for select to authenticated using ((select auth.uid()) = user_id);
create policy "analysis_matches_insert_own" on public.analysis_matches for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "analysis_matches_update_own" on public.analysis_matches for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "analysis_matches_delete_own" on public.analysis_matches for delete to authenticated using ((select auth.uid()) = user_id);
create policy "analysis_shot_stats_select_own" on public.analysis_shot_stats for select to authenticated using ((select auth.uid()) = user_id);
create policy "analysis_shot_stats_insert_own" on public.analysis_shot_stats for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.analysis_matches m where m.id = match_id and m.user_id = (select auth.uid())));
create policy "analysis_shot_stats_update_own" on public.analysis_shot_stats for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.analysis_matches m where m.id = match_id and m.user_id = (select auth.uid())));
create policy "analysis_shot_stats_delete_own" on public.analysis_shot_stats for delete to authenticated using ((select auth.uid()) = user_id);
