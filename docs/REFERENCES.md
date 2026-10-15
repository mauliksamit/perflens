# References

No code was copied from any of these. Where an idea is used, the code
comment says so.

1. Trace Event Format (Google, the Chrome tracing JSON spec):
   https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU
   — event phases (`ph`), complete events, JSON object vs array format.
   Used for: `src/parse/chromeTrace.ts`.
2. PyTorch profiler documentation (`torch.profiler`, `export_chrome_trace`):
   https://pytorch.org/docs/stable/profiler.html
   Used for: `scripts/make_traces.py`.
3. Kineto (PyTorch's GPU tracing library), event categories such as
   `kernel`, `gpu_memcpy`, `gpu_memset`, `cpu_op`:
   https://github.com/pytorch/kineto
   Used for: category mapping in `src/parse/chromeTrace.ts` (names were
   confirmed against the committed sample traces).
4. Itanium C++ ABI, name mangling (`_Z`, `N…E`, `<length><identifier>`,
   template args `I…E`): https://itanium-cxx-abi.github.io/cxx-abi/abi.html#mangling
   Used for: the simplified display names in `src/analysis/demangle.ts`.
5. B. Efron and R. Tibshirani, *An Introduction to the Bootstrap*, Chapman &
   Hall, 1993 — percentile bootstrap confidence intervals.
   Used for: `src/analysis/compare.ts`.
6. mulberry32 PRNG (public-domain 32-bit generator by Tommy Ettinger) —
   used for deterministic resampling in `src/analysis/stats.ts`.
7. Vite: Web Workers (`new Worker(new URL(...), { type: "module" })`) and
   `publicDir`: https://vitejs.dev/guide/features.html#web-workers
8. Playwright Test documentation: https://playwright.dev/docs/intro
9. GitHub Pages with GitHub Actions (`actions/upload-pages-artifact`,
   `actions/deploy-pages`): https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
10. kern (the SGEMM project whose JSON perflens reads):
    https://github.com/mauliksamit/kern — `src/bench.cu` defines the JSON.
