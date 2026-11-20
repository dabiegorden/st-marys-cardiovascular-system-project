"""
cvd/analysis.py – operating-point and monitoring analyses stored in the manifest
================================================================================
- threshold_table   sensitivity / specificity / PPV / NPV / flagged rate per cut-off,
                    used by administrators to choose the decision threshold.
- decision_curve    net benefit of the model vs "treat all" / "treat none" across
                    threshold probabilities (Vickers & Elkin decision-curve analysis).
- feature_distribution
                    reference distribution of every input in the training split,
                    used by the backend to compute the population stability index
                    (PSI) for data-drift monitoring.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def _counts(y, pred):
    y = np.asarray(y).astype(int)
    pred = np.asarray(pred).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum())
    fp = int(((pred == 1) & (y == 0)).sum())
    tn = int(((pred == 0) & (y == 0)).sum())
    fn = int(((pred == 0) & (y == 1)).sum())
    return tp, fp, tn, fn


def _div(a, b):
    return float(a / b) if b else None


def threshold_table(y, p, thresholds=None) -> list[dict]:
    if thresholds is None:
        thresholds = np.round(np.arange(0.05, 0.951, 0.05), 2)
    y = np.asarray(y).astype(int)
    p = np.asarray(p, dtype=float)
    n = len(y)
    rows = []
    for t in thresholds:
        tp, fp, tn, fn = _counts(y, p >= t)
        rows.append({
            "threshold": float(t),
            "sensitivity": _div(tp, tp + fn),
            "specificity": _div(tn, tn + fp),
            "ppv": _div(tp, tp + fp),
            "npv": _div(tn, tn + fn),
            "accuracy": _div(tp + tn, n),
            "flagged_rate": _div(tp + fp, n),
            "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        })
    return rows


def decision_curve(y, p, thresholds=None) -> list[dict]:
    """Net benefit = TP/n − FP/n · pt/(1−pt)."""
    if thresholds is None:
        thresholds = np.round(np.arange(0.02, 0.981, 0.02), 2)
    y = np.asarray(y).astype(int)
    p = np.asarray(p, dtype=float)
    n = len(y)
    prevalence = y.mean() if n else 0.0
    out = []
    for t in thresholds:
        tp, fp, _, _ = _counts(y, p >= t)
        w = t / (1 - t)
        out.append({
            "threshold": float(t),
            "model": float(tp / n - fp / n * w) if n else None,
            "treat_all": float(prevalence - (1 - prevalence) * w),
            "treat_none": 0.0,
        })
    return out


def operating_analysis(y, p) -> dict:
    return {"threshold_table": threshold_table(y, p), "decision_curve": decision_curve(y, p)}


def feature_distribution(X: pd.DataFrame, features: list[dict]) -> dict:
    out = {}
    for f in features:
        name = f["name"]
        col = X[name]
        missing_rate = float(col.isna().mean())
        vals = col.dropna().to_numpy(dtype=float)
        if f["type"] == "category":
            counts = {str(int(o["value"])): int((vals == o["value"]).sum()) for o in f["options"]}
            total = max(len(vals), 1)
            out[name] = {
                "type": "category",
                "proportions": {k: v / total for k, v in counts.items()},
                "missing_rate": missing_rate,
            }
        else:
            # interior cut points at the deciles (deduplicated for discrete data)
            cuts = np.unique(np.quantile(vals, np.linspace(0.1, 0.9, 9)))
            bins = np.digitize(vals, cuts, right=False)  # 0 … len(cuts)
            props = np.bincount(bins, minlength=len(cuts) + 1) / max(len(vals), 1)
            out[name] = {
                "type": "number",
                "cuts": [float(c) for c in cuts],
                "proportions": [float(x) for x in props],
                "mean": float(vals.mean()) if len(vals) else None,
                "missing_rate": missing_rate,
            }
    return out
