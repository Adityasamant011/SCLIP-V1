#!/usr/bin/env python3
"""
Phase 2F.1 Vision VLM Benchmark Runner

Benchmarks 3 local VLM candidates on 10 Sclip-specific tasks using mlx-vlm.
Produces a weighted-score comparison table.

Usage:
  python run_benchmark.py [--models all|A|B|C] [--skip-download]
"""

import argparse
import json
import os
import subprocess
import sys
import time
import tracemalloc
import traceback
from pathlib import Path

# ── Ensure assets exist ───────────────────────────────────────────────────────
SOURCE_VIDEO = "/Users/adityasamant/Documents/1/3/Media/Raw Talking head tutorial video for editing practice.mp4"


def ensure_frames():
    """Extract test frames from source video if not already present."""
    frames = {
        "/tmp/test-frame-initial.png": "00:00:05",  # should have face visible
        "/tmp/test-frame-current.png": "00:00:35",  # may have face off-screen
        "/tmp/test-frame-source-16-9.png": "00:00:05",  # 16:9 wide frame
    }
    for path, ts in frames.items():
        if not os.path.exists(path):
            print(f"[setup] Extracting {path} at {ts} ...")
            is_16_9 = "16-9" in path
            vf = "" if is_16_9 else ""
            cmd = [
                "ffmpeg", "-y", "-ss", ts, "-i", SOURCE_VIDEO,
                "-frames:v", "1", "-q:v", "2", path,
            ]
            subprocess.run(cmd, capture_output=True, check=True)
            print(f"[setup] Saved {path}")
        else:
            print(f"[setup] Found {path}")


# ── Production model definition ──────────────────────────────────────────────
CANDIDATES = {
    "A": {
        "label": "Qwen3-VL-2B-Instruct-4bit",
        "hf_id":  "mlx-community/Qwen3-VL-2B-Instruct-4bit",
    },
}

# ── Scoring weights ───────────────────────────────────────────────────────────
# Final model selection uses: accuracy 40%, latency 20%, memory 20%, stability 10%, integration 10%
# Integration score is fixed per model (subjective, assessed here).
INTEGRATION_SCORES = {"A": 9, "B": 7, "C": 8}  # /10


def load_model(hf_id: str):
    """Load a model via mlx-vlm. Returns (model, processor)."""
    from mlx_vlm import load
    print(f"[bench] Loading {hf_id} ...")
    t0 = time.time()
    model, processor = load(hf_id)
    elapsed = time.time() - t0
    print(f"[bench] Loaded in {elapsed:.1f}s")
    return model, processor, elapsed


def run_inference(model, processor, image_path: str, question: str) -> tuple[str, float]:
    """Run one inference. Returns (response_text, latency_s)."""
    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.utils import load_config

    # Build prompt
    prompt = apply_chat_template(
        processor,
        load_config(processor.model_id if hasattr(processor, "model_id") else ""),
        question,
        num_images=1,
    )

    t0 = time.time()
    response = generate(
        model,
        processor,
        image=image_path,
        prompt=prompt,
        max_tokens=300,
        verbose=False,
    )
    latency = time.time() - t0
    return response, latency


def run_inference_robust(model, processor, hf_id: str, image_path: str, question: str) -> tuple[str, float, bool]:
    """Run inference with crash protection. Returns (text, latency_s, crashed)."""
    try:
        # mlx_vlm API varies by version - try multiple call patterns
        from mlx_vlm import generate
        from mlx_vlm.prompt_utils import apply_chat_template
        from mlx_vlm.utils import load_config

        try:
            config = load_config(hf_id)
            prompt = apply_chat_template(processor, config, question, num_images=1)
        except Exception:
            prompt = question

        t0 = time.time()
        response = generate(
            model,
            processor,
            image=image_path,
            prompt=prompt,
            max_tokens=300,
            verbose=False,
        )
        latency = time.time() - t0

        if hasattr(response, "text"):
            text = response.text
        elif isinstance(response, str):
            text = response
        else:
            text = str(response)

        return text, latency, False

    except Exception as e:
        print(f"    [inference ERROR] {e}")
        return f"ERROR: {e}", 0.0, True


def benchmark_candidate(candidate_id: str, candidate: dict, tasks: list) -> dict:
    """Run all benchmark tasks for one model candidate. Returns results dict."""
    hf_id = candidate["hf_id"]
    label = candidate["label"]
    print(f"\n{'='*60}")
    print(f"CANDIDATE {candidate_id}: {label}")
    print(f"HF: {hf_id}")
    print(f"{'='*60}")

    results = {
        "candidate_id": candidate_id,
        "label": label,
        "hf_id": hf_id,
        "load_time_s": None,
        "load_failed": False,
        "tasks": [],
        "crash_count": 0,
        "peak_ram_mb": None,
    }

    # Start memory tracking
    tracemalloc.start()

    # Load model
    try:
        model, processor, load_time = load_model(hf_id)
        results["load_time_s"] = load_time
    except Exception as e:
        print(f"  [LOAD FAILED] {e}")
        results["load_failed"] = True
        results["load_error"] = str(e)
        tracemalloc.stop()
        return results

    # Run tasks
    for task in tasks:
        print(f"\n  Task {task.id}: {task.name}")
        print(f"    Image: {task.image_path}")
        print(f"    Q: {task.question[:80]}...")

        if not os.path.exists(task.image_path):
            print(f"    [SKIP] Image not found: {task.image_path}")
            results["tasks"].append({
                "task_id": task.id,
                "task_name": task.name,
                "status": "SKIP",
                "response": "",
                "latency_s": 0,
                "passed": False,
                "note": "Image not found",
            })
            continue

        response, latency, crashed = run_inference_robust(
            model, processor, hf_id, task.image_path, task.question
        )

        if crashed:
            results["crash_count"] += 1
            passed, note = False, "inference crashed"
        else:
            try:
                passed, note = task.evaluate(response)
            except Exception as e:
                passed, note = False, f"eval error: {e}"

        status = "PASS" if passed else ("CRASH" if crashed else "FAIL")
        print(f"    Response ({latency:.1f}s): {response[:120]}...")
        print(f"    → {status} — {note}")

        results["tasks"].append({
            "task_id": task.id,
            "task_name": task.name,
            "status": status,
            "response": response[:500],
            "latency_s": round(latency, 2),
            "passed": passed,
            "note": note,
            "weight": task.weight,
        })

    # RAM snapshot
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    results["peak_ram_mb"] = round(peak / 1024 / 1024, 1)

    return results


def score_results(all_results: list[dict]) -> list[dict]:
    """
    Apply weighted scoring: accuracy 40%, latency 20%, memory 20%, stability 10%, integration 10%
    Returns results list with scores added.
    """
    def accuracy(r):
        if r.get("load_failed"):
            return 0.0
        tasks = r.get("tasks", [])
        if not tasks:
            return 0.0
        total_weight = sum(t.get("weight", 1.0) for t in tasks if t["status"] != "SKIP")
        weighted_pass = sum(t.get("weight", 1.0) for t in tasks if t["passed"])
        return weighted_pass / total_weight if total_weight > 0 else 0.0

    def latency_score(r):
        """Lower median latency = higher score."""
        tasks = [t for t in r.get("tasks", []) if t["status"] not in ("SKIP", "CRASH") and t["latency_s"] > 0]
        if not tasks:
            return 0.0
        med = sorted(t["latency_s"] for t in tasks)[len(tasks) // 2]
        # Score: <2s = 10, <5s = 8, <10s = 6, <20s = 4, else 2
        if med < 2:
            return 10.0
        if med < 5:
            return 8.0
        if med < 10:
            return 6.0
        if med < 20:
            return 4.0
        return 2.0

    def memory_score(r):
        """Lower RAM = higher score."""
        mb = r.get("peak_ram_mb") or 0
        if mb < 500:
            return 10.0
        if mb < 1000:
            return 8.0
        if mb < 2000:
            return 6.0
        if mb < 4000:
            return 4.0
        return 2.0

    def stability_score(r):
        """Fewer crashes = higher score."""
        if r.get("load_failed"):
            return 0.0
        crashes = r.get("crash_count", 0)
        total = len(r.get("tasks", []))
        if total == 0:
            return 5.0
        rate = crashes / total
        return max(0.0, 10.0 - rate * 20)

    for r in all_results:
        cid = r["candidate_id"]
        acc = accuracy(r)
        lat = latency_score(r)
        mem = memory_score(r)
        stab = stability_score(r)
        integ = INTEGRATION_SCORES.get(cid, 5)

        # Normalize accuracy to /10
        acc_score = acc * 10

        weighted = (
            0.40 * acc_score +
            0.20 * lat +
            0.20 * mem +
            0.10 * stab +
            0.10 * integ
        )
        r["scores"] = {
            "accuracy_pct": round(acc * 100, 1),
            "accuracy_10": round(acc_score, 1),
            "latency_10": lat,
            "memory_10": mem,
            "stability_10": round(stab, 1),
            "integration_10": integ,
            "weighted_total": round(weighted, 2),
        }

    return all_results


def print_report(all_results: list[dict]):
    """Print benchmark comparison table and winner."""
    print("\n" + "=" * 70)
    print("BENCHMARK RESULTS")
    print("=" * 70)

    # Header
    print(f"\n{'Candidate':<36} {'Acc%':>5} {'Lat/10':>6} {'Mem/10':>6} {'Stab/10':>7} {'Int/10':>6} {'TOTAL':>7}")
    print("-" * 70)

    sorted_r = sorted(all_results, key=lambda r: r.get("scores", {}).get("weighted_total", 0), reverse=True)
    for r in sorted_r:
        s = r.get("scores", {})
        status = " (LOAD FAILED)" if r.get("load_failed") else ""
        print(
            f"{r['label']:<36}"
            f"{s.get('accuracy_pct', 0):>5.1f}"
            f"{s.get('latency_10', 0):>6.1f}"
            f"{s.get('memory_10', 0):>6.1f}"
            f"{s.get('stability_10', 0):>7.1f}"
            f"{s.get('integration_10', 0):>6.1f}"
            f"{s.get('weighted_total', 0):>7.2f}"
            f"{status}"
        )

    print("-" * 70)

    winner = sorted_r[0] if sorted_r else None
    if winner and not winner.get("load_failed"):
        print(f"\n🏆 WINNER: {winner['label']}")
        print(f"   HF ID: {winner['hf_id']}")
        print(f"   Weighted score: {winner.get('scores', {}).get('weighted_total', 0):.2f}/10")
    else:
        print("\n⚠️  No clear winner (all models had issues)")


def main():
    parser = argparse.ArgumentParser(description="Phase 2F.1 VLM Benchmark")
    parser.add_argument("--models", default="all", help="Comma-separated candidate IDs (A,B,C) or 'all'")
    parser.add_argument("--skip-frames", action="store_true", help="Skip frame extraction")
    parser.add_argument("--output", default="/tmp/bench_results.json", help="JSON output path")
    args = parser.parse_args()

    # Select candidates
    if args.models == "all":
        selected = list(CANDIDATES.keys())
    else:
        selected = [m.strip().upper() for m in args.models.split(",")]

    print(f"[bench] Running {len(selected)} candidate(s): {', '.join(selected)}")

    # Ensure frames exist
    if not args.skip_frames:
        ensure_frames()

    # Import tasks
    sys.path.insert(0, str(Path(__file__).parent))
    from tasks import BENCHMARK_TASKS

    # Run benchmarks
    all_results = []
    for cid in selected:
        if cid not in CANDIDATES:
            print(f"[warn] Unknown candidate: {cid}")
            continue
        result = benchmark_candidate(cid, CANDIDATES[cid], BENCHMARK_TASKS)
        all_results.append(result)

    # Score
    all_results = score_results(all_results)

    # Print report
    print_report(all_results)

    # Save JSON
    with open(args.output, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\n[bench] Results saved to {args.output}")

    # Return winner HF ID for programmatic use
    sorted_r = sorted(all_results, key=lambda r: r.get("scores", {}).get("weighted_total", 0), reverse=True)
    if sorted_r and not sorted_r[0].get("load_failed"):
        print(f"\nWINNER_HF_ID={sorted_r[0]['hf_id']}")


if __name__ == "__main__":
    main()
