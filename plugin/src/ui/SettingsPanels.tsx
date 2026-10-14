import { useCallback, useEffect, useState } from "react";
import { copyTextToClipboard, DataTable, StatusBadge, usePluginToast, type DataTableColumn } from "@paperclipai/plugin-sdk/ui";
import { Confirm } from "./Confirm.js";
import { ago, errText } from "./format.js";
import { button, code, h2, muted, panel, row } from "./look.js";
import type { Call, Link, Me } from "./types.js";

export function Privacy({ me, call, onMe }: { me: Me; call: Call; onMe: (m: Me) => void }) {
  const toast = usePluginToast();
  const [busy, setBusy] = useState(false);
  const set = (anonymous: boolean) => {
    setBusy(true);
    call.privacy({ anonymous })
      .then((r) => {
        const x = r as { anonymous: boolean; alias: string | null };
        onMe({ ...me, anonymous: x.anonymous, alias: x.alias });
        toast({ title: x.anonymous ? `You now appear as ${x.alias}` : "You now appear by your username", tone: "success" });
      })
      .catch((e) => toast({ title: "That didn't work", body: errText(e), tone: "error" }))
      .finally(() => setBusy(false));
  };
  return (
    <section className={panel}>
      <h2 className={h2}>Appear anonymously</h2>
      <p className={muted}>The service's logs and operator dashboard show an alias instead of your username. Your connections keep working either way.</p>
      <label className={`${row} mt-2.5 cursor-pointer`}>
        <input type="checkbox" checked={me.anonymous} disabled={busy} onChange={(e) => set(e.target.checked)} />
        <span>{me.anonymous ? `On${me.alias ? `: you appear as ${me.alias}` : ""}` : "Off"}</span>
      </label>
    </section>
  );
}

export function Links({ call, onUnlinked }: { call: Call; onUnlinked: () => void }) {
  const toast = usePluginToast();
  const [links, setLinks] = useState<Link[] | null>(null);
  const load = useCallback(() => {
    call.links().then((r) => setLinks((r as { links: Link[] }).links)).catch((e) => toast({ title: "Could not load your links", body: errText(e), tone: "error" }));
  }, [call, toast]);
  useEffect(load, [load]);
  const columns: DataTableColumn<Link>[] = [
    { key: "host", header: "Paperclip", render: (v, l) => <span><strong>{String(v ?? "Paperclip")}</strong>{l.current && <> <StatusBadge label="This one" status="info" /></>}</span> },
    { key: "lastUsedAt", header: "Last used", render: (v) => ago(v as number | null) },
    { key: "createdAt", header: "Linked", render: (v) => ago(v as number) },
    {
      key: "id", header: "",
      render: (_v, l) => l.current
        ? <button type="button" className={button} onClick={() => call.unlink().then(onUnlinked).catch((e) => toast({ title: "That didn't work", body: errText(e), tone: "error" }))}>Unlink</button>
        : <button type="button" className={button} onClick={() => call.removeLink({ id: l.id }).then(() => { toast({ title: "Link removed", tone: "success" }); load(); }).catch((e) => toast({ title: "That didn't work", body: errText(e), tone: "error" }))}>Remove</button>,
    },
  ];
  return (
    <section className="mt-3">
      <p className={muted}>Every Paperclip where you linked this account. Unlinking removes the token here and revokes it at Papercliped; your account and apps are not touched.</p>
      <DataTable columns={columns as unknown as DataTableColumn[]} rows={(links ?? []) as unknown as Record<string, unknown>[]} loading={links == null} emptyMessage="No linked Paperclips." />
    </section>
  );
}

export function Account({ call, onUnlinked }: { call: Call; onUnlinked: () => void }) {
  const toast = usePluginToast();
  const [fresh, setFresh] = useState<string | null>(null);
  return (
    <section className="mt-3">
      <p className={muted}>These ask for your secret key every time.</p>
      {fresh && (
        <div role="status" className={panel}>
          <strong>Your new secret key (shown once)</strong>
          <p className={`${row} my-2`}>
            <code className={code}>{fresh}</code>
            <button type="button" className={button} onClick={() => { copyTextToClipboard(fresh); toast({ title: "Copied", tone: "success" }); }}>Copy</button>
          </p>
          <p className={muted}>Save it in your password manager now. The old key no longer works, and other linked Paperclips have to link again. This one stays linked.</p>
          <button type="button" className={button} onClick={() => setFresh(null)}>I saved it</button>
        </div>
      )}
      <Confirm label="Make a new secret key" detail="Use this if your key may have leaked. Every other linked Paperclip is unlinked." onRun={(secret) => call.rotateSecret({ secret }).then((r) => setFresh((r as { secret: string }).secret))} />
      <Confirm label="Disconnect my Paperclip" destructive detail="Papercliped forgets your Paperclip key and asks your Paperclip to revoke it. Every connected app stops working and this page unlinks. Your account stays." onRun={(secret) => call.disconnectPaperclip({ secret }).then(() => { toast({ title: "Paperclip disconnected", tone: "success" }); onUnlinked(); })} />
      <Confirm label="Delete my account" destructive needName detail="Removes your username, stored key and every connection. This can't be undone." onRun={(secret, confirm) => call.deleteAccount({ secret, confirm }).then(() => { toast({ title: "Account deleted", tone: "success" }); onUnlinked(); })} />
    </section>
  );
}
