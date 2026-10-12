-- Less personal data, and somewhere to keep the game's errors.

-- The provider's picture was stored but never shown. Data with no use is
-- not kept.
alter table game.profiles drop column avatar_url;

-- Rate-limit windows hold network addresses. Every request clears the ones
-- whose window has passed, by this index (server/rate-limit.ts).
create index rate_limits_by_window on game.rate_limits (window_start);

-- Errors from the API, the page and the content security policy, counted
-- per kind and hour. A kind is a fingerprint of where and what (see
-- server/errors.ts); `detail` is its latest sample. Nothing here names a
-- player: no account, no address, no full user agent. Hours older than 30
-- days are deleted as new ones are written.
create table game.error_reports (
  fingerprint text not null,
  hour timestamptz not null,
  source text not null check (source in ('api', 'page', 'csp')),
  message text not null check (char_length(message) <= 500),
  detail jsonb not null default '{}',
  count int not null default 1 check (count > 0),
  first_at timestamptz not null,
  last_at timestamptz not null,
  primary key (fingerprint, hour)
);

create index error_reports_recent on game.error_reports (hour desc);

alter table game.error_reports enable row level security;
revoke all on game.error_reports from public, anon, authenticated;
