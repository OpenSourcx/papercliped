# Link a computer to your account

Linking connects a computer running ePaperclip to your Papercliped account. You do both kinds of linking with a short code, entered at `https://link.papercliped.co`:

1. **Link the computer** (a *device*): the computer joins your account. Papercliped Connect needs this. You start it with `epaperclip login`.
2. **Link your account to your Proxmox user** on that computer: Papercliped then knows who you are there, and you can offer "Sign in with Papercliped". You start it in ePaperclip's console.

Linking never changes a Proxmox permission, and the computer keeps working locally if Papercliped can't be reached.

## What you need
- ePaperclip newer than 1.0.0 on the Proxmox host. Update with `apt update && apt install --only-upgrade epaperclip`, or `epaperclip update`.
- A Papercliped account ([create one](/docs/signup) if you don't have one yet).
- A root shell on the Proxmox host (the web shell works).

## Link the computer
Run this in the host's shell:

```
epaperclip login
```

It prints a code and an address:

```
  Link this computer to your Papercliped account

    1. Open   https://link.papercliped.co
    2. Enter  K7MQ-4XW2

  Sign in there if asked. The code works for 10 minutes.
  The page shows this computer's key; approve only if it starts with q3Zr8wYt0A.

  Waiting for you to approve it…
```

1. Open `https://link.papercliped.co` in any browser and sign in with your Papercliped account.
2. Enter the code (any case, with or without the hyphen) and choose **Continue**.
3. Check the page. It shows your account id, the code and the start of the computer's key. The key must start with the same characters the shell printed. When it says **Device proved its key**, choose **Approve this device**.
4. Back in the shell, `epaperclip login` shows which account approved the computer and asks you to confirm. Answer `y` only if that is your account. It then prints where the computer now appears on your account.

Options: `--name "Rack 4"` sets the name shown on your account (default: the host's name). In a script, `--yes` skips the question; the owner still has to approve on the website.

You can also do this in the browser: in ePaperclip choose **Access**, then **Remote access**, then **Link to Papercliped**. It shows the same code.

Check or undo it any time:

```
epaperclip whoami     # the account and device name this computer is linked as
epaperclip logout     # unlink it
```

Unlinking removes the computer's public address and seat on Papercliped Connect. Local use is not affected.

## Link your account to your Proxmox user
Once the computer is linked, ePaperclip's **Access**, **Remote access** page has a card called **Sign in with your Papercliped account**.

1. Choose **Link my Papercliped account**. It shows a code.
2. Enter the code at `https://link.papercliped.co`, review the request and choose **Approve**. You may be asked to confirm it's you with an emailed code first.
3. Back in ePaperclip, it shows the account that approved. Choose **Confirm this account** only if it's yours.

If your administrator has turned on **Sign in with Papercliped**, a second button lets you sign in to the console with your Papercliped account. That kind of link needs an administrator of the machine to approve it too; they see it under **Waiting for your approval**. Until they do, you'll see "Waiting for a Proxmox administrator".

## For administrators
On the same page, administrators also see **Papercliped sign-in: administrators**:

- **Sign in with Papercliped:** turn it on or off. Turning it on adds a Proxmox login realm called `papercliped`; turning it off removes the realm and ends every sign-in link made with it.
- **Waiting for your approval:** requests whose owner has already approved them on the website. You see who asked and which Papercliped account they would use. Approve only people and accounts you know.
- **Pre-approvals:** let a Proxmox user link without waiting for you, for 1 to 72 hours. Naming a Papercliped account id limits it to that account.
- **Other people's links:** every active link on the machine, with **Unlink**.

A linked person gets only the Proxmox permissions you give their Proxmox user.

## If something goes wrong
- **"That code did not match."** Codes last 10 minutes. Check the characters (the letters I and O and the digits 0 and 1 never appear), or start again on the computer to get a new code.
- **"Too many tries."** You can enter 8 wrong codes in 10 minutes. Wait, then enter the code again.
- **Wrong account.** The review page shows the account you're signed in as. If it isn't the one you want, choose **Not you?** on the code page, sign in with the right one and enter the code again.
- **Approve is greyed out.** The computer hasn't proved its key yet. Make sure `epaperclip login` is still running and the computer is online; the page updates by itself.
- **"The code expired" on the computer.** Run `epaperclip login` again.
- **`epaperclip: ePaperclip isn't running here`.** Start it with `systemctl start epaperclip`, then try again.
- **Papercliped can't be reached.** Nothing changes and the computer keeps working locally. Try again in a moment; see [Troubleshooting](/docs/troubleshooting).
