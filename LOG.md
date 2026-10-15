# LOG.md — engineering log (plain language)

## 2026-10-15 — First version: parsers, analyses, worker UI, tests, CI
- Goal: a browser tool that reads the evidence my GPU projects produce
  (PyTorch profiler traces, kern bench JSON) and answers three questions:
  where does GPU time go, where does the GPU sit idle, and is run B really
  different from run A.
- Samples: two kern runs copied from kern's history (strict run V at kern
  `92a1711`, fast-math run N at `f9920a1`; blob hashes identical to kern's)
  and three torch.profiler traces generated on this machine by
  `scripts/make_traces.py` (RTX 5070 Laptop, driver 617.14, torch
  2.14.1+cu130, FP32, TF32 off). Local paths and the host name are stripped.
- Built: guarded parsers (no `any`), top kernels, idle gaps (union across
  streams), bootstrap-CI comparison with a practical threshold, a labeled
  name heuristic for categories, simplified display names for mangled
  kernels, a module Web Worker with no main-thread fallback, a canvas
  timeline, Vitest unit tests, Playwright e2e on the production build, CI
  and a Pages workflow.
- First real comparison (kern N → V at 1024³): v0 is the only "slower"
  verdict; every other kernel is inconclusive, including v6 whose CI excludes
  zero but whose change is below the 5% threshold. That matches kern's own
  finding that the fast-math flag's effect is inside session noise.
- Windows torch writes mangled kernel names; the heuristic categories still
  match substrings, and display names are simplified (documented as such).
- Miss, fixed: the screenshot script left an orphaned `vite preview` on
  Windows; the next run failed silently and an older timing file from a
  previous trace remained. Caught because the browser and Node event counts
  disagreed. Script now runs vite under node directly. NEGATIVE_RESULTS #5.
- Numbers: all in `results/facts.json`, rendered into the README and
  `docs/FACTS.md` by `scripts/render_facts.mjs`; `npm run audit`
  checks README/docs against them.

## 2026-10-15 — Cold-clone check; CI status not readable yet
- Fresh `git clone` of `a09cbc7` into an empty temp folder, then `npm ci`,
  `npm test` (31/31 passed, 2 files), `npm run build` (ok), `npm run lint`,
  `npm run typecheck`, `npm run audit` (passed, facts block fresh) and
  `npm run e2e` (5/5 passed, Chromium) — all passed.
- CI: the repository is private, so the workflow run's conclusion cannot be
  read from the GitHub API without credentials; not claimed. Check
  https://github.com/mauliksamit/perflens/actions. The Pages workflow will
  fail until Pages is enabled with "Source: GitHub Actions".
