# Pin, the assistant in ePaperclip

**What you'll do:** ask Pin about your host, and decide how much it may do on its own.

Pin is optional and still a preview. It works only once you connect an AI model ([connectors and models](/docs/epaperclip-connectors-and-models)).

## Before you start
- You are signed in, and an AI model is connected.
- Remember that Pin acts as you: every action it takes runs as the signed-in person, so Proxmox's own permissions still decide.

## Steps
1. Use the **Ask Pin** bar on the overview page, or open Pin from the orb in the rail.
2. Choose the mode next to the bar. **Assistant** explains and proposes; you decide. **Agent** does the work.
3. In Agent mode, open Pin's page and choose **What Pin may do on its own**:
   - **Ask** (the default): every action appears as a card you approve or decline.
   - **Accept edits**: safe actions run at once; anything that interrupts a machine or can't be undone asks.
   - **Auto**: everything runs at once except what can't be undone.
   - **Plan**: Pin only writes plans; nothing runs until you approve each step.
   - **Bypass permissions**: everything runs with no questions. Turning it on needs you to type the word `bypass`, and it is written to the audit trail.

## What you should see
Pin's chat next to the machine overview.

![Pin in ePaperclip](screen:pin)

## If it fails
- **Pin doesn't answer.** No AI model is connected, or its key was refused. Check **Connectors**.
- **Pin can't do something you can do.** It can only do what your Proxmox account may do, and some actions always ask first.
- **More:** the repository's `docs/PIN.md`.
