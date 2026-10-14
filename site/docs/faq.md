# FAQ

## Is Papercliped free?
Yes. It's free and open source under the MIT licence. The hosted bridge at papercliped.co runs the same code you can run yourself.

## Is it made by Paperclip?
No. Papercliped is an independent community project that uses Paperclip's public API.

## What does the AI see?
Only what it asks for through the tools, within your level. Issue and comment text written by agents can reach the AI; treat it as data, not instructions.

## What do you store?
Your username, a hash of your secret key, your Paperclip's address, an encrypted Paperclip key, connection records and a 30-day activity log. Details in [Privacy](/privacy).

## What can I ask it?
Anything you'd otherwise click through Paperclip for: "Catch me up", "Give the Web Engineer this task", "Approve the hire", "Weekly cost report". Browse ready-to-copy prompts in the [prompt gallery](/docs/prompts).

## Where should I host Paperclip?
At home with a free tunnel to try it; a small VPS (best value) or Railway (easiest) to keep it on all the time. Compare every option in [Host your Paperclip](/docs/hosting).

## Paperclip has its own MCP server now. Do I still need Papercliped?
Newer Paperclip versions include an experimental, off-by-default MCP endpoint for connecting assistants straight to your instance. Use whichever suits you. Papercliped adds a hosted connector that works with older Paperclips too, ChatGPT GPT Actions, the two access levels enforced on every call, an audit log, ready-made status, cost and performance reports, and connection management in the Paperclip plugin.

## Can I use it without a public Paperclip?
Yes: run it locally with `npx papercliped@latest`. The hosted bridge needs a public https address; see [Host your Paperclip](/docs/hosting).

## Why does pausing an agent fail with 403?
Pause, resume, wake and approve need a connection at **Full control**, and an [access mode](/docs/access-modes) that allows them: pausing and approvals are *direct control* (blocked in Agent only), waking is *work through agents* (blocked in API only). A blocked call names the setting to change; check it in the [control room](/docs/control-room).

## Why was a call blocked, or a tool missing?
Your own settings. Open **Papercliped** in Paperclip: the switch (API only, Full, Agent only), an agent's setting, or the session's tool and agent lists decide what an AI app may do, and **Activity** shows each blocked call and the reason. See [API only, Full or Agent only](/docs/access-modes).

## Can I keep an agent away from AI apps?
Yes. In the [control room](/docs/control-room), open **Agents** and set it to **Off**: AI apps can't see it, touch it, or see what's assigned to it.

## How do I stop it?
Disconnect the session in the [control room](/docs/control-room), revoke the key in your Paperclip, or delete your account. It stops at once.

## I lost my secret key.
Choose **Connect your Paperclip** when signing in and approve in Paperclip: you keep your account and can make a new key.

## Does it work with ChatGPT?
Yes, through ChatGPT's MCP connectors or GPT Actions. See [ChatGPT setup](/docs/chatgpt).

## Where do I report a bug or suggest something?
On GitHub: [open an issue](https://github.com/OpenSourcx/papercliped/issues), or use the community page on papercliped.co. Security problems go privately to support@papercliped.co.
