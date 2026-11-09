---
name: asd-ste100
description: Write or rewrite text in "80% ASD-STE100" (Simplified Technical English) style - short sentences, active voice, one instruction per sentence, consistent terms, no idioms - while keeping domain terms and readable flow. Use when the user says /asd-ste100, "STE", "simplified technical English", or asks for a PR description, email, spec, doc, commit message, or comment in that style.
---

# 80% ASD-STE100

Apply the core rules of ASD-STE100 (Simplified Technical English) to the text the user asked for. "80%" means: follow the structure and clarity rules strictly, but relax the strict approved-dictionary rules so the text still reads naturally to colleagues.

This skill only controls the **language**. The user's request controls the **action** (update a PR, draft an email, write a spec). Do that action as you normally would, and write its text with these rules.

## What to change and what to keep

Change: prose that a person reads (PR descriptions, emails, specs, docs, comments, commit message bodies).

Keep exactly as they are:
- Code, commands, file paths, URLs, identifiers, config keys, error messages.
- Quoted text, names of people, products, and companies.
- Technical names from the domain (for example: "webhook", "inventory sync", "Shopify order"). These are allowed in STE.
- Terms that name a command or a UI action, even if they are phrasal verbs (for example: "check out" a branch, "log in", "sign up").
- Required templates and headings (for example, a PR template's sections).
- The commit subject line format (for example, Conventional Commits: `fix(stores): ...`). Apply the rules only to the text after the prefix.

## Strict rules (always apply)

**Sentences**
1. Sentences: 20 words maximum for instructions, 25 words maximum for descriptions. If a sentence mixes an instruction and a description, use the 20-word limit.
2. One topic per sentence. One instruction per sentence, unless the actions occur at the same time.
3. Paragraphs: 6 sentences maximum, one topic per paragraph.

**Verbs**
4. Use active voice. Say who or what does the action. Passive voice is permitted in descriptive text only when the agent is unknown or not important.
5. Use simple tenses: present, past, and future ("will"). Do not use complex verb structures ("would have been", "is being", "should be able to").
6. Write instructions in the imperative ("Run the migration."), not "You should run" or "The migration needs to be run."
7. Do not use phrasal verbs ("set up", "carry out", "find out", "roll back"). Use one verb ("configure", "do", "find", "revert"). Exception: command and UI action names (see "Keep exactly as they are").
8. Do not use "-ing" words as verbs or nouns when a simple form is possible ("Before you deploy" not "Before deploying").

**Words**
9. One word, one meaning. One meaning, one word. Pick a term and use it everywhere (do not alternate "service", "app", and "system" for the same thing).
10. Noun clusters: 3 words maximum. Break longer ones up ("the error log of the sync job" not "sync job error log file").
11. Keep articles ("the", "a", "this") where they help. Do not write in telegraphic style.
12. No idioms, slang, metaphors, or culture-specific phrases ("low-hanging fruit", "move the needle", "ballpark").
13. No unnecessary words ("in order to" becomes "to"; "at this point in time" becomes "now").
14. Spell out a project-specific abbreviation the first time you use it ("stale-while-revalidate (SWR)"). Exception: the readers are all engineers on the project and use the abbreviation every day (for example, "KV" in a Cloudflare Workers repo).

**Structure**
15. Use vertical lists for steps, conditions, and items in a series.
16. Number the steps in a procedure. Put each step in its own list item.
17. Put conditions before the instruction ("If the test fails, revert the commit.").
18. Put warnings and cautions before the step they apply to. Start them with a clear command ("Do not run this in production.").
19. Use connecting words ("but", "because", "then", "if") to show the logic between sentences.

## Relaxed rules (the other 20%)

- Vocabulary: use common, plain words. You do not need to restrict to the STE dictionary, but prefer the simplest word ("use" not "utilize", "start" not "initiate", "help" not "facilitate", "show" not "demonstrate").
- Tone: keep normal courtesy for emails (greeting, "thanks", sign-off). Keep the user's voice where it does not conflict with the strict rules.
- Markdown: headings, bold, tables, and code blocks are fine.
- An "-ing" word is fine inside a technical name or a heading ("Testing", "Sizing chart").

## Process

1. Get the source: the user's draft, the current PR body (`gh pr view --json body`), or the facts for new text.
2. Identify the key terms. Choose one word for each concept and use it consistently.
3. Write (or rewrite) with the strict rules. Keep all facts, numbers, links, and code unchanged.
4. Check every sentence against the checklist below. Fix any failures.
5. Do the action the user asked for. For an existing text, show a short summary of what changed if the change is large.

## Checklist

- [ ] No sentence above 20 words (instructions or mixed) or 25 words (descriptions).
- [ ] No paragraph above 6 sentences. One topic per paragraph.
- [ ] Every instruction is imperative, with one action per sentence.
- [ ] Active voice, simple tenses.
- [ ] No phrasal verbs (except command and UI action names), idioms, or noun clusters above 3 words.
- [ ] Each concept has one term only.
- [ ] Project-specific abbreviations are spelled out on first use, unless all readers know them.
- [ ] Steps are numbered lists. Conditions and warnings come first.
- [ ] Connecting words show the logic between sentences.
- [ ] Facts, code, links, and commit subject formats are the same as in the source.

## Examples

**Description - before:**
> We went ahead and refactored the inventory sync so that it's now being kicked off by the webhook rather than having to wait on the hourly cron, which should hopefully cut down on the stale stock issues folks have been running into on the storefront.

**Description - after:**
> The webhook now starts the inventory sync. Before this change, the sync started only from the hourly cron job. This change will decrease the number of stale stock levels on the storefront.

**Procedure - before:**
> To test this, check out the branch and get everything installed, then you'll want to run the tests - they should all pass, but be careful not to point it at the production KV namespace since the purge script wipes everything.

**Procedure - after:**
> 1. Check out the branch.
> 2. Run `pnpm install`.
> 3. Run `pnpm test:run`. All tests must pass.
> 4. Do not use the production KV namespace. The purge script deletes all keys in the namespace. Run `pnpm staging:kv:purge` only.
