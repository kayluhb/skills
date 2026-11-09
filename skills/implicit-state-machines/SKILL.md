---
name: implicit-state-machines
description: Use when the user asks to find implicit state machines, audit app state or status handling, untangle boolean-flag soup (isLoading/isError/hasData), find impossible or unreachable states, or runs /implicit-state-machines. Covers frontend, backend, jobs, webhooks, and DB status columns.
---

# Implicit State Machines Audit

## Overview

Find every place where the app has a state machine that is not written as one. Propose the change that improves **UX, DX, and AX (agent experience) together** with **zero regression risk**. Two independent reviewers must agree on each proposal. Publish the agreed list as a shareable page.

This is an audit. Do not edit app code unless the user asks for it after seeing the page.

## Scope

- "The app" means the current repo. If it is a monorepo with several apps, and the user did not name one, ask which apps to cover.
- Read CLAUDE.md / AGENTS.md and any existing state libraries (XState, Zustand, reducers, enums) first. Proposals must follow the patterns the repo already uses.

## Step 1: Find candidates

Look for these signals:

| Signal | Example |
|---|---|
| Several booleans that describe one thing | `isLoading`, `isError`, `isSubmitted`, `hasData` |
| Status strings compared in many places | `if (order.status === 'pending' \|\| ...)` spread over files |
| Nullable fields that mean a phase | `completedAt == null` means "in progress" |
| Effect / callback chains that move between steps | `useEffect` that sets state that triggers another `useEffect` |
| Multi-step flows | wizards, onboarding, checkout, auth, upload, import |
| Retry, polling, timeout, cancel logic | hand-rolled `attempts`, `setTimeout` loops |
| DB status columns written from many places | no transition guard, no check constraint |
| Async lifecycles across processes | webhooks, queues, cron jobs, Durable Objects, workflows |

Use parallel Explore agents for a large repo (one per app or layer). Read the real code for every candidate before you keep it.

## Step 2: Write one finding per machine

Each finding has these parts, in this order:

1. **Name and location** — `file:line` for each place the state is read or written.
2. **Current states and transitions** — include impossible states that the code can reach today (for example `isLoading && isError`).
3. **Concrete problem** — a real failure scenario: inputs or events → wrong result. No hypotheticals.
4. **Proposal** — the simplest form that works: discriminated union, reducer, transition table, DB check constraint, or a state library only if the repo already uses one or the machine is large.
5. **UX / DX / AX gain** — one line each. AX = how much easier the code is for an agent to read, change, and verify (explicit states, one source of truth, typed transitions).
6. **Regression risk and proof** — what could break, and the test or check that proves it does not. If you cannot name the proof, the risk is not zero.
7. **Effort** — S / M / L.

Drop a candidate if the proposal cannot improve all three of UX, DX, AX, or if it cannot reach zero regression risk.

## Step 3: Two-reviewer consensus

Dispatch two reviewer subagents in parallel, in one message. Give each one the full findings list and the file paths. Do not give them your opinion of the findings.

- **Reviewer A — correctness and regression.** For each finding: is the machine real, is the failure scenario real, can the proposal break any caller, test, persisted data, or API contract?
- **Reviewer B — value and simplicity.** For each finding: does it improve UX, DX, and AX? Is there a simpler change? Does it match repo patterns?

Each reviewer returns, per finding: `APPROVE`, `REVISE` (with the change), or `REJECT` (with the reason and code evidence).

Consensus rules:
- Both `APPROVE` → keep.
- Any `REVISE` or `REJECT` → check the code yourself, change or drop the finding, then send the changed finding back to the reviewer who objected. Repeat until both approve.
- After 2 rounds without agreement → move the finding to "Not included", with both positions.

## Step 4: Publish the page

Publish an Artifact (follow the Artifact tool's quickstart and design steps). The page contains:

1. Summary — app(s) covered, count of findings kept / rejected, top 3 by impact-to-effort.
2. One card per agreed finding with all parts from Step 2, plus a small current-vs-proposed state diagram.
3. Suggested order of work (low effort, high impact first).
4. "Not included" — rejected candidates and the reason, so nobody re-audits them.
5. Method note — the date, the commit SHA, and that two reviewers agreed on each item.

Give the user the link and a short summary in chat. Then offer to implement selected findings (one branch or worktree per finding, tests first).

## Common Mistakes

- Proposing XState everywhere. Most fixes are a discriminated union or a reducer.
- Keeping findings with "could cause" problems and no concrete scenario.
- Changing persisted status values or API response shapes. That is a regression risk; flag it as a separate migration instead.
- Giving reviewers your conclusions. They confirm what they are told; give them the code and the findings only.
- Stopping at the frontend. Backend status columns and job lifecycles are often the worst machines.
