# Limitations

Stated plainly:

- **Inputs.** perflens reads PyTorch profiler (Kineto) Chrome traces and kern
  benchmark JSON. It does not read Nsight Systems or Nsight Compute reports,
  and it makes no Trainium, Neuron, or Nsight claims of any kind.
- **Event types.** Only complete events (`ph: "X"`) are used. Begin/end
  pairs (`B`/`E`), async, flow and counter events are counted as skipped.
  PyTorch writes GPU activity as complete events, so its traces are fully
  covered; other Chrome-trace producers may not be.
- **GPU only on the timeline.** CPU operators are counted but not drawn; there
  is no CPU-to-GPU launch-latency view.
- **Idle is not utilization.** "Idle" means no kernel, memcpy or memset was
  recorded on any stream of the device. A kernel that occupies one SM counts
  as busy. Counter-level utilization needs Nsight Compute, which perflens
  does not read.
- **Category breakdown is a heuristic.** Name-based rules can misfile kernels
  and need updating as library kernel names change.
- **Display names are simplified,** not demangled. Two different template
  instantiations can show the same short name (for example two
  `magma_sgemmEx_kernel<…>` rows); hover shows the full name, and
  comparison uses full names as keys.
- **Comparing traces needs repeats.** A trace comparison uses per-invocation
  durations of each kernel name; with a few profiled steps that is a few
  samples per kernel, so most rows will (correctly) be inconclusive. Profile
  more steps for a meaningful comparison. kern JSON carries 100 timed
  iterations per kernel.
- **Very large files.** The whole file is decompressed and `JSON.parse`d in the
  worker, so memory scales with file size; there is no streaming parser.
  The largest tested sample is listed in the README facts table.
- **Sample traces come from one machine** (RTX 5070 Laptop, WDDM, Windows,
  torch 2.14.1+cu130; see each `.meta.json`).
- **Load metrics.** Lighthouse or equivalent page-load metrics: NOT RUN
  (command in `results/facts.json`).
