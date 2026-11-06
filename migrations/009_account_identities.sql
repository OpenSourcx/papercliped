-- Links one Papercliped account to one verified central-login identity (Supabase Auth issuer + subject).
-- Written by the Connect claim route only after the bridge itself verified the Supabase session; a second
-- subject can never be bound to an already-linked account, and a subject can never own two accounts.
create table if not exists bridge.account_identities (
  account_id text   primary key references bridge.accounts (id) on delete cascade,
  issuer     text   not null,
  subject    text   not null,
  linked_at  bigint not null
);
create unique index if not exists account_identities_identity_idx on bridge.account_identities (issuer, subject);
alter table bridge.account_identities enable row level security;
revoke all on bridge.account_identities from public;

-- Supabase advisor: this SECURITY DEFINER event-trigger helper must not be callable through the API.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
