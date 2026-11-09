# Skills

Agent skills by [@kayluhb](https://github.com/kayluhb).

| Skill | What it does |
|---|---|
| [implicit-state-machines](skills/implicit-state-machines/SKILL.md) | Finds implicit state machines in an app (boolean-flag soup, scattered status strings, phase-encoding nulls, job/webhook lifecycles). Proposes fixes that improve UX, DX and AX with zero regression risk. Two reviewer agents must agree on each one. Publishes the list as a shareable page. |

## Install

**Any agent (Claude Code, Cursor, Codex, ...):**

```sh
npx skills add kayluhb/skills
```

**Claude Code plugin:**

```
/plugin marketplace add kayluhb/skills
/plugin install implicit-state-machines@kayluhb-skills
```

**Manual:** copy `skills/implicit-state-machines/` into `~/.claude/skills/` (or your agent's skills folder).

## Use

Run `/implicit-state-machines` in a repo, or ask: "find the implicit state machines in this app".

## License

MIT
