---
name: release-video
description: Use when the user asks for a video, explainer clip, or animated recap of a release, changelog, sprint, or set of merged PRs, for example "make a video for this release" or /release-video.
---

# Release Video

## Overview

Turn a release into a short MP4 of animated title cards. Each card is one HTML scene. `scripts/render.mjs` steps the page frame by frame in headless Chromium and pipes the frames to ffmpeg, so the output is smooth and repeatable.

`template/index.html` sets the house style: Oswald headings, DM Sans body, accent kicker with a rule, mock UI cards, fade-and-rise motion. Keep its fonts, layout and timing. Take the colors and logos from the repo.

Needs: `node`, `ffmpeg`, Playwright with Chromium.

## Step 1: Ask

Ask these in one question set, unless the user already answered them:

| Question | Options |
|---|---|
| Audience | End users / internal operators, engineering, leadership |
| Format | Animated title cards (default), real app screen capture, mix |
| Length + audio | ~60s captions only (default), ~60–90s with TTS voice, 2–3 min |

This skill covers title cards. For screen capture, record clips with Playwright and cut them between cards.

## Step 2: Gather the release

Read, in this order, until you know every change:

1. The changelog section for the version.
2. The release PR body (`gh pr list --base <prod branch> --state all`).
3. `git log <prod>..<release> --no-merges --oneline`.

Mark changes that already shipped in an earlier hotfix. Show them on a card with a pill: "Already live since <version>".

## Step 3: Write the scenes

A 60-second video has this shape:

| Time | Scene |
|---|---|
| 0–5s | Title: kicker "Release <version>", h1 "What's new for <audience>" |
| 4–5 scenes × 7–10s | One headline change each: kicker `NN · Area`, h2 headline, 1–2 sentences, a mock UI visual on the right |
| ~9s | List card: 3 smaller fixes, one line each |
| 4–5s | Outro: short sign-off line + version and product |

Copy rules:
- Write for the chosen audience. Keep only changes that alter what they see or do. Cut internal work (migrations, tests, refactors, docs, races they never noticed).
- Headline in the reader's words ("Invoice totals now add themselves up"), not the PR title.
- Name real buttons and screens in bold. Wrap hyphenated terms in `<span class="nowrap">` so they do not break across lines.
- Mock UI text that copies a real message must use the real wording: grep the code for it. Use made-up values (Participant 1, `K7Q2M9TX`), never real names or emails.
- Follow the user's writing rules (for example, no em dashes).

## Step 4: Build

1. Copy `template/` to a new folder in the scratchpad. Copy the repo's logo SVGs next to it (search for `logo`, `brand`, `wordmark`, `favicon`).
2. Map the repo's brand colors onto the `:root` slots. Look for design tokens: CSS custom properties, a Tailwind theme, a theme or tokens file, a UI package. Use the colors the product's own UI uses, not every swatch in the palette.

   | Slot | Takes the repo's |
   |---|---|
   | `--bg` | page background |
   | `--surface` | card / panel background |
   | `--heading` | primary brand color (must read on `--bg`) |
   | `--accent` | secondary or warm accent |
   | `--ink` | body text |
   | `--muted` | secondary text |
   | `--line` | borders, dividers |
   | `--alert` | error / warning color |

   If the repo has no clear tokens, keep the template's defaults. Keep the template's fonts either way.
3. Edit `index.html`. Set `data-start`/`data-dur` per scene with no overlaps, and set `TOTAL` to the end of the last scene. Use `data-in` for entrances and `data-count` for numbers. Put any other motion in `renderVisuals(t)`, as a pure function of `t`.
4. Check stills before the full render, one per scene, at a time when every element is in:
   `node <skill>/scripts/render.mjs index.html --stills 3,10,20,...`
   Read each PNG. Compare the colors with the repo's own UI. Fix overflow, bad line breaks, empty space and misaligned blocks.
5. Render: `node <skill>/scripts/render.mjs index.html release-<version>.mp4` (about 1 s of wall time per second of video).
6. Pull 1–2 frames from the MP4 with `ffmpeg -ss <t> -i out.mp4 -frames:v 1 check.png` and look at them. Confirm duration with `ffprobe`.

If Playwright is not found, run `npm i playwright && npx playwright install chromium` in the video folder.

## Step 5: Deliver

Give the full absolute path to the MP4, a time / card table, and the choices the user may want to change (hotfix items kept, mock data invented, items cut). Tell them that to edit, they change `index.html` and re-run the render command.

## Common mistakes

| Mistake | Fix |
|---|---|
| CSS transitions, `setTimeout`, `Date.now()` in the page | Frames are rendered out of real time; drive everything from `render(t)` |
| `.copy` in a centered scene fills the column, so content sits at the top | `.center .copy { flex: none }` (already in the template) |
| Logo SVG with a wide viewBox renders tiny | Raise its `height`; check the still |
| One card per PR | Group by what the audience notices; small fixes go on the list card |
| Hex values hardcoded in new CSS | Use the `:root` slots so the repo's colors apply everywhere |
| Changing fonts to the repo's | Keep Oswald and DM Sans; repo fonts often fail to load headless |
