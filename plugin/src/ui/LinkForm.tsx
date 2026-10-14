import { useState, type FormEvent } from "react";
import { errText } from "./format.js";
import { field, h2, muted, panel, primary, row } from "./look.js";

/** Link this Paperclip user to their Papercliped account: username + secret key, checked once by the bridge, never stored. */
export function LinkForm({ expired, onLink }: { expired: boolean; onLink: (username: string, secret: string) => Promise<unknown> }) {
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    onLink(username.trim(), secret.trim())
      .then(() => setSecret(""))
      .catch((err) => setMsg(errText(err)))
      .finally(() => setBusy(false));
  };
  return (
    <form onSubmit={submit} className={panel} aria-labelledby="pcl-link-h">
      <h2 id="pcl-link-h" className={h2}>Link your Papercliped account</h2>
      {expired && <p role="status" className={muted}>Your link ended (for example after a new secret key). Sign in again to link.</p>}
      <p className={muted}>Use the username and secret key you got when you first connected Claude or ChatGPT. Papercliped checks the key once; it is not stored in Paperclip.</p>
      <div className={`${row} mt-2.5`}>
        <input aria-label="Username" name="papercliped-username" className={`${field} w-40 min-w-0`} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="off" spellCheck={false} />
        <input aria-label="Secret key" name="papercliped-secret-key" type="password" className={`${field} min-w-0 flex-1 basis-64`} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="pcs_XXXX-XXXX-XXXX-XXXX" autoComplete="new-password" spellCheck={false} />
        <button type="submit" className={primary} disabled={busy || !username.trim() || !secret.trim()}>{busy ? "Linking…" : "Link"}</button>
      </div>
      {msg && <p role="alert" className="mt-2.5 text-sm text-destructive">{msg}</p>}
      <p className={`${muted} mt-3`}>Lost your key? Connect from your AI app again and choose <strong>Connect your Paperclip</strong>: you keep your account and get a new key.</p>
    </form>
  );
}
