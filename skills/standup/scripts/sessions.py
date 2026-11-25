#!/usr/bin/env python3
"""Summarise Claude Code sessions active in a time window, as JSON.

Usage: sessions.py SINCE_ISO [UNTIL_ISO]
Reads ~/.claude/projects/*/*.jsonl (top-level sessions only, not subagents).
Per session: project dir, branch, title, PRs, first-to-last activity time,
count of real user prompts, and the first few prompts (trimmed).
"""
import json, sys, glob, os
from datetime import datetime, timezone

def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))

def prompt_text(msg):
    c = msg.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        if any(p.get("type") == "tool_result" for p in c):
            return ""
        return " ".join(p.get("text", "") for p in c if p.get("type") == "text")
    return ""

def noise(t):
    t = t.strip()
    return (not t or t.startswith("<") or t.startswith("Caveat:")
            or t.startswith("[Request interrupted"))

since = ts(sys.argv[1])
until = ts(sys.argv[2]) if len(sys.argv) > 2 else datetime.now(timezone.utc)
root = os.path.expanduser("~/.claude/projects")
out = []
for f in glob.glob(os.path.join(root, "*", "*.jsonl")):
    if datetime.fromtimestamp(os.path.getmtime(f), timezone.utc) < since:
        continue
    s = {"cwd": None, "branches": set(), "title": None, "prs": set(),
         "first": None, "last": None, "prompts": []}
    with open(f, errors="replace") as fh:
        for line in fh:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            t = e.get("type")
            if t in ("ai-title", "custom-title"):
                s["title"] = e.get("customTitle") or e.get("aiTitle") or s["title"]
            if t == "pr-link" and e.get("prUrl"):
                s["prs"].add(e["prUrl"])
            if t != "user" or e.get("isMeta") or e.get("isSidechain") or "timestamp" not in e:
                continue
            when = ts(e["timestamp"])
            if not (since <= when <= until):
                continue
            text = prompt_text(e.get("message", {}))
            if noise(text):
                continue
            s["cwd"] = e.get("cwd") or s["cwd"]
            if e.get("gitBranch"):
                s["branches"].add(e["gitBranch"])
            s["first"] = s["first"] or when
            s["last"] = when
            s["prompts"].append(" ".join(text.split())[:200])
    if not s["prompts"]:
        continue
    out.append({
        "session": os.path.basename(f)[:-6],
        "cwd": s["cwd"], "branches": sorted(s["branches"]),
        "title": s["title"], "prs": sorted(s["prs"]),
        "first": s["first"].isoformat(), "last": s["last"].isoformat(),
        "prompt_count": len(s["prompts"]),
        "prompts": s["prompts"][:5],
    })
out.sort(key=lambda x: x["first"])
json.dump(out, sys.stdout, indent=1)
