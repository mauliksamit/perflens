# Negative results, cut features, and misses

1. **Main-thread parsing fallback — cut on purpose.** A fallback when `Worker`
   is unavailable would make "parsed in a Web Worker" untrue for some users
   without anyone noticing. Every supported browser has module workers, so
   the client errors instead.
2. **Full C++ demangler — cut.** Writing a correct Itanium demangler is a
   project of its own, and bundling one adds size for a display nicety. The
   simplified decoder covers the names in our samples and is labeled as
   simplified; full names stay available.
3. **CPU lane on the timeline — cut for now.** CPU operators are counted but
   not drawn. GPU lanes plus the idle-gap lane answer the questions the
   samples raise (where GPU time goes, where the GPU waits).
4. **Trace comparison with 5 profiled steps is mostly inconclusive.** Comparing
   `block_eager.json` and `block_sdpa.json` gives 5–20 samples per kernel
   name and wide intervals; the tool labels nearly all rows inconclusive.
   That is the intended behaviour, not a bug: profile more steps to compare
   traces. The kern pair (100 iterations per kernel) is the better demo.
5. **Process miss: a stale timing file.** The first screenshot script started
   `vite preview` through a shell; on Windows the kill only ended the shell,
   the orphaned server held port 4173, and the next run failed while an
   older `results/browser_parse.json`, measured on a previous version of the
   large trace, stayed on disk. Caught because its event count did not match
   the Node measurement of the regenerated trace. Fixed by running vite
   directly under node; see LOG.md.
6. **Lighthouse — NOT RUN.** No Lighthouse run was made; the command is in
   `results/facts.json`.
