---
name: kayluhb-review
description: Use when reviewing a GitHub pull request or when the user invokes /kayluhb-review with a PR URL or number.
---

# Review PR

Full PR review: worktree → simplify-analysis + parallel review subagents → verify → merge edits → checks → commit → post review + reply → report. **Every step runs every time** — but steps with nothing to do are skipped, and independent work runs concurrently, never back-to-back.

This skill is generic: it runs in any repository. Nothing in it may assume a particular project's package manager, layout or rules — those come from the repository itself (its instruction files and scripts), discovered at run time.

## Identity

The user is whoever `gh` is logged in as. Get the login once, in step 0's batch — never hardcode a username or email in this file:

```bash
gh api user -q .login
```

A PR is the **user's PR** when its `.author.login` equals that login.

## Dependencies

This skill calls two sibling skills: `kayluhb-simplify` (step 2's style analysis) and `asd-ste100` (writing style). If either is not installed, skip the part that uses it and say so in the report — do not fail the review.

## Args

`/kayluhb-review <PR_URL_or_number>` — extract number from `.../pull/123` or use directly.

## Writing style

Every piece of prose this review publishes to GitHub follows the `asd-ste100` skill: the commit message body (step 7), the posted review and comment replies (step 8), issue bodies (step 9), and any PR description update. Invoke the Skill tool with `skill: "asd-ste100"` once, before you write the first of these, and apply its rules and checklist to each one. Its "keep exactly as they are" list protects the fixed parts: the `chore: review + simplify` subject, the `Reviewed-by: kayluhb-review` trailer, the issue template headings, code snippets, and `file:line` references.

## Steps

### 0. Fetch PR metadata and threads in one shot

These run in the **same message** — all need only the PR number:

```bash
gh api user -q .login
gh pr view <n> --json author,headRefName,headRefOid,baseRefName,title,body,state,number
gh pr view <n> --comments
gh api graphql --paginate -F owner='{owner}' -F repo='{repo}' -F n=<n> -f query='
  query($owner:String!,$repo:String!,$n:Int!,$endCursor:String){
    repository(owner:$owner,name:$repo){pullRequest(number:$n){
      reviewThreads(first:100,after:$endCursor){
        pageInfo{hasNextPage endCursor}
        nodes{isResolved isOutdated path line
          comments(first:50){nodes{databaseId author{login} body}}}}}}}'
```

- `gh pr view --comments` gives the conversation comments and review summaries.
- The GraphQL call gives the **inline review threads with their resolved state** — the REST `pulls/<n>/comments` endpoint has no resolved flag and returns only 30 comments per page, so do not use it to find open threads.

Compare `.author.login` with the `gh api user` login and remember the result (**user's PR** vs **teammate's PR**) — later steps branch on it. Remember `headRefName`, `headRefOid`, `baseRefName`. Write the PR title and body to `<scratchpad>/pr<n>-context.md` (step 3's reviewers read it).

### 1. Pick the working tree (before anything reads or edits files)

Never assume the current checkout is on the PR branch. Reviewers read surrounding code, step 4 reads files to verify findings, and steps 5–7 edit, commit and push — all of these must see the PR's code, not whatever branch happens to be checked out.

```bash
git fetch origin <baseRefName> <headRefName>
git branch --show-current
git worktree list
```

Choose `<wt>`, in this order:

1. A worktree from `git worktree list` already on `headRefName` → use it.
2. The current checkout is on `headRefName` → use it.
3. Otherwise create one:
   - **User's PR:** `git worktree add .claude/worktrees/pr<n> <headRefName>` (or `-b <headRefName> ... origin/<headRefName>` if no local branch exists).
   - **Teammate's PR:** `git worktree add --detach .claude/worktrees/pr<n> origin/<headRefName>` — report-only mode never commits, so a detached checkout is enough.

Then, for a user's PR, confirm `<wt>` is clean (`git -C <wt> status --porcelain` empty) and matches the remote (`git -C <wt> pull --ff-only`). If it is dirty or has diverged, stop and ask — never stash, reset or mix review edits with uncommitted work.

A newly created worktree has no installed dependencies. Before step 6's checks, install them with the repository's own package manager (detect it from the lockfile).

**From here on, every file read, edit, check, commit and push happens in `<wt>`**, and every subagent prompt states `<wt>` as its working directory.

### 2. Decide the review scope, write the diff, start simplify-analysis

**Re-review guard (incremental scope):**

```bash
git -C <wt> log -1 --format=%H --grep='^Reviewed-by: kayluhb-review$' origin/<baseRefName>..origin/<headRefName>
```

- **No reviewed commit** → full review. `<from>` = `$(git merge-base origin/<baseRefName> origin/<headRefName>)`.
- **Reviewed commit `<R>` is the head commit** → no new code since the last review. Say so and ask whether to run a full review anyway. If the run is unattended, skip steps 3–7 and only handle comments (step 8).
- **Reviewed commit `<R>` with commits after it** → incremental review. `<from>` = `<R>`, but limit the diff to files the PR itself changes, so a merge of the base branch into the PR does not pull unrelated code into scope.

Write the diff to scratchpad files — never read it into the main context. Pasting a diff into a subagent prompt makes the main agent *generate* it as output tokens (the most expensive kind); a file the subagent Reads costs only cheap input tokens.

**Diff filenames must be PR-scoped.** The scratchpad is session-scoped, so several reviews running concurrently in one session share it. A fixed name like `full.diff` gets silently overwritten by a sibling review. Always include the PR number:

```bash
PR_FILES=$(git -C <wt> diff --name-only $(git -C <wt> merge-base origin/<baseRefName> origin/<headRefName>) origin/<headRefName>)
git -C <wt> diff --stat <from> origin/<headRefName> -- $PR_FILES
git -C <wt> diff <from> origin/<headRefName> -- $PR_FILES > <scratchpad>/pr<n>-full.diff
UI_FILES=$(printf '%s\n' $PR_FILES | grep -E '\.(tsx|jsx|vue|svelte|html|css|scss)$')
[ -n "$UI_FILES" ] && git -C <wt> diff <from> origin/<headRefName> -- $UI_FILES > <scratchpad>/pr<n>-ui.diff
```

Run these in one Bash call (the later commands reuse `PR_FILES`). An empty `UI_FILES` means no UI changed — skip accessibility.

The base is always `origin/<baseRefName>` — **stacked PRs target another branch**, and diffing them against `main` pulls in the parent PR's changes.

Read only the `--stat` output: it gives the changed-line count (step 3's dispatch mode) and the changed-file list (which dimensions apply). **Sanity-check:** the file list in `pr<n>-full.diff` must match the `--stat` output. If it doesn't, another agent clobbered the file — regenerate it.

**Simplify-analysis (user's PRs only, background).** Dispatch one subagent (Agent tool, `subagent_type: general-purpose`, `run_in_background: true`):

> Work in `<wt>` — `cd` there first; every file you read must be under it. Invoke the Skill tool with `skill: "kayluhb-simplify"` and `args: "<headRefName> --base=origin/<baseRefName> --analyze"`. Run the full pipeline in analysis-only mode — collect style-rule edits across the branch's changed files (diffed against `origin/<baseRefName>`, not `main`) but apply nothing, run no checks, make no commit. Return the full edit list and per-rule counts.

On an incremental re-review, simplify still runs against the full PR base: its earlier edits are already applied, so it only finds what the new commits added. Teammate's PR → skip simplify.

Do not wait for simplify. Dispatch review subagents (step 3) as soon as the diff is written. The working tree stays pristine (nothing applied), so verification can start the moment the first reviewer lands.

### 3. Dispatch review subagents (parallel)

**Tiny-PR fast path:** if the stat shows **<300 changed lines**, dispatch **one combined subagent** covering all applicable dimensions — spin-up overhead dominates on small diffs.

Otherwise, launch all applicable subagents **in a single message** (`subagent_type: general-purpose`, `run_in_background: true` — so step 4 verifies each as it lands).

| Subagent | Focus | Model | Diff file | Include when |
|---|---|---|---|---|
| Code quality | Bugs, logic, naming, silent failures, swallowed errors; does the change do what the PR description says | default | `pr<n>-full.diff` | Always |
| Security | Injection, secrets, OWASP, auth | default | `pr<n>-full.diff` | Always |
| Project rules | The repository's own written rules — see prompt below | default | `pr<n>-full.diff` | The repo has instruction files (see below) |
| Test coverage | Missing tests, weak assertions | `haiku` | `pr<n>-full.diff` (needs impl + test changes together) | Test or tested code changed |
| Accessibility | WCAG 2.1 AA — see prompt below | `haiku` | `pr<n>-ui.diff` | UI files changed |

Decide inclusion from the `--stat` file list (e.g. no UI files changed → skip accessibility).

**Base prompt for every reviewer** — pass file paths, never paste diff content, never tell subagents to run `git diff` themselves:

> Your working directory is `<wt>`, a checkout of PR #<n>'s branch; read surrounding code from there and nowhere else. Read `<scratchpad>/pr<n>-context.md` for what the PR is meant to do, then `<scratchpad>/pr<n>-<slice>.diff` — the diff for PR #<n>, already fetched and filtered. Review it for [dimension focus]. Only flag lines the diff adds or changes. Return findings as: `file:line`, exact verbatim snippet (1-5 lines), reason. If the diff's contents plainly belong to a different PR than #<n>, stop and report that instead of reviewing it.

**Every finding must carry** `file:line`, the **exact code snippet** (verbatim, 1-5 lines), and why it's a problem. Findings without a verbatim snippet are discarded unverified.

**Project rules prompt (append):** Instruction files are any of `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.github/copilot-instructions.md`, `.cursor/rules/*`, at the repo root and in each directory on the path to a changed file. Read them. List the rules that apply to the changed files — especially rules about migrations, schema, SQL, data access, cost, config, deployment and naming, which a general review misses. Check the diff against each listed rule. Cite the rule (file + heading or line) with each finding.

**Accessibility prompt (append):** Check WCAG 2.1 AA — no `<div onClick>`, inputs have labels, images have `alt`, icon-only buttons have accessible names, keyboard nav (focusable, visible focus, logical tab order, Esc closes dialogs), focus trap + restore in dialogs/menus, no heading skips, contrast ≥4.5:1 text / 3:1 large+UI, color not sole signal, valid `aria-*` IDs, live regions for async status, respects `prefers-reduced-motion`.

### 4. Verify every finding (incrementally, as reviewers land)

**Two-pass verification per finding:**
1. `grep -F` each snippet's most distinctive line against `<scratchpad>/pr<n>-full.diff` — batch all findings into one Bash call. No match → the PR didn't touch that code; discard.
2. Read `<wt>/<file>` at `line` and confirm the snippet matches. Discard false positives — trust the code, not the subagent or commenter.

Verify each subagent's batch **as soon as it returns**, while slower reviewers are still running.

- Snippet doesn't match the file → stale or hallucinated; discard.
- **>10 findings in a batch** → group by file and verify in parallel subagents on `haiku` (each gets `<wt>` plus its batch of `{file, line, snippet, claim}` and returns confirmed/refuted per finding, citing the real code). Spot-check anything a verifier confirms without quoting the code.

### 5. Merge edits and apply (user's PRs only)

- **Teammate's PR** → change nothing. Skip to step 8.
- **User's PR** → wait for simplify-analysis and all reviewers, then proceed.

Collect:
- **Simplify edits:** the `{file, old_string, new_string}` list from simplify-analysis (empty if skipped).
- **Review fixes:** every verified finding from step 4 — including ones that would usually count as "out of scope" or "follow-up" (pre-existing lines the PR's own fix also applies to, missing tests, a11y gaps). The user's bar for "too large to fix now" is high: attempt the fix even when it looks like a real refactor. Only a finding that needs a decision only the user can make is raised with them instead — never deferred silently, never filed as an issue.

Apply in a single pass in `<wt>`, file by file. Conflict rule: if a simplify edit and a review fix overlap in the same file, **the review fix wins** (correctness over style) — log the dropped simplify edit. Stale `old_string` → skip and log.

### 6. Run checks (only if step 5 applied any edits)

**No edits → skip this step and step 7's commit.**

Find the repository's own check commands — instruction files first, then the scripts in its manifest (`package.json`, `Makefile`, `pyproject.toml`, `justfile`, …). Run typecheck, tests and lint **concurrently** as separate parallel Bash calls in `<wt>`, not `&&`-chained.

**Scope tests to what changed** when the repo is a monorepo and its tooling supports it (e.g. `pnpm --filter <pkg>`, `turbo --filter`, `nx affected`, `cargo test -p`): run the packages the diff touches, and everything if a shared or root package changed. Full-repo test runs are slow and can be flaky when packages share a runner. Typecheck and lint are usually cheap enough to run whole.

Treat warnings as errors. Fix and re-run only the failed check.

### 7. Commit + push (user's PRs only)

Stage only files touched by step 5. New commit (never amend). Push to the PR branch (never force).

Skip the commit if step 5 applied no edits. Still push if there are unpushed commits on the branch.

```
chore: review + simplify

<N> style fix(es), <N> correctness fix(es)

Reviewed-by: kayluhb-review
```

The `Reviewed-by: kayluhb-review` trailer is what step 2's re-review guard looks for.

### 8. Post the review and reply to threads

**Teammate's PR — post the findings, after the user approves.** Findings the author never sees can't be addressed. Show the user the verified findings and the draft review, then post them as **one** review with inline comments:

```bash
gh api repos/{owner}/{repo}/pulls/<n>/reviews --input <scratchpad>/pr<n>-review.json
# {"commit_id":"<headRefOid>","event":"COMMENT","body":"<summary>",
#  "comments":[{"path":"<file>","line":<line>,"side":"RIGHT","body":"<finding>"}]}
```

An inline comment must sit on a line inside a diff hunk, or GitHub rejects the whole review with 422. Put any finding outside the hunks in the review `body` instead. Use `event: "COMMENT"` unless the user asks for `REQUEST_CHANGES` or `APPROVE`.

**Every PR — reply to open threads.** Use step 0's GraphQL result: reply only to threads with `isResolved: false`. For each one — confirm the fix (with the commit hash), explain why it's not an issue, or answer the question. Reply to the thread's first comment (`databaseId`):

```bash
gh api repos/{owner}/{repo}/pulls/<n>/comments/<databaseId>/replies -f body="<reply>"
```

Answer open questions in conversation comments (from `gh pr view --comments`) with `gh pr comment <n> --body "<reply>"`. Send replies after step 7's push so they can reference the commit hash; batch independent replies in one message.

### 9. Issues — only for findings still open at merge

**User's PR → never create issues during the review.** Every verified finding was fixed in step 5 or raised with the user. Do not call `gh issue create` from this skill on a user's PR, whatever else this file says. The user has corrected this repeatedly ("no new issues. fix in the PR"; "do not create a new issue. fix them here").

**One exception — merging with findings left open.** If the user (or an agent orchestrating several reviews) merges a PR while a verified finding is still unfixed — typically out-of-scope code the PR didn't touch — file a `tech-debt` issue for each, so nothing is lost. Better: fix them before the merge so the list stays short.

**Teammate's PR** → only for verified findings from the step 8 review that the author has not addressed by merge time, and only when the user asks to file them:

```bash
gh issue list --search "<keyword>"   # search first — don't create duplicates
gh issue create \
  --repo {owner}/{repo} \
  --title "<short imperative title>" \
  --body "$(cat <<'EOF'
## Context
Found during review of PR #<n>: <PR title>

## Problem
<1-3 sentences>

## Location
`<file>:<line>`

## Suggested fix
<suggestion or "TBD">
EOF
)" \
  --label "tech-debt"   # or "bug", "security"; skip if label doesn't exist
```

After creating one, reply to the related review comment with the issue URL.

### 10. Report

```
## PR #<n>: <title>
Scope: full | incremental since <R short sha> (<N> files)
Worktree: <wt>
Overview: <2-3 sentences>
Subagents: N reported / N confirmed / N false positives
Simplify: N style edits collected / N applied / N dropped (conflict)
Threads: N open → N replied / N resolved-skipped
Checks: typecheck ✓ / tests X/Y (<scope>) / lint ✓ (or "skipped — no edits")
CI: <`gh pr checks <n>` summary — passing / failing (names) / pending>
Actions: fixed [list], commit <hash>, review posted <url>, replied to N
Issues created: #<n> <title>, ... (or "none")
```

Always run `gh pr checks <n>` for the CI line, even when no edits were made — a red CI on an untouched PR is still news.

## Pitfalls

- Check authorship before touching anything
- Pick `<wt>` (step 1) before reading or editing any file — the current checkout is often on an unrelated branch with uncommitted work, and verifying or editing there silently uses the wrong code
- Every subagent prompt names `<wt>` as its working directory, including simplify-analysis
- Load `asd-ste100` before you write the commit body, review, replies, issues, or a PR description update — not after, as a rewrite pass
- Verify every finding by reading code — never blindly apply subagent or commenter reports
- Stay scoped to the PR; never amend or force-push; never stash or reset a dirty worktree
- Fetch once, in step 1 — never again later in the run
- Find open threads with GraphQL `reviewThreads.isResolved`, not the REST comments endpoint (no resolved flag, 30 per page)
- The diff lives in scratchpad files — subagents Read it from there; never paste diff content into prompts or read `pr<n>-full.diff` into the main context
- Diff filenames are PR-scoped (`pr<n>-full.diff`) because the scratchpad is shared across concurrent reviews
- Diff against `origin/<baseRefName>`, not a hardcoded `origin/main` — stacked PRs have a different base. This applies to **both** the step 2 diff **and** the `--base=origin/<baseRefName>` passed to simplify-analysis
- An incremental diff is limited to the PR's own files, so a base-branch merge into the PR doesn't pull unrelated changes into review
- Keep the skill generic: check commands, test scoping and project rules come from the repository at run time, never from this file
- Running checks from a git worktree can hit a build cache entry populated by a *different* worktree and report success without compiling anything (e.g. turbo's `FULL TURBO`); if a check reports a full cache hit, re-run it with the tool's force flag before believing it
- Conflict rule: review fix wins over simplify edit on the same lines; log what was dropped
- On the user's own PRs, never file GitHub issues during the review — fix in the PR, or ask if a decision is needed. The only issues are for findings still open at merge (step 9)
- Teammates' PRs: post findings only after the user approves the draft review
- `Reviewed-by: kayluhb-review` trailer is the re-review guard signal — always include it in the commit
