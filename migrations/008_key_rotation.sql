-- Paperclip key rotation: Paperclip expires the board keys it issues (30 days by default), so the bridge renews
-- each stored key about a week before it lapses. credential_expires_at is when Paperclip expires the stored key
-- (ms epoch); null = it never expires (older Paperclip, or a key Paperclip did not issue us), so it is never rotated.
alter table bridge.account_links add column if not exists credential_expires_at bigint;
alter table bridge.grants        add column if not exists credential_expires_at bigint;

-- Keys stored before this migration came from an approved sign-in: assume Paperclip's default 30 days from then.
-- The first rotation check reads the real expiry from Paperclip and corrects it (or clears it if the key never expires).
update bridge.account_links set credential_expires_at = connected_at + 2592000000
 where sealed_credential is not null and credential_expires_at is null;
update bridge.grants set credential_expires_at = created_at + 2592000000
 where sealed_credential is not null and not revoked and credential_expires_at is null;

create index if not exists account_links_expiry_idx on bridge.account_links (credential_expires_at) where sealed_credential is not null;
create index if not exists grants_expiry_idx on bridge.grants (credential_expires_at) where sealed_credential is not null and not revoked;
