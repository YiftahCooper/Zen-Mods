"""Qualify one frozen package in fresh synthetic headless profiles only."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    for name in ["package", "sine-source", "bzf-source"]:
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    cases = [
        ("standalone", "candidate.js", [], False),
        ("defaults", "defaults.js", [], False),
        ("settings", "settings.js", [], True),
        ("keyboard", "keyboard.js", ["--keyboard-check"], True),
        ("robustness", "robustness.js", [], True),
        ("layout", "layout.js", [], True),
        ("layout-200-percent", "layout.js", ["--ui-scale", "2"], True),
        ("formats", "formats.js", ["--custom-fixtures", str(ROOT / ".backup-scratch/native-image-fixtures")], True),
        ("controls", "controls.js", ["--controls-check"], True),
        ("folder-recovery", "folder-recovery.js", [], True),
        ("private", "private.js", [], True),
        ("compatibility", "compatibility.js", [], True),
        ("icons-first", "integration.js", ["--pointer-check", "--restart-script", "tests/native/restart.js"], True),
        ("folders-first", "integration.js", ["--pointer-check", "--load-order", "folders-first", "--restart-script", "tests/native/restart.js"], True),
        ("persistent", "persistent.js", [], True),
        ("preseeded", "preseeded.js", ["--preseed-persistent"], True),
        ("stock-update", "stock-update.js", ["--stock-update-fixture", "--restart-script", "tests/native/stock-update-restart.js"], True),
    ]
    run = ROOT / ".backup-scratch" / ("qualification-" + str(time.time_ns()))
    run.mkdir()

    def check(case):
        name, script, extra, combined = case
        command = [sys.executable, "tests/native/probe.py", "--sine-source", str(args.sine_source), "--package", str(args.package), "--script", "tests/native/" + script, *extra]
        if combined:
            command += ["--bzf-source", str(args.bzf_source)]
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=360)
        (run / (name + ".log")).write_text(result.stdout + result.stderr, encoding="utf-8")
        record = json.loads(result.stdout.strip().splitlines()[-1])
        item = {"name": name, "result": record["result"], "receipt": str(Path(record["profile"]).parent / "result.json")}
        print(json.dumps(item), flush=True)
        return item

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(check, cases))
    summary = {"package": str(args.package), "passed": all(item["result"] == "passed" for item in results), "cases": results}
    (run / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({"summary": str(run / "summary.json"), "passed": summary["passed"]}), flush=True)
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
