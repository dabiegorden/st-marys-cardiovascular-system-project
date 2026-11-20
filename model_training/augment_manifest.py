"""
augment_manifest.py – add operating-point analysis and drift reference data
to an existing model version without retraining it.

    python augment_manifest.py ../backend/model_store/rf-v1 [--train-data FILE] [--external-data FILE ...]

The original training file is located by its SHA-256 (recorded in the manifest)
among the .xlsx/.csv files next to this script, so the exact 80/20 split is
recreated. Predictions come from the version's own model.onnx.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from sklearn.model_selection import train_test_split

from cvd.analysis import feature_distribution, operating_analysis
from cvd.data import file_sha256, load_dataset

HERE = Path(__file__).resolve().parent


def find_by_sha(sha: str) -> Path | None:
    for p in list(HERE.glob("*.xlsx")) + list(HERE.glob("*.csv")):
        if file_sha256(p) == sha:
            return p
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("model_dir")
    ap.add_argument("--train-data")
    ap.add_argument("--external-data", nargs="*")
    args = ap.parse_args()

    model_dir = Path(args.model_dir)
    manifest_path = model_dir / "manifest.json"
    m = json.loads(manifest_path.read_text())
    order = m["feature_order"]

    sess = ort.InferenceSession(str(model_dir / m["onnx"]["file"]), providers=["CPUExecutionProvider"])

    def proba(X):
        out = sess.run([m["onnx"]["probability_output"]], {m["onnx"]["input"]: X[order].to_numpy(dtype=np.float32)})
        return out[0][:, 1]

    analysis = {"internal": None, "external": []}

    train_path = Path(args.train_data) if args.train_data else find_by_sha(m["training_data"]["sha256"])
    if train_path:
        ds = load_dataset(train_path)
        split = m["training_data"]["split"]
        X_train, X_test, y_train, y_test = train_test_split(
            ds.X, ds.y, test_size=split["test_size"], stratify=ds.y, random_state=split["random_state"]
        )
        if len(y_test) != m["training_data"]["n_test"]:
            sys.exit("Recreated split does not match the manifest – wrong training file?")
        analysis["internal"] = operating_analysis(y_test, proba(X_test))
        m["feature_distribution"] = feature_distribution(X_train, m["features"])
        # Same file content (verified by hash) – record its real name instead of an upload's temporary name
        m["training_data"]["name"] = train_path.name
        print(f"internal analysis + feature distribution from {train_path.name}")
    else:
        print("WARNING: training file not found – internal analysis and drift reference skipped")

    ext_paths = args.external_data or []
    if not ext_paths:
        names = {e["name"] for e in m["evaluation"]["external"]}
        ext_paths = [str(HERE / n) for n in names if (HERE / n).exists()]
    for p in ext_paths:
        ds = load_dataset(p)
        analysis["external"].append({"name": Path(p).name, **operating_analysis(ds.y, proba(ds.X))})
        print(f"external analysis from {Path(p).name}")

    m["operating_analysis"] = analysis
    manifest_path.write_text(json.dumps(m, indent=2))
    print(f"updated {manifest_path}")


if __name__ == "__main__":
    main()
