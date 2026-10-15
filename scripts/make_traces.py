#!/usr/bin/env python3
"""Produce real PyTorch profiler Chrome traces for perflens's data/ samples.

Workload: one pre-norm transformer block (LayerNorm -> multi-head attention
written with explicit matmul + softmax -> LayerNorm -> GELU MLP), FP32 with
TF32 disabled (asserted), fixed seed. The block is run `--warmup` times
untraced, then `--steps` times under torch.profiler with CUDA activity, and
the Chrome trace is exported. Two variants:
  - eager:  plain module calls
  - sdpa:   same block but attention via F.scaled_dot_product_attention
so perflens's run comparison has a real before/after pair.

Next to each trace a <name>.meta.json records GPU, driver, torch/CUDA
versions, shapes, the exact command, and the perflens git commit.
Local absolute paths are stripped from the exported trace.

Usage (from the perflens repo root, with a CUDA-enabled torch):
  python scripts/make_traces.py --variant eager --steps 5  --out data/traces/block_eager.json
  python scripts/make_traces.py --variant sdpa  --steps 5  --out data/traces/block_sdpa.json
  python scripts/make_traces.py --variant eager --steps 200 --out data/traces/block_eager_200.json --gzip
"""
import argparse
import gzip
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone

import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


class Block(nn.Module):
    def __init__(self, d: int, heads: int, use_sdpa: bool):
        super().__init__()
        self.h, self.dh, self.use_sdpa = heads, d // heads, use_sdpa
        self.ln1, self.ln2 = nn.LayerNorm(d), nn.LayerNorm(d)
        self.qkv, self.proj = nn.Linear(d, 3 * d), nn.Linear(d, d)
        self.fc1, self.fc2 = nn.Linear(d, 4 * d), nn.Linear(4 * d, d)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        b, t, d = x.shape
        q, k, v = self.qkv(self.ln1(x)).view(b, t, 3, self.h, self.dh).permute(2, 0, 3, 1, 4)
        if self.use_sdpa:
            a = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        else:
            s = (q @ k.transpose(-2, -1)) / (self.dh ** 0.5)
            mask = torch.triu(torch.ones(t, t, device=x.device, dtype=torch.bool), 1)
            a = torch.softmax(s.masked_fill(mask, float("-inf")), dim=-1) @ v
        x = x + self.proj(a.transpose(1, 2).reshape(b, t, d))
        return x + self.fc2(F.gelu(self.fc1(self.ln2(x))))


def run(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT).stdout.strip()
    except OSError as e:
        return f"unavailable ({e})"


def git_commit() -> str:
    sha = run(["git", "rev-parse", "--verify", "-q", "HEAD"])
    if len(sha) != 40:
        return "uncommitted"
    dirty = run(["git", "status", "--porcelain", "--untracked-files=no"])
    return sha + (" (tracked files modified)" if dirty else "")


def redact(text: str) -> str:
    """Strip local paths (longest first, all slash styles) and the host name."""
    variants = set()
    for p in (ROOT, os.path.expanduser("~")):
        variants |= {p, p.replace("\\", "/"), p.replace("\\", "\\\\")}
    for v in sorted(variants, key=len, reverse=True):
        text = text.replace(v, "<redacted>")
    host = platform.node()
    if host:
        text = text.replace(host, "<host>")
    return text


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", choices=["eager", "sdpa"], default="eager")
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--seq", type=int, default=256)
    ap.add_argument("--d", type=int, default=512)
    ap.add_argument("--heads", type=int, default=8)
    ap.add_argument("--warmup", type=int, default=10)
    ap.add_argument("--steps", type=int, default=5)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", required=True)
    ap.add_argument("--gzip", action="store_true", help="write <out>.gz instead of <out>")
    a = ap.parse_args()

    if not torch.cuda.is_available():
        print("CUDA not available: trace NOT RUN. Needs a CUDA build of torch and an NVIDIA GPU.")
        return 2
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.set_float32_matmul_precision("highest")
    assert not torch.backends.cuda.matmul.allow_tf32 and not torch.backends.cudnn.allow_tf32

    torch.manual_seed(a.seed)
    dev = torch.device("cuda")
    model = Block(a.d, a.heads, a.variant == "sdpa").to(dev).eval()
    x = torch.randn(a.batch, a.seq, a.d, device=dev)
    with torch.no_grad():
        for _ in range(a.warmup):
            model(x)
        torch.cuda.synchronize()
        acts = [torch.profiler.ProfilerActivity.CPU, torch.profiler.ProfilerActivity.CUDA]
        with torch.profiler.profile(activities=acts, record_shapes=True) as prof:
            for _ in range(a.steps):
                with torch.profiler.record_function("block_step"):
                    model(x)
            torch.cuda.synchronize()

    out = os.path.join(ROOT, a.out) if not os.path.isabs(a.out) else a.out
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = out + ".tmp"
    prof.export_chrome_trace(tmp)
    with open(tmp, encoding="utf-8") as f:
        text = redact(f.read())
    os.remove(tmp)
    json.loads(text)  # must still be valid JSON after redaction
    final = out + ".gz" if a.gzip else out
    if a.gzip:
        with gzip.open(final, "wt", encoding="utf-8", compresslevel=9) as f:
            f.write(text)
    else:
        with open(final, "w", encoding="utf-8") as f:
            f.write(text)

    smi = run(["nvidia-smi", "--query-gpu=name,driver_version,compute_cap", "--format=csv,noheader"])
    meta = {
        "file": os.path.relpath(final, ROOT).replace("\\", "/"),
        "date_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generator": "scripts/make_traces.py",
        "command": "python scripts/make_traces.py " + " ".join(sys.argv[1:]),
        "perflens_git_commit": git_commit(),
        "gpu_nvidia_smi": smi,
        "torch": torch.__version__,
        "torch_cuda": torch.version.cuda,
        "python": platform.python_version(),
        "os": platform.platform(),
        "dtype": "float32",
        "tf32_matmul": torch.backends.cuda.matmul.allow_tf32,
        "tf32_cudnn": torch.backends.cudnn.allow_tf32,
        "workload": {"variant": a.variant, "batch": a.batch, "seq": a.seq, "d_model": a.d, "heads": a.heads,
                     "warmup": a.warmup, "profiled_steps": a.steps, "seed": a.seed},
    }
    with open(final + ".meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")
    print(f"wrote {meta['file']} ({os.path.getsize(final)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
