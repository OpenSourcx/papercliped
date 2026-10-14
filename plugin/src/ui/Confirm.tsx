import { useState } from "react";
import { errText } from "./format.js";
import { button, danger, field, muted, panel, row } from "./look.js";

/** A sensitive account action: opens inline, asks for the secret key (and the username to delete), then runs. */
export function Confirm({ label, detail, needName, destructive, onRun }: { label: string; detail: string; needName?: boolean; destructive?: boolean; onRun: (secret: string, name: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setSecret("");
    setName("");
    setMsg(null);
  };
  return (
    <div className={`${panel} my-2`}>
      <div className={`${row} justify-between`}>
        <div className="min-w-0 flex-1 basis-64">
          <strong>{label}</strong>
          <p className={muted}>{detail}</p>
        </div>
        {!open && <button type="button" className={destructive ? danger : button} onClick={() => setOpen(true)}>{label}</button>}
      </div>
      {open && (
        <form
          className={`${row} mt-2.5`}
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            onRun(secret.trim(), name.trim()).then(close).catch((err) => setMsg(errText(err))).finally(() => setBusy(false));
          }}
        >
          <input aria-label={`Secret key to confirm: ${label}`} name="papercliped-confirm-secret-key" type="password" autoComplete="new-password" autoFocus className={`${field} min-w-0 flex-1 basis-64`} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Your secret key" />
          {needName && <input aria-label="Type your username to confirm" name="papercliped-confirm-username" autoComplete="off" className={`${field} w-40 min-w-0`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your username" />}
          <button type="submit" className={destructive ? danger : button} disabled={busy || !secret.trim() || (!!needName && !name.trim())}>{busy ? "Working…" : "Confirm"}</button>
          <button type="button" className={button} onClick={close}>Cancel</button>
          {msg && <p role="alert" className="w-full mt-1.5 text-sm text-destructive">{msg}</p>}
        </form>
      )}
    </div>
  );
}
