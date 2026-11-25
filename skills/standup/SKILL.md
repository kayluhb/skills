---
name: standup
description: Use when the user asks "what's my standup", "what did I do yesterday", "write my standup", or invokes /standup. Builds a yesterday / today / blockers update from Claude Code session history and GitHub PR activity, not just git commits.
---

# Standup

Write the user's daily standup from what they actually did. Git commits miss most of the work: investigations, alert triage, reviews, data pulls, answers to questions. Claude Code session logs record all of it. GitHub records how each piece of work ended up.

| Source | What it gives |
|---|---|
| Claude Code sessions (`~/.claude/projects/*/*.jsonl`) | Every task the user started, with a title, repo, branch, prompts and linked PRs. Includes work with no commit. |
| `gh` PR search | What merged, what is open, what waits on a reviewer, what the user reviewed. |

Git log is not a source. Every commit that matters is in a PR, and the PR state says more.

## Args

`/standup [window]`. With no window, start at 00:00 local time on the previous workday (on Monday that is Friday) and end now. Accept plain words: "since Thursday", "this week", "today".

## 1. Collect (run in parallel)

Turn the window start into a UTC ISO timestamp. Then run all of these at once:

```bash
python3 <this skill's dir>/scripts/sessions.py <SINCE_UTC_ISO>
gh api user -q .login
gh search prs --author @me --updated ">=<SINCE_DATE>" --json url,title,state,repository,isDraft,closedAt,updatedAt --limit 100
gh search prs --reviewed-by @me --updated ">=<SINCE_DATE>" --json url,title,state,repository,author --limit 100
gh search prs --review-requested @me --state open --json url,title,repository,author --limit 50
```

`sessions.py` prints one JSON object per session that had a real user prompt in the window: `cwd`, `branches`, `title`, `prs`, `first`, `last`, `prompt_count` and the first five prompts.

If `gh` is missing or not logged in, go on with sessions only and say so in one line at the end. If `gh search` drops work in an org that its token can't search, the session `prs` field still lists those PR URLs. Look them up with `gh pr view <url> --json state,title,reviewDecision`.

For the open PRs you will list, get `reviewDecision` and the CI rollup in one batch:

```bash
gh pr view <url> --json state,reviewDecision,statusCheckRollup,mergeable
```

## 2. Clean up

- Drop the session that is running this skill, and any other session that only asked for a standup.
- Drop sessions that were pure chores with no result worth saying ("clean my worktrees", "run storybook") unless they are the only work in a repo.
- Name each repo by its GitHub repo name (from a PR URL or `git -C <cwd> remote get-url origin`). A worktree folder such as `pr3515` or `redis-failover-retry` is not a repo name.
- Merge sessions that worked on the same PR, branch or problem into one item. Ten sessions that answer review comments on one PR are one line.

## 3. Write

Group by outcome, not by session. Each bullet says what changed or what the user found, in plain words. Name the PR by short link (`repo#123`). Keep each bullet to one line. Aim for 4–8 bullets under **Yesterday**. Fewer, better bullets beat a full list.

```
**Yesterday**
- Shipped: <thing> (repo#123, merged)
- Investigated <problem>: <finding / what was done>
- Reviewed <n> PRs for <people> (repo#1, repo#2)

**Today**
- <open PR to land, review asked of me, unfinished session thread>

**Blockers**
- <PR waiting on review / changes requested / failing CI / waiting on a person>, or "None"
```

How to fill each section:

- **Yesterday.** Merged PRs and closed issues first. Then work with no PR: investigations, incident and alert triage, data exports, answered questions. The session title and first prompts tell you what it was. Then reviews done for others, as one line with a count.
- **Today.** Open PRs authored by the user. Review requests waiting on the user. Session threads that ended without a result (the last prompts ask for more work, or no PR came out of a code change). Write each as an intent: "Land repo#12", "Finish <x>".
- **Blockers.** Only real ones: changes requested, failing checks, merge conflicts, a PR open more than two days with no review, or a prompt that says the user is waiting on someone. If none, write "None". Never invent one.

Write in the user's voice ("Fixed …", not "The user fixed …"). Plain Markdown that pastes into Slack. No headings beyond the three labels and no preamble.

After the standup, add one short line that says what it was built from, for example "From 31 sessions and 14 PRs since Mon 00:00." If you merged or dropped anything you are unsure about, say so in that line.

## Privacy

Session prompts can hold secrets, customer data and private notes. Use them only to understand the work. Never quote a prompt in the standup, never send session content to an outside service, and print the standup in the terminal only. Post it somewhere else only when the user asks.
