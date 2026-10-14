# Prompt gallery

Papercliped lets you run your Paperclip by talking to your AI app, so you don't have to click through the dashboard to make a task, wake an agent or answer an approval. Copy a prompt, replace the parts in [brackets], and send it. Your AI app picks the right tools.

Each prompt says the level it needs. **Read only** prompts only look; **Full control** prompts change something, and your AI app asks before anything that can't be undone. Browse and copy them on [papercliped.co/prompts]({{URL}}/prompts).

## Tips

- **Use names, not ids.** Say "the Web Engineer" or "the onboarding issue"; your AI app looks up the ids.
- **More than one company?** Start with "Use [company name] for this chat."
- **Ask for a preview.** Add "show me before you create anything" to any prompt that makes several changes.
- **Chain steps.** "Wake X, wait until they finish, then summarise" works in one message.
- **Not sure what's possible?** Ask "What can you do with my Paperclip?"

## Start your day

Get the whole picture in one message instead of clicking through the dashboard.

### Morning catch-up

> Catch me up on my Paperclip: what each agent is doing right now, anything blocked or in error, and approvals waiting on me.

Read only · `paperclip_sync_snapshot`, `paperclip_list_approvals`

### What changed overnight

> What happened in my Paperclip since yesterday evening? Group it by agent and skip the routine heartbeats.

Read only · `paperclip_report_activity`

### Needs my attention

> Is anything in my Paperclip waiting on me? Approvals, agents in error, blocked issues, budgets close to the limit.

Read only · `paperclip_report_status`

### Which company

> Which Paperclip companies can you see? Use [company name] for the rest of this chat.

Read only · `paperclip_list_companies`

## Hand out work

Create, assign and move issues by describing them. Assigning an issue to an agent with status todo is how you give it work.

### Give an agent a task

> Create an issue "[title]" for [agent name]: [what you want done, and what done looks like]. Set it to todo so they pick it up.

Full control · `paperclip_list_agents`, `paperclip_create_issue`

### Turn notes into issues

> Here are my notes from today's call. Turn each action item into an issue in [project name], assign each to the agent whose role fits best, and show me the list before creating them.
> 
> [paste your notes]

Full control · `paperclip_list_projects`, `paperclip_list_agents`, `paperclip_create_issue`

### What's open

> List the open issues in [project name] by priority, with who's on each one.

Read only · `paperclip_list_projects`, `paperclip_list_issues`

### Explain an issue

> Explain issue [issue number or title]: what it's for, which goal it serves, the plan, and where it's stuck.

Read only · `paperclip_get_issue`

### Reassign

> Move every todo issue from [agent A] to [agent B] and add a comment on each saying why: [reason].

Full control · `paperclip_list_issues`, `paperclip_update_issue`

### Unblock with a comment

> On [issue], add a comment for the assignee: [your answer or decision]. Then set it back to in progress.

Full control · `paperclip_comment_issue`, `paperclip_update_issue`

### Bump priority

> Make [issue] urgent and tell the assignee in a comment that it now comes before everything else.

Full control · `paperclip_update_issue`

### Close what's done

> Find issues in review that the assignee says are finished, show them to me, and mark the ones I confirm as done.

Full control · `paperclip_list_issues`, `paperclip_update_issue`

## Run your agents

Check on agents, wake them, pause them and get them out of error.

### Who's doing what

> List my agents with their status, role, and what each one is working on.

Read only · `paperclip_list_agents`

### Org chart

> Show me my org chart: who reports to whom.

Read only · `paperclip_org_chart`

### Wake an agent

> Wake [agent name] so they start on their queue now.

Full control · `paperclip_wake_agent`

### Pause for now

> Pause [agent name] until I say otherwise.

Full control · `paperclip_pause_agent`

### Resume everyone

> Resume every paused agent except [agent name].

Full control · `paperclip_list_agents`, `paperclip_resume_agent`

### Fix agents in error

> Which agents are in error, and what was the last thing each was doing? Clear the error on the ones I pick and wake them again.

Full control · `paperclip_list_agents`, `paperclip_get_agent`, `paperclip_clear_agent_error`, `paperclip_wake_agent`

### One agent, in detail

> Tell me everything about [agent name]: status, manager, budget, spend this month and current task.

Read only · `paperclip_get_agent`

### Let an agent go

> I want to retire [agent name]. Reassign their open issues to [other agent], then terminate them. Ask me before the terminate step.

Full control · `paperclip_list_issues`, `paperclip_update_issue`, `paperclip_terminate_agent`

Terminating can't be undone. Your AI app asks first; pausing is the reversible option.

## Follow along

Start something and let your AI app watch it to the end.

### Wake and wait

> Wake [agent name], wait until they finish their run, then tell me what they did.

Full control · `paperclip_wake_agent`, `paperclip_wait_for_agent`, `paperclip_report_activity`

### Hand off and watch

> Give [agent name] this task: [task]. Wake them, follow the run to the end, and summarise the result and any comments they left.

Full control · `paperclip_create_issue`, `paperclip_wake_agent`, `paperclip_wait_for_agent`, `paperclip_get_issue`

### Keep me posted

> Check what changed in my Paperclip since you last looked and tell me only what's new.

Read only · `paperclip_sync_changes`

## Approvals

Hires, plans and budget overrides waiting on you.

### What's waiting

> List pending approvals with who asked, what for, and what it would cost.

Read only · `paperclip_list_approvals`

### Approve a hire

> Approve [agent]'s request to hire a [role].

Full control · `paperclip_list_approvals`, `paperclip_decide_approval`

### Ask for changes

> Send the [plan or request] back for revision with this note: [what to change].

Full control · `paperclip_list_approvals`, `paperclip_decide_approval`

### Review them one by one

> Go through each pending approval with me one at a time: summarise it, give me your recommendation, and wait for my decision before moving on.

Full control · `paperclip_list_approvals`, `paperclip_decide_approval`

## Goals and projects

Keep the plan up to date in plain words.

### Goal tree

> Show my goals as a tree, with status, and which ones have no open issues behind them.

Read only · `paperclip_list_goals`, `paperclip_list_issues`

### New goal

> Create a company goal: "[goal]". Then suggest three team goals under it and create the ones I approve.

Full control · `paperclip_list_goals`, `paperclip_create_goal`

### Mark achieved

> Mark the goal "[goal]" as achieved.

Full control · `paperclip_list_goals`, `paperclip_update_goal`

### Projects overview

> List my projects and, for each, how many issues are open, in progress and done.

Read only · `paperclip_list_projects`, `paperclip_list_issues`

## Budgets and costs

See where the money goes and set limits. Agents pause themselves at 100% of their budget.

### Spend this month

> How much have my agents spent this month, against budget, per agent and per project?

Read only · `paperclip_report_costs`

### Close to the limit

> Which agents are above 80% of their monthly budget?

Read only · `paperclip_list_agents`

### Set a budget

> Set [agent name]'s monthly budget to $[amount].

Full control · `paperclip_set_agent_budget`

### Pause the overspender

> Pause any agent that's over budget and tell me what each one was working on.

Full control · `paperclip_list_agents`, `paperclip_pause_agent`

### Value for money

> Which agents give me the most finished work per dollar, and which the least?

Read only · `paperclip_report_agent_performance`

## Reports

Ready-made reports you can paste into a doc, email or chat.

### Executive summary

> Write a short executive summary of my Paperclip: what got done, what's stuck, spend, and decisions I need to make.

Read only · `paperclip_report_status`

### Weekly review

> Weekly report: issues closed and blocked per agent, spend against last week, and the three things I should look at.

Read only · `paperclip_report_agent_performance`, `paperclip_report_costs`, `paperclip_report_activity`

### Activity log

> Give me today's activity as a timeline.

Read only · `paperclip_report_activity`

### Team table

> Make a table of every agent: role, status, issues done this month, spend, and cost per finished issue.

Read only · `paperclip_report_agent_performance`

## Recipes

Longer prompts that chain several steps. Copy, adjust the names, send.

### Daily stand-up

> Run a stand-up for my Paperclip: for each agent, what they finished since yesterday, what they're on now, and what's blocking them. Then list approvals waiting on me and anything over budget. End with the three decisions I should make today.

Read only · `paperclip_sync_snapshot`, `paperclip_report_activity`, `paperclip_list_approvals`, `paperclip_report_costs`

### Kick off a project

> I'm starting "[project]". Create a goal for it, break it into 5 to 8 issues, assign each to the best-fit agent as todo, and wake the agents who got work. Show me the plan before you create anything.

Full control · `paperclip_list_agents`, `paperclip_create_goal`, `paperclip_create_issue`, `paperclip_wake_agent`

### End-of-week tidy

> Tidy up my Paperclip for the week: close issues that are finished, comment on anything stuck for more than 3 days asking the assignee what they need, and give me a cost summary.

Full control · `paperclip_list_issues`, `paperclip_update_issue`, `paperclip_comment_issue`, `paperclip_report_costs`

### Cost clamp

> Keep this month under $[amount]: show the current spend and forecast, suggest new budgets per agent, and set the ones I approve.

Full control · `paperclip_report_costs`, `paperclip_list_agents`, `paperclip_set_agent_budget`

### Incident mode

> Something's wrong. Pause every agent except [agent name], list what each paused agent was doing, and tell me what changed in the last hour.

Full control · `paperclip_list_agents`, `paperclip_pause_agent`, `paperclip_report_activity`

## Anything else

For Paperclip features without a dedicated tool, and for checking the connection.

### Use any Paperclip feature

> List the routines in my company. (There's no dedicated tool, so use the Paperclip API.)

Full control · `paperclip_api_request`

Reading needs Read only. Anything that changes data needs Full control and your confirmation.

### Is Papercliped up?

> Is the Papercliped service working right now?

Read only · `papercliped_service_status`

### What can you do?

> What can you do with my Paperclip at my current access level? Give me five examples.

Read only · `paperclip_list_companies`

Got a prompt that works well? Share it in [the community]({{URL}}/community) or open a pull request that adds it to `web/src/content/prompts.json`. Every tool is listed in the [tool reference](/docs/tools).
