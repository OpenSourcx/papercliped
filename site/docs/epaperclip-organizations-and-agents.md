# Organizations and agents in ePaperclip

**What you'll do:** set up agent containers once, create an organization and give it an agent.

Agents are optional. ePaperclip is useful without them.

## Before you start
- You are a Proxmox administrator (a user with `Sys.Modify` on `/`, such as `root@pam`) for the one-time agent-container setup.
- The host has internet access (to download a Debian template) and storage for a container template.
- You have an AI model to connect, such as a provider key, for the agents to think with ([connectors and models](/docs/epaperclip-connectors-and-models)).

## Steps
1. Agents never run on the host. Until agent containers are set up, the engine refuses to run any agent and the console says so. Open **Settings**, then **Agent containers**, check the storage and bridge it proposes, and start the guided setup. The first run builds a template and takes roughly 8 to 20 minutes, once.
2. Choose the **+** in the left rail to create an organization. It gets its own resource group on the machine (a Proxmox pool), so its agents can only use what is inside that group.
3. In the organization, open **Agents** and choose **Hire agent**, and follow the prompts for the agent's role and the AI account it uses.
4. Give it work from **Tasks**. Approvals and questions from agents arrive in **Inbox** and **Decisions**.

## What you should see
An organization's dashboard, with its resource group, members, agents, tasks and container sessions.

![An organization dashboard in ePaperclip](screen:organization)

## If it fails
- **"managed sandbox only".** Agent containers aren't set up yet. Do step 1.
- **An agent is slow to start.** How fast a container appears depends on the storage it is made on: about two minutes on ordinary directory storage, a few seconds on ZFS.
- **More:** the repository's `docs/ORGS.md`, `docs/PROXMOX-SANDBOX.md` and `docs/FAST-STORAGE.md`.
