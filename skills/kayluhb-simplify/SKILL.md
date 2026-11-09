---
name: kayluhb-simplify
description: Use when reviewing and cleaning up JS/TS or Python code for style violations - DRY, nested ifs, nested dependencies, destructuring/unpacking, magic strings, single-character variables, class components. Trigger on /kayluhb-simplify with optional branch name.
---

# Simplify Code

Full code simplification pipeline: (branch mode) run built-in simplify, then collect files, dispatch parallel subagents to fix violations, run checks, commit. **All steps run every time.**

## Args

```
/kayluhb-simplify                           # review all source files in repo
/kayluhb-simplify <branch>                  # review only files changed on <branch> vs its base
/kayluhb-simplify <branch> --base=<ref>     # explicit base ref to diff against (e.g. origin/release/v2026.08.06)
/kayluhb-simplify <branch> --analyze        # analysis-only: return edits, apply nothing
```

**Base ref resolution (branch mode):** never hardcode `main`. Resolve in this order:
1. Explicit `--base=<ref>` arg (a caller like `kayluhb-review` that already knows the PR's `baseRefName` should always pass this).
2. Otherwise, auto-detect via `gh pr view <branch> --json baseRefName -q .baseRefName` — if `<branch>` has an open PR, diff against *its* target branch, not `main`.
3. Otherwise (no `--base`, no open PR found), fall back to `origin/main` and say so in the report — don't fail silently.

A PR's real base is frequently a release branch, not `main` — diffing against the wrong one either pulls in an unrelated parent branch's changes (base too old) or silently scans the whole repo (base too new/unrelated). See the Pitfalls section.

**Analysis-only mode** (`--analyze`): Collect the style-rule edits and return them as a structured list — do NOT apply, check, or commit. Used by `kayluhb-review` to merge style edits with correctness fixes in one combined pass. Steps 1 (built-in simplify), 6 (checks), and 7 (commit) are skipped entirely in this mode, and step 4 subagents collect edits without applying them.

## Rules

Applies to JS/TS (`*.ts`, `*.tsx`, `*.js`, `*.jsx`) and Python (`*.py`). Apply each rule in the language of the file. Skip test files: `*.test.*` and `*.spec.*` (JS/TS); `test_*.py`, `*_test.py` and `conftest.py` (Python).

| Rule | JS/TS violation → fix | Python violation → fix |
|---|---|---|
| **DRY** | Same logic block repeated 2+ times → extract to shared function in same file | Same |
| **No nested ifs** | `if (a) { if (b) { ... } }` → early return: `if (!a) return; if (!b) return;` | `if a:` → `if b:` → body → guard clauses (`if not a: return` / `continue`), or combine with `and` |
| **No nested deps** | `if (a && a.b && a.b.c)` or deep callback chains → optional chaining `a?.b?.c` | `if a and a.b and a.b.c`, `d.get("x", {}).get("y", {}).get("z")` chains → guard clause, or a small helper that walks the path |
| **Destructuring / unpacking** | `const x = obj.x; const y = obj.y` → `const { x, y } = obj` | `x = pair[0]; y = pair[1]` → `x, y = pair` |
| **No magic strings** | `if (status === 'active')` in logic → `const STATUS_ACTIVE = 'active'` at top of file | `if status == "active":` in logic → existing `constants`/`Enum` member, else an `UPPER_SNAKE` constant at module top |
| **No single-char vars** | `const e = event`, `const d = data`, `(r) =>` → `const error = event`, `const result = data` | `e = event`, `lambda r: ...`, `for c in colorways` → `error = event`, `for colorway in colorways` |
| **Functional components** (JS/TS only) | React class component (`class Foo extends Component`) → function component with hooks | n/a |

**Exceptions:** `i`, `j`, `k` loop indices in numeric loops (`for` / `for ... in range(...)`) are acceptable. In Python, `_` for discarded values and `TypeVar`s (`T`, `_T`) are acceptable too.

**DRY scope:** Extract shared functions only within the same file. Do NOT create new files or move code across files — cross-file refactoring risks import cycles.


## Steps

### 1. Run built-in simplify first (branch mode only; skip in analysis-only mode)

In **branch mode** (and only when NOT in analysis-only mode), invoke the Skill tool with `skill: "simplify"` before anything else. The built-in `/simplify` reviews the changed code for reuse, altitude, and efficiency cleanups and applies them, so the style rules below operate on already-cleaned code.

Skip this in **repo mode** or **analysis-only mode** — in repo mode it's a no-op across a full-repo scan; in analysis-only mode the working tree must stay pristine for the caller to apply all edits in one pass.

### 2. Collect files

**Repo mode:**
```bash
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" \) \
  ! -name "*.test.*" ! -name "*.spec.*" ! -name "test_*.py" ! -name "*_test.py" ! -name "conftest.py" \
  ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/.cache/*" ! -path "*/build/*" \
  ! -path "*/.venv/*" ! -path "*/.worktrees/*" ! -path "*/__pycache__/*"
```

**Branch mode:** write the branch's diff to a scratchpad file, filtered by pathspec — not by a separate prose instruction that can be skipped. Resolve `BASE_REF` per the rules above, then **always diff against `origin/<base>`, never a local branch ref** — a stale local branch (behind its `origin/` counterpart) silently pulls in every commit merged since your last fetch, inflating a small change into a full-branch diff:

```bash
BASE_REF="<--base value if the caller passed one>"
if [ -z "$BASE_REF" ]; then
  DETECTED_BASE=$(gh pr view "<branch>" --json baseRefName -q .baseRefName 2>/dev/null)
  BASE_REF="origin/${DETECTED_BASE:-main}"
fi
git fetch origin "${BASE_REF#origin/}"
BRANCH_REF=origin/<branch>; git rev-parse --verify "$BRANCH_REF" >/dev/null 2>&1 || BRANCH_REF=<branch>
BRANCH_SAFE=$(echo "<branch>" | tr '/' '-')
git diff "$(git merge-base "$BASE_REF" "$BRANCH_REF")...$BRANCH_REF" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' \
  ':!*.test.*' ':!*.spec.*' ':!*/test_*.py' ':!test_*.py' ':!*_test.py' ':!*conftest.py' \
  > <scratchpad>/simplify-<BRANCH_SAFE>.diff
```

`BRANCH_REF` prefers the pushed `origin/<branch>` (freshest); it only falls back to the local branch name if the branch hasn't been pushed yet. `BASE_REF` itself is never a bare local ref — always `origin/<base>`, and `<base>` is resolved (not assumed to be `main`) before the fetch.

Read only `git diff --stat` (same revision range and pathspec) — it gives the changed-file list and per-file changed-line counts for chunking. Never read the diff itself into the main context.

**Empty diff → nothing to simplify.** Report "no changes" and stop; skip steps 3-8.

### 3. Chunk files

**Repo mode:** split the file list into up to 5 groups of roughly equal total line count (`wc -l` on each file). **3 or fewer files → a single group.**

**Branch mode:** split the `--stat` file list into up to 5 groups of roughly equal *changed*-line count (the `--stat` numbers, not full-file `wc -l`) — a 400-line file with a 5-line change should barely count. **3 or fewer files → a single group** — per-subagent spin-up dominates on small batches.

### 4. Dispatch fix subagents (parallel)

Rule scanning is mechanical checklist work — it doesn't need the top model. Launch one subagent per group in **parallel** via the Agent tool (`subagent_type: "general-purpose"`, **`model: "sonnet"`**). Don't create new files, don't touch test files, keep DRY extractions within the same file.

- **Repo mode:** each subagent gets its file list and the rules table, and scans/fixes the full file (there's no diff baseline in repo mode).
- **Branch mode:** each subagent gets its group's file list **and** the scratchpad diff path, plus: *"Read `<scratchpad>/simplify-<BRANCH_SAFE>.diff`. Only flag or fix violations in lines added or modified in this diff — never touch or flag pre-existing code that wasn't changed, even if it's visible as diff context or in the rest of the file."* This is what keeps token cost proportional to the actual change instead of the full file size.

Apply/return behavior:
- **Normal mode:** subagents apply their fixes **directly with the Edit tool** (groups are disjoint, so parallel edits can't conflict) and return per-rule fix counts plus the files they changed — no edit-list round-trip through the main context.
- **Analysis-only mode:** subagents apply nothing and return `{ file, old_string, new_string }` edits (one per fix) plus per-rule counts. **Single group → scan it inline yourself** instead of dispatching a subagent.

### 5. Collect results

**Analysis-only mode:** return the full collected edit list to the caller as `{ edits: [{file, old_string, new_string}], counts: {dry, nested_ifs, nested_deps, destructuring, magic_strings, single_char_vars, class_components} }`.

**Normal mode:** edits were already applied by the step 4 subagents. Aggregate their per-rule counts and any skips they report.

### 6. Run checks (skip in analysis-only mode)

Run the checks for each language the edits touched, all **concurrently** (separate parallel Bash calls, not `&&`-chained — they're independent and the chain serializes them).

**JS/TS:**
```bash
pnpm typecheck    # parallel call 1
pnpm lint         # parallel call 2 (or biome)
```

**Python** (on the changed files only; use the project's runner, e.g. `poetry run`, and its `pyproject.toml` config):
```bash
poetry run black --check <files> && poetry run isort --check-only <files>   # parallel call 3 (formatting, as CI runs it)
poetry run mypy <files>                                                     # parallel call 4
poetry run pylint <files>                                                   # parallel call 5
```

Judge mypy/pylint by whether the edits added new errors — compare against the same files at the base ref if the count is non-zero. Pre-existing errors are not this skill's job.

Fix failures directly (don't re-dispatch subagents). Re-run only the failed check until clean.

### 7. Commit (skip in analysis-only mode)

Stage only modified source files. New commit, never amend. Skip if nothing changed.

```
chore: simplify code — DRY, flatten conditionals, destructuring, named constants, functional components
```

### 8. Report

**Analysis-only mode:**
```
## Simplify analysis: <branch> vs <BASE_REF> (<N> files reviewed)
Edits collected: N — not applied (analysis-only mode)
- DRY: N
- Nested ifs: N
- Nested deps: N
- Destructuring / unpacking: N
- Magic strings: N
- Single-char vars: N
- Class components: N
Note: built-in /simplify (reuse/altitude/efficiency) skipped in analysis-only mode.
```

**Normal mode:**
```
## Simplify: <mode> vs <BASE_REF> (<N> files reviewed)   (branch mode only; omit "vs <BASE_REF>" in repo mode)

### Violations fixed
- DRY: N
- Nested ifs flattened: N
- Nested deps simplified: N
- Destructuring / unpacking applied: N
- Magic strings named: N
- Single-char vars renamed: N
- Class components converted: N

### Skipped
- <file>: <reason> (e.g. edit conflict, false positive)

### Checks
- JS/TS — Typecheck: pass/fail · Lint: clean / N warnings
- Python — Format (black + isort): pass/fail · mypy: no new errors / N new · pylint: no new warnings / N new
- (omit a language's line if no files in it changed)

### Commit
- <hash> or "no changes"
```

## Pitfalls

- DRY: extract within same file only — no new files, no cross-file moves
- Magic strings: conditional logic only, not display text or log messages
- Analysis-only edits are applied later by the caller against the pristine tree — `old_string` must match the file exactly as it is now
- Never amend commits; never touch test files
- Functional components: preserve all behavior and state when converting class components — use `useState`/`useEffect`/`useRef` as needed to replace lifecycle methods
- Python magic strings: entity/document field names used as dict keys (`event["status"]`) follow the surrounding code's convention — don't extract them unless the module already names them in `constants`
- **Analysis-only mode:** never apply edits, run checks, or commit — return the edit list verbatim for the caller to merge and apply
- **Branch mode is diff-scoped, not file-scoped:** step 2's pathspec (JS/TS + `*.py`, minus `*.test.*`/`*.spec.*`/`test_*.py`/`*_test.py`/`conftest.py`) filters tests and unsupported file types directly in the `git diff` command, and step 4 subagents are told to flag only changed lines — a large file with a tiny diff should cost tiny tokens, not a full-file scan. If a run still spins up subagents that burn tokens disproportionate to the changed-line count, the diff file or subagent prompt lost the scoping — fix the command/prompt, don't just re-run.
- **Never diff against local `main`.** `git merge-base main <branch>` succeeds even when local `main` is weeks stale — it doesn't error, so a naive `local-ref-first, fall back on error` pattern never falls back and silently diffs against a merge-base that's dozens of commits behind `origin/main`, turning a tiny PR into a full-branch scan. Step 2 always fetches and diffs against `origin/<base>`; if you ever see a branch-mode `--stat` file count that looks too big, check whether `origin/<base>` is actually current (`git rev-list --count <base>..origin/<base>`) before assuming the branch itself is large.
- **Never hardcode `main` as the base.** A PR's real target is often a release branch (e.g. `release/v2026.08.06`) or another feature branch (stacked PRs). Diffing a release-targeted branch against `origin/main` doesn't error — it just silently diffs against the wrong merge-base, which can look like either a much bigger or a much smaller change than the PR actually is, and every finding will be scoped to the wrong set of files. Always resolve `BASE_REF` (explicit `--base`, then `gh pr view --json baseRefName`, then `main` as last resort) before diffing — never skip straight to `origin/main`.
