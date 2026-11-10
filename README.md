# Skills

Agent skills by [@kayluhb](https://github.com/kayluhb).

| Skill | What it does |
|---|---|
| [implicit-state-machines](skills/implicit-state-machines/SKILL.md) | Finds implicit state machines in an app (boolean-flag soup, scattered status strings, phase-encoding nulls, job/webhook lifecycles). Proposes fixes that improve UX, DX and AX with zero regression risk. Two reviewer agents must agree on each one. Publishes the list as a shareable page. |
| [kayluhb-review](skills/kayluhb-review/SKILL.md) | Reviews a GitHub PR in its own worktree. Parallel reviewer agents check bugs, security, the repo's own written rules, tests and accessibility; every finding is checked against the code. On your PRs it fixes the findings, runs the checks, commits and replies to open threads. On other people's PRs it posts one review after you approve it. |
| [kayluhb-simplify](skills/kayluhb-simplify/SKILL.md) | Fixes style rules in JS/TS and Python: DRY, nested ifs, destructuring, magic strings, single-letter names, class components. kayluhb-review uses it in analysis-only mode. |
| [asd-ste100](skills/asd-ste100/SKILL.md) | Writes PR text, commit bodies, emails and docs in "80% ASD-STE100" Simplified Technical English. kayluhb-review uses it for everything it posts. |
| [release-video](skills/release-video/SKILL.md) | Turns a release, changelog or set of PRs into a ~60s MP4 of animated title cards for a chosen audience. Keeps one layout and type style, and takes colors and logos from the repo. Renders frame by frame with Playwright and ffmpeg, and checks stills before the full render. |

## Install

**Any agent (Claude Code, Cursor, Codex, ...):**

```sh
npx skills add kayluhb/skills
```

**Claude Code plugin:**

```
/plugin marketplace add kayluhb/skills
/plugin install implicit-state-machines@kayluhb-skills
/plugin install kayluhb-review@kayluhb-skills   # also installs kayluhb-simplify and asd-ste100
/plugin install release-video@kayluhb-skills
```

**Manual:** copy a folder from `skills/` into `~/.claude/skills/` (or your agent's skills folder). kayluhb-review needs `kayluhb-simplify` and `asd-ste100` beside it for its style and writing steps, and skips them if they are missing.

## Use

Run `/implicit-state-machines` in a repo, or ask: "find the implicit state machines in this app".

Run `/release-video` in a repo on its release branch, or ask: "make a video for this release". It needs `node`, `ffmpeg` and Playwright with Chromium.

Run `/kayluhb-review <PR number or URL>` in the PR's repo. It needs the `gh` CLI, logged in.

## License

MIT
