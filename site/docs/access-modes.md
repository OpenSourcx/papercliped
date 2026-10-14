# API only, Full or Agent only

One switch decides how AI apps may work with your Paperclip: **API only**, **Full** or **Agent only**. **Full** is the default for every agent. You set it in the [control room](/docs/control-room), and you can set any single agent differently (or turn it **Off**).

## What each position means
| Mode | AI apps can | AI apps can't |
| --- | --- | --- |
| **API only** | Look at everything, and control Paperclip directly: pause and resume agents, set budgets, decide approvals, manage goals, send API requests | Hand work to agents |
| **Full** (default) | Everything: look, control directly, and work through agents | Nothing is held back by the switch |
| **Agent only** | Look at everything, and work through agents: create, assign and comment on issues, wake an agent | Control Paperclip directly |

The AI app's access **level** (Read only or Full control) still applies on top. Read only can never change anything, whatever the switch says.

## The three kinds of tool
Every tool is exactly one of these:

| Kind | Tools | Allowed in |
| --- | --- | --- |
| **Look** | Everything that only reads: lists, details, reports, sync, waiting for an agent, and raw `GET` requests | Every mode |
| **Work through agents** | Create issue, Update issue, Comment on issue, Wake agent now | Full, Agent only |
| **Direct control** | Pause agent, Resume agent, Clear agent error, Set agent budget, Terminate agent, Create goal, Update goal, Decide approval, and raw API requests that aren't `GET` | Full, API only |

The full list, with what each tool does, is the [tool reference](/docs/tools).

## One agent at a time
Each agent can follow the default or be set apart:

- **API only**, **Full** or **Agent only** for just that agent. For example, keep the default **Full** but set one agent to **Agent only**: AI apps can give it work but can't pause or terminate it.
- **Off**: Papercliped can't see or touch that agent. It disappears from lists and reports, anything assigned to it is out of reach, and calls that name it are refused.

A call is judged by the agent it is about: the agent it names, the agent it assigns work to, or the agent an issue is assigned to. A call that isn't about one agent (for example "list goals") follows the default.

## One session at a time
Each connected app (a **session**) can also be limited, whatever the switch says:

- **Tools:** only the tools you tick.
- **Agents:** only the agents you choose. The session then works with those agents only, and can't use views across every agent (reports, the org chart, goals, approvals).

## How the layers combine
Papercliped checks, in this order, and refuses at the first thing that doesn't allow the call:

1. The session's **tool list** (if it has one).
2. The agent's **setting**: Off refuses; otherwise its mode must allow this kind of tool.
3. The session's **agent list** (if it has one).
4. The access **level** (Read only, Full control).

So a call goes through only if *every* layer allows it.

## What the AI app sees
- Tools that can **never** run for a session are left out of what it is shown, so it doesn't try them. A session limited to `List agents` and `Pause agent` sees exactly those two.
- A refused call returns a message that says which setting stopped it and where to change it. In the API the response is `403` with `{ "error": { "message": "...", "policy": "<code>" } }`:

| `policy` code | Meaning |
| --- | --- |
| `tool_not_allowed` | The session's tool list doesn't include this tool |
| `mode_blocks` | The access switch (or that agent's setting) doesn't allow this kind of tool |
| `agent_off` | The agent is turned off |
| `agent_not_in_session` | The session applies to selected agents and this isn't one of them |
| `needs_all_agents` | The session applies to selected agents, and this view looks across every agent (or the issue has no agent to check) |

Blocked calls appear in [Activity](/docs/control-room) as **Blocked**, and count under `policy_blocked` in the aggregate error classes of the [public API](/docs/public-api).

## Examples
- *"I want Claude to run my agents but never change budgets or approvals."* Give that session **Tools: Work through agents + Look** (untick the Direct control tools), or set the switch to **Agent only**.
- *"I want a reviewer app that only works on two agents."* Open its session, choose **selected agents**, tick the two. It can look at them, wake them and comment on their issues, and nothing else.
- *"Keep my finance agent away from AI apps."* Agents → set it to **Off**.
- *"Pause everything fast, but no new work."* Set the switch to **API only**.

## Limits worth knowing
- These settings apply to calls made **through Papercliped**. They don't change what your Paperclip account can do in Paperclip itself, and the Paperclip key Papercliped holds still has your account's access (see [Security](/docs/security)). They limit the AI app, not the key.
- Totals the Paperclip server already summed (such as total spend) still include hidden agents. Lists, per-agent breakdowns and reports built from them don't.
- Changing a setting takes effect on the next request. A call already running isn't interrupted.
