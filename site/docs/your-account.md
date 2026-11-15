# Your Papercliped account

One Papercliped account covers Connect, the Console, your devices, and the AI apps you've connected. You manage it at **auth.papercliped.co/account**.

## Ways to sign in
You can use any of these, and you can add more later.

| Method | How it works |
| --- | --- |
| **Email code** | We email a 6-digit code to the address on your account. It works for every account and is your way back in if you lose another method. |
| **Passkey** | Sign in with your fingerprint, face, screen lock or a security key. No email needed. |
| **Google** | Continue with your Google account. |
| **GitHub** | Continue with your GitHub account. |

Signing in with Google or GitHub using the **same email address** as your account adds that method to it. Papercliped never creates a second account for the same address.

## Create an account
1. Go to **auth.papercliped.co** and choose **Create an account**.
2. Enter your email address and the 6-digit code we send.
3. Choose **Link my existing account** if you already use Papercliped with a username and secret key, or **Create a new account** to pick a username. A new account gets a secret key, shown once: save it in a password manager.

## Add a passkey
1. On your account page, find **Passkeys and security keys** and choose **Manage passkeys**.
2. Confirm it's you with an emailed code (or an existing passkey).
3. Choose **Add a passkey** and follow your browser's prompt.

Next time, choose **Sign in with a passkey** on the sign-in page. You can have several (one per device) and remove any of them from the same place. Passkeys are tied to auth.papercliped.co: they won't appear anywhere else, and that is by design.

## Link or remove Google and GitHub
- **Link:** next to Google or GitHub choose **Link**, confirm it's you, and sign in with that provider.
- **Remove:** choose **Remove** next to a method. You must always keep at least one way to sign in, and you confirm it's you first.

## Connected AI apps
**Connected AI apps** lists the apps (Claude, ChatGPT, Codex and any other MCP client) that you've allowed to work with your Paperclip, with the access level each has (**Read only** or **Full control**) and when it was last used.

To disconnect one, choose **Remove**, then **Disconnect**. You'll be asked to confirm it's you. The app loses access at once, and you can connect it again later. See [Connect Claude](/docs/claude), [ChatGPT](/docs/chatgpt) and [Codex](/docs/codex) for how to connect one.

If the section says **Not available yet**, it is being switched on for your account. Your existing connections keep working.

## Link a computer
To add a computer running ePaperclip to your account, or to link your account to your Proxmox user on it, see [Link a computer to your account](/docs/link-a-device). You enter a short code at `https://link.papercliped.co`.

## Billing (Connect)
Papercliped Connect, the managed remote address for your ePaperclip machine, is in pre-release. It is billed per device per month (US$5.99 per device), through Stripe.

- **Start:** open the Console, choose **Billing**, and subscribe. Stripe's checkout page takes the payment.
- **See your plan:** the Console and your account page show your seats, the renewal date or the end date.
- **Cancel:** in the Console choose **Billing**, then manage your subscription. Your devices keep their managed access until the end of the period you've paid for, then it stops. Your local ePaperclip keeps working either way.

## Sign out
Choose **Sign out** under **Sessions**. Each browser has its own session, and sessions end after an hour.

## If you're stuck
- **I didn't get the email code.** Check spam, wait a minute, then ask for a new one. Only addresses with an account get a code on the sign-in page.
- **My passkey isn't offered.** Passkeys need a browser and device that support them, and they work only on auth.papercliped.co.
- **GitHub or Google says the redirect isn't allowed.** That's on our side; write to support@papercliped.co and say which one.

More help: [Troubleshooting](/docs/troubleshooting).
