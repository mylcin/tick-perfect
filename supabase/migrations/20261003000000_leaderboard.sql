-- The online leaderboard: profiles, rule sets and their seasons, every
-- ranked round with the input it was played with, and each player's best.
--
-- Everything lives in its own schema, which Supabase's public REST API
-- doesn't expose, with row level security on and no grants to the public
-- roles: the browser's key can sign in and nothing else. Every read and
-- write goes through the API (server/), which connects as the owner, checks
-- the caller and replays each score before it counts.

create schema if not exists game;

create type game.app_role as enum ('player', 'admin', 'super_admin');

-- issued: a seed handed out, the round not yet sent back.
-- verified: replayed, and on the board.
-- flagged: replayed, but too steady to be human; waits for an admin.
-- rejected: the log didn't replay to the score, or arrived too soon.
-- abandoned: a newer round was asked for before this one came back.
create type game.round_status as enum (
  'issued',
  'verified',
  'flagged',
  'rejected',
  'abandoned'
);

create table game.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 2 and 24),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  -- Granted by hand in SQL, never through the API.
  role game.app_role not null default 'player',
  banned_at timestamptz,
  created_at timestamptz not null default now()
);

-- A watch's rules, as the engine plays them. Never edited: a change is a
-- new version.
create table game.rulesets (
  id int generated always as identity primary key,
  watch_id text not null,
  version int not null check (version > 0),
  rules jsonb not null,
  -- SHA-256 of the canonical JSON, so a page can tell its rules are current.
  rules_hash text not null,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references game.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (watch_id, version)
);

-- A leaderboard on one rule set. Publishing new rules ends the watch's
-- standard season and opens another; an event runs alongside, for a while.
create table game.seasons (
  id int generated always as identity primary key,
  watch_id text not null,
  ruleset_id int not null references game.rulesets (id),
  kind text not null default 'standard' check (kind in ('standard', 'event')),
  name text check (name is null or char_length(name) <= 60),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references game.profiles (id) on delete set null,
  check (ends_at is null or ends_at > starts_at),
  check (kind = 'standard' or ends_at is not null)
);

create unique index seasons_one_current
  on game.seasons (watch_id)
  where kind = 'standard' and ends_at is null;

create table game.rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references game.profiles (id) on delete cascade,
  watch_id text not null,
  -- A ranked round counts on its season; a Daily on its day.
  season_id int references game.seasons (id),
  daily_number int,
  ruleset_id int not null references game.rulesets (id),
  seed bigint not null check (seed between 0 and 4294967295),
  status game.round_status not null default 'issued',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  -- The taps, pauses and resumes, as the page logged them.
  log jsonb,
  score int check (score >= 0),
  hits int check (hits >= 0),
  perfects int check (perfects >= 0),
  best_streak int check (best_streak >= 0),
  -- The spread of the player's timing errors, in ms: too small is a bot.
  timing_spread real,
  review_note text,
  reviewed_by uuid references game.profiles (id) on delete set null,
  client_version text check (
    client_version is null or char_length(client_version) <= 40
  ),
  check ((season_id is null) <> (daily_number is null))
);

create index rounds_by_user on game.rounds (user_id, issued_at desc);
create index rounds_flagged on game.rounds (issued_at) where status = 'flagged';

-- Each player's best verified round per board: 'season:<id>' or
-- 'daily:<number>'.
create table game.best_scores (
  board text not null check (board ~ '^(season|daily):[0-9]+$'),
  user_id uuid not null references game.profiles (id) on delete cascade,
  score int not null check (score >= 0),
  round_id uuid not null references game.rounds (id) on delete cascade,
  achieved_at timestamptz not null,
  primary key (board, user_id)
);

create index best_scores_ranked
  on game.best_scores (board, score desc, achieved_at);

-- A signed-in player's progress (unlocks, variants, settings, timing), so
-- it follows them to another device.
create table game.user_progress (
  user_id uuid primary key references game.profiles (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Switches an admin can flip without a deploy.
create table game.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references game.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Every admin action: who did what, to what, when.
create table game.audit_log (
  id int generated always as identity primary key,
  actor uuid references game.profiles (id) on delete set null,
  action text not null,
  target text,
  payload jsonb,
  at timestamptz not null default now()
);

create index audit_log_recent on game.audit_log (at desc);

-- Requests per key per window, for rate limits.
create table game.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

alter table game.profiles enable row level security;
alter table game.rulesets enable row level security;
alter table game.seasons enable row level security;
alter table game.rounds enable row level security;
alter table game.best_scores enable row level security;
alter table game.user_progress enable row level security;
alter table game.app_settings enable row level security;
alter table game.audit_log enable row level security;
alter table game.rate_limits enable row level security;

revoke all on schema game from public, anon, authenticated;
revoke all on all tables in schema game from public, anon, authenticated;
revoke all on all sequences in schema game from public, anon, authenticated;
