"""
cvd/evaluate.py – classification metrics used throughout the report
===================================================================
Accuracy, precision, recall (sensitivity), specificity, F1, ROC-AUC,
Brier score, confusion matrix, ROC curve points and a calibration curve
(Chapter 2.1.10; calibration per TRIPOD+AI / Collins et al.).
"""

from __future__ import annotations

import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)


def _downsample(xs, ys, max_points=60):
    if len(xs) <= max_points:
        return [{"fpr": float(x), "tpr": float(y)} for x, y in zip(xs, ys)]
    idx = np.unique(np.linspace(0, len(xs) - 1, max_points).round().astype(int))
    return [{"fpr": float(xs[i]), "tpr": float(ys[i])} for i in idx]


def classification_metrics(y_true, y_prob, threshold: float = 0.5, curves=True) -> dict:
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob, dtype=float)
    y_pred = (y_prob >= threshold).astype(int)

    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    out = {
        "n": int(len(y_true)),
        "positives": int(y_true.sum()),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "specificity": float(tn / (tn + fp)) if (tn + fp) else 0.0,
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, y_prob)) if len(set(y_true)) > 1 else None,
        "brier": float(brier_score_loss(y_true, y_prob)),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "threshold": threshold,
    }

    if curves and len(set(y_true)) > 1:
        fpr, tpr, _ = roc_curve(y_true, y_prob)
        out["roc_curve"] = _downsample(fpr, tpr)
        frac_pos, mean_pred = calibration_curve(y_true, y_prob, n_bins=10, strategy="uniform")
        out["calibration"] = [
            {"predicted": float(p), "observed": float(o)} for p, o in zip(mean_pred, frac_pos)
        ]
    return out
