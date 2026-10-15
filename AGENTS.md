# AGENTS.md — rules for perflens

perflens is a browser tool for reading GPU performance evidence: PyTorch
profiler Chrome traces and kern benchmark JSON. It must survive
technical-interview scrutiny. Priority order:
**correct parsing > honest analysis > reproducibility > performance > polish.**

## 0. Safety boundary (non-negotiable)
1. Never install or update GPU drivers, never change device state, clocks or
   power limits, never run elevated commands. If a step needs elevation, stop
   and hand the exact command to the user.
2. If `nvidia-smi` or any GPU tool fails while producing sample traces, record
   the exact error and stop GPU work.
3. Never log in to services or handle the user's tokens. Enabling GitHub
   Pages, making the repo public, and similar account actions are the user's.

## 1. Honesty rules (non-negotiable)
1. Never state, estimate, or invent a measurement. Every number in README or
   docs comes from a file in `results/` produced by a script
   (`results/facts.json` is generated, never typed). Anything not run is
   marked `NOT RUN` with the reason and the exact command.
2. Sample data in `data/` is real: kern JSON copied from a named kern commit,
   traces produced on a recorded machine by `scripts/make_traces.py`, each with
   a `.meta.json` beside it (GPU, driver, torch version, command).
3. Heuristics (kernel-name classification, any analytical model) are labeled
   as heuristics in code, UI and docs.
4. perflens reads PyTorch Chrome traces and kern JSON. It makes no claims
   about Trainium, Neuron, or Nsight data.
5. Keep negative results and cut features in `docs/NEGATIVE_RESULTS.md`, and
   every reference in `docs/REFERENCES.md`. Do not copy code from references.
6. Keep `LOG.md` as a plain-language engineering log.
7. No resume bullets. `docs/RESUME_FACTS.md` lists only verified numbers and
   the file each came from.
8. Never claim CI is green unless the run's conclusion was read from the
   GitHub API.

## 2. Code standards
- TypeScript `strict`. No `any` in parsers or analysis code: inputs are
  `unknown` and narrowed with type guards.
- Parsing of user files runs in a Web Worker; analysis functions are pure and
  unit-tested in Node.
- One change per commit; the message states what changed, why, and evidence.

## 3. Quality gates (all must pass before a commit is pushed)
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run e2e` (Playwright smoke), `npm run audit` (claims audit).

## 4. Definition of done
- A cold clone runs `npm ci`, `npm test`, `npm run build` successfully.
- CI green on a pushed commit (conclusion read via the API).
- MIT `LICENSE` present.
