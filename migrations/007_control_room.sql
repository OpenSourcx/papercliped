-- Control room: who may do what through Papercliped.
--   accounts.policy  the access switch (api | full | agent) and per-agent overrides, as JSON. Null = Full for every agent.
--   grants.policy    one session's limits (a name, which tools, which agents), as JSON. Null = no limits beyond its access level.
-- The app validates both on the way in and falls back to the safe default on anything it can't read, so old rows need no backfill.
alter table bridge.accounts add column if not exists policy jsonb;
alter table bridge.grants   add column if not exists policy jsonb;

-- Audit rows now also record calls the policy refused (error_class = policy_blocked).
comment on column bridge.audit_events.error_class is 'invalid_input | insufficient_scope | read_only | policy_blocked | upstream_4xx | upstream_5xx | upstream_unreachable | rate_limited | unauthorized | internal';
