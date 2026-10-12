# Benchmark

What the claim in the main README rests on. The current numbers are in
[`results.md`](results.md), and every one of them can be recomputed from
[`results.csv`](results.csv): one row per reply, counts only, no reply text.

Three measures, each taken with the plugin's own parser (`measure.ts`):

- **skim**: a reply with every stretch closed. What you read by default.
- **full**: every stretch open. Everything Claude wrote.
- **read**: the skim plus the stretches the reader opened.

## What it runs

**Replay** (`replay.ts`). I took real replies from four of my greenfield projects, up to 20 per
project sampled with a fixed seed, and had Claude (Opus 5.5) rewrite each one under the plugin's
guide, keeping every fact and adding nothing. Each rewrite is checked to keep the original's
content words with every stretch open. Replies under 40 words need no stretches by the guide's own
rule and are counted as written. Across 69 replies the skim was 17% of the original's words (12% to
19% per project). With every stretch open, the rewrites kept 99% of the original's content words on
average (never below 96%), and ran 6% longer: a long form repeats its short form's words so it reads
in place.

**Coverage** (`coverage.ts`). Fewer words only matters if the skim still says the important things.
For 20 of the replayed replies, a blind reader saw only one version and wrote down every decision,
action and result it was told about. A grader listed the original's must-know points and checked
both readers against the same list. The reader of the original is the control: it shows how strict
the grader is. The skim carried 68% of the top three points and 45% of all of them, against 99% for
the original. The rest is one click away, which is the deal. That missing third is the next thing to
fix. The likely place is the guide, which keeps decisions and actions out of stretches and says
nothing about results.

**Native** (`native.ts`). Replies written with the plugin on, with the reading notes that say what
was opened. So far that is five replies from the session that built the plugin: the skim was 16% of
the full text, and in the three replies with a reading note I read 51% of the words. I was clicking
everything to see if it worked, so that number is not typical of anything.

## Read these numbers honestly

- The replay is a **rewrite** of replies written without the plugin, not replies Claude wrote with
  it from the start. Native replies may stretch differently.
- These are **my** replies, written under my own instructions, which ask for a status block at the
  end of every reply. My replies run long. If yours are short, you will save less.
- The coverage grader is a model, and model graders have their own tastes. The control row is there
  to show how strict it is.
- The native sample is five replies from one session.
- It measures words, not time or understanding.

## Run it on your own transcripts

```
node bench/replay.ts --per-project 20 ~/.claude/projects/<project>... > bench/out/replay.jsonl
node bench/coverage.ts --per-project 5 > bench/out/coverage.jsonl
node bench/native.ts ~/.claude/projects/<project>/<session>.jsonl > bench/out/native.jsonl
node bench/report.ts
```

Rewrites and coverage use `claude -p` on your own account. Raw text stays in `bench/out/`, which
git ignores.
