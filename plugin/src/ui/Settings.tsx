import { useCallback } from "react";
import { PageHeader } from "./atoms.js";
import { useRoom } from "./room.js";
import { ServicePanel } from "./Service.js";
import { Account, Links, Privacy } from "./SettingsPanels.js";

/** Privacy, the Paperclips linked to this account, and the account itself, plus the service's public status. */
export function Settings() {
  const { call, me, onMe, onUnlinked } = useRoom();
  const loadService = useCallback(() => call.serviceStatus(), [call]);
  return (
    <div>
      <PageHeader title="Settings" subtitle="Your Papercliped account, inside Paperclip: privacy, linked Paperclips, and the account itself." />
      <ServicePanel load={loadService} />
      <h2 className="mb-1 mt-5 text-base font-semibold">Privacy</h2>
      <Privacy me={me} call={call} onMe={onMe} />
      <h2 className="mb-1 mt-5 text-base font-semibold">Linked Paperclips</h2>
      <Links call={call} onUnlinked={onUnlinked} />
      <h2 className="mb-1 mt-5 text-base font-semibold">Account</h2>
      <Account call={call} onUnlinked={onUnlinked} />
    </div>
  );
}
