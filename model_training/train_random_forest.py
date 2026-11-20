"""
train_random_forest.py – train, evaluate and export the Random Forest model
===========================================================================
Used for the initial model (run by hand) and for retraining (spawned by the
backend). One run produces one *model version* directory:

    <output-dir>/
      model.onnx       sklearn Pipeline(SimpleImputer → RandomForest) as ONNX
      manifest.json    feature spec, hyperparameters, all evaluation results,
                       baseline comparison, data reports, parity fixtures

Methodology
-----------
1. Load the training dataset and harmonise it (cvd/data.py).
2. Stratified 80/20 split (random_state=42) → train / internal test.
3. 5-fold stratified CV grid search on the training part (ROC-AUC).
4. Evaluate the selected model on the internal test set and on every
   external dataset (identical files are detected and skipped).
5. Train baseline algorithms from Chapter 2.1.5 on the same split.
6. Export to ONNX and verify ONNX output == sklearn output.
The deployed model is exactly the model that was evaluated (no refit).

Usage
-----
    python train_random_forest.py                       # defaults below
    python train_random_forest.py --version rf-v2 \
        --train-data data.xlsx --external-data ext.xlsx --output-dir out/
Machine-readable progress for the backend:
    PROGRESS:<0-100>|<message>      and a final   RESULT_JSON:<json>
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import onnxruntime as ort
import sklearn
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_validate, train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

from cvd.analysis import feature_distribution, operating_analysis
from cvd.data import load_dataset
from cvd.evaluate import classification_metrics
from cvd.features import DECISION_THRESHOLD, FEATURE_NAMES, FEATURES, RISK_BANDS

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s", stream=sys.stderr)
log = logging.getLogger("train_rf")

HERE = Path(__file__).resolve().parent
DEFAULT_TRAIN = HERE / "Cardiovascular_Disease_Dataset.xlsx"
DEFAULT_EXTERNAL = [HERE / "Heart_Disease x2.xlsx", HERE / "Heart_Disease x3.xlsx"]
DEFAULT_STORE = HERE.parent / "backend" / "model_store"
SEED = 42

PARAM_GRID = {
    "full": {
        "rf__n_estimators": [200, 400],
        "rf__max_depth": [None, 8, 16],
        "rf__min_samples_leaf": [1, 3, 5],
        "rf__max_features": ["sqrt", 0.5],
    },
    "fast": {
        "rf__n_estimators": [200],
        "rf__max_depth": [None, 10],
        "rf__min_samples_leaf": [1, 3],
        "rf__max_features": ["sqrt"],
    },
}

BASELINES = {
    "logistic_regression": ("Logistic Regression", lambda: Pipeline([
        ("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
        ("clf", LogisticRegression(max_iter=1000, random_state=SEED))])),
    "decision_tree": ("Decision Tree", lambda: Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("clf", DecisionTreeClassifier(random_state=SEED))])),
    "svm": ("Support Vector Machine (RBF)", lambda: Pipeline([
        ("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
        ("clf", SVC(probability=True, random_state=SEED))])),
    "knn": ("K-Nearest Neighbors (k=15)", lambda: Pipeline([
        ("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
        ("clf", KNeighborsClassifier(n_neighbors=15))])),
    "neural_network": ("Neural Network (MLP)", lambda: Pipeline([
        ("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
        ("clf", MLPClassifier(hidden_layer_sizes=(32, 16), max_iter=2000, random_state=SEED))])),
    "gradient_boosting": ("Gradient Boosting", lambda: Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("clf", GradientBoostingClassifier(random_state=SEED))])),
}


def progress(pct: int, msg: str) -> None:
    print(f"PROGRESS:{pct}|{msg}", flush=True)
    log.info("[%3d%%] %s", pct, msg)


def nan_to_none(row: dict) -> dict:
    return {k: (None if (isinstance(v, float) and np.isnan(v)) else float(v)) for k, v in row.items()}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--train-data", default=str(DEFAULT_TRAIN))
    ap.add_argument("--train-name", default=None, help="display name of the training file (defaults to its filename)")
    ap.add_argument("--external-data", nargs="*", default=[str(p) for p in DEFAULT_EXTERNAL])
    ap.add_argument("--version", default="rf-v1")
    ap.add_argument("--output-dir", default=None, help="default: backend/model_store/<version>")
    ap.add_argument("--search", choices=["full", "fast"], default="full")
    ap.add_argument("--no-baselines", action="store_true")
    ap.add_argument("--test-size", type=float, default=0.2)
    args = ap.parse_args()

    started = time.time()
    out_dir = Path(args.output_dir) if args.output_dir else DEFAULT_STORE / args.version
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── 1. Data ─────────────────────────────────────────────────────
    progress(5, "Loading training dataset")
    train_ds = load_dataset(args.train_data, name=args.train_name or Path(args.train_data).name)
    log.info("Training data: %s (%s) %s", train_ds.name, train_ds.schema, train_ds.report)
    if train_ds.n < 50 or train_ds.y.nunique() < 2:
        raise SystemExit("Training data needs at least 50 usable rows and both classes.")

    externals, skipped = [], []
    seen = {train_ds.content_sha256: train_ds.name}
    for p in args.external_data:
        ds = load_dataset(p, name=Path(p).name)
        if ds.content_sha256 in seen:
            skipped.append({"name": ds.name, "identical_to": seen[ds.content_sha256]})
            log.warning("External file %s contains the same data as %s – skipped", ds.name, seen[ds.content_sha256])
            continue
        seen[ds.content_sha256] = ds.name
        externals.append(ds)

    X_train, X_test, y_train, y_test = train_test_split(
        train_ds.X, train_ds.y, test_size=args.test_size, stratify=train_ds.y, random_state=SEED
    )

    # ── 2. Model selection ──────────────────────────────────────────
    progress(15, "Searching Random Forest hyperparameters (5-fold CV)")
    pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("rf", RandomForestClassifier(random_state=SEED, n_jobs=-1)),
    ])
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    search = GridSearchCV(pipe, PARAM_GRID[args.search], scoring="roc_auc", cv=cv, n_jobs=1, refit=True)
    search.fit(X_train, y_train)
    model = search.best_estimator_
    best_params = {k.replace("rf__", ""): v for k, v in search.best_params_.items()}
    log.info("Best params: %s (CV ROC-AUC %.4f)", best_params, search.best_score_)

    progress(45, "Cross-validating the selected model")
    cvr = cross_validate(model, X_train, y_train, cv=cv,
                         scoring=["accuracy", "precision", "recall", "f1", "roc_auc"])
    cv_summary = {
        m: {"mean": float(cvr[f"test_{m}"].mean()), "std": float(cvr[f"test_{m}"].std())}
        for m in ["accuracy", "precision", "recall", "f1", "roc_auc"]
    }

    # ── 3. Evaluation ───────────────────────────────────────────────
    progress(55, "Evaluating on internal and external test sets")
    internal = classification_metrics(y_test, model.predict_proba(X_test)[:, 1], DECISION_THRESHOLD)
    external_results = []
    for ds in externals:
        m = classification_metrics(ds.y, model.predict_proba(ds.X)[:, 1], DECISION_THRESHOLD)
        external_results.append({"name": ds.name, "schema": ds.schema, "sha256": ds.sha256,
                                 "data_report": ds.report, "metrics": m})

    rf = model.named_steps["rf"]
    perm = permutation_importance(model, X_test, y_test, scoring="roc_auc", n_repeats=10, random_state=SEED)
    importance = sorted(
        [
            {"feature": f, "label": next(x["label"] for x in FEATURES if x["name"] == f),
             "impurity": float(rf.feature_importances_[i]),
             "permutation_mean": float(perm.importances_mean[i]),
             "permutation_std": float(perm.importances_std[i])}
            for i, f in enumerate(FEATURE_NAMES)
        ],
        key=lambda d: -d["impurity"],
    )

    # ── 4. Baselines ────────────────────────────────────────────────
    baselines = []
    if not args.no_baselines:
        for i, (key, (label, make)) in enumerate(BASELINES.items()):
            progress(60 + i * 3, f"Training baseline: {label}")
            b = make().fit(X_train, y_train)
            entry = {"algorithm": key, "label": label,
                     "internal": classification_metrics(y_test, b.predict_proba(X_test)[:, 1], curves=False),
                     "external": [{"name": ds.name,
                                   "metrics": classification_metrics(ds.y, b.predict_proba(ds.X)[:, 1], curves=False)}
                                  for ds in externals]}
            baselines.append(entry)
        baselines.append({"algorithm": "random_forest", "label": "Random Forest (selected)",
                          "internal": {k: v for k, v in internal.items() if k not in ("roc_curve", "calibration")},
                          "external": [{"name": e["name"],
                                        "metrics": {k: v for k, v in e["metrics"].items()
                                                    if k not in ("roc_curve", "calibration")}}
                                       for e in external_results]})

    # ── 5. ONNX export + verification ───────────────────────────────
    progress(82, "Exporting to ONNX")
    onx = convert_sklearn(
        model,
        initial_types=[("input", FloatTensorType([None, len(FEATURE_NAMES)]))],
        options={id(rf): {"zipmap": False}},
    )
    onnx_path = out_dir / "model.onnx"
    onnx_path.write_bytes(onx.SerializeToString())

    progress(88, "Verifying ONNX output matches scikit-learn")
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    output_names = [o.name for o in sess.get_outputs()]
    prob_output = next(n for n in output_names if "prob" in n)

    def onnx_proba(X):
        return sess.run([prob_output], {input_name: X.to_numpy(dtype=np.float32)})[0][:, 1]

    check_sets = [X_test] + [ds.X for ds in externals]
    max_diff = max(float(np.max(np.abs(onnx_proba(X) - model.predict_proba(X)[:, 1]))) for X in check_sets)
    log.info("Max |ONNX − sklearn| probability difference: %.2e", max_diff)
    if max_diff > 1e-4:
        raise SystemExit(f"ONNX export mismatch: {max_diff}")

    # Parity fixtures – the Node backend replays these in its test-suite
    parts = [X_test.head(6)]
    for ds in externals:
        parts += [ds.X.head(3), ds.X[ds.X.isna().any(axis=1)].head(3)]
    fixture_rows = pd.concat(parts, ignore_index=True)
    fixtures = [
        {"input": nan_to_none(row), "probability": float(p)}
        for row, p in zip(fixture_rows.to_dict(orient="records"), onnx_proba(fixture_rows))
    ]

    # Per-feature statistics of the training split: used by the backend to
    # flag values outside the training range and as the "typical value"
    # reference for per-patient sensitivity explanations.
    feature_stats = {}
    for f in FEATURES:
        col = X_train[f["name"]].dropna()
        ref = float(col.mode().iloc[0]) if f["type"] == "category" else float(col.median())
        feature_stats[f["name"]] = {"min": round(float(col.min()), 3), "max": round(float(col.max()), 3),
                                    "median": round(float(col.median()), 3), "reference": round(ref, 3)}

    # Operating-point analysis (threshold table + decision curve) and the
    # training distribution used for drift monitoring
    progress(93, "Computing threshold and decision-curve analysis")
    operating = {
        "internal": operating_analysis(y_test, model.predict_proba(X_test)[:, 1]),
        "external": [{"name": ds.name, **operating_analysis(ds.y, model.predict_proba(ds.X)[:, 1])} for ds in externals],
    }
    distribution = feature_distribution(X_train, FEATURES)

    # ── 6. Manifest ─────────────────────────────────────────────────
    progress(95, "Writing manifest")
    manifest = {
        "version": args.version,
        "algorithm": "random_forest",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "framework": {"scikit_learn": sklearn.__version__, "onnxruntime": ort.__version__},
        "onnx": {"file": "model.onnx", "input": input_name, "probability_output": prob_output,
                 "outputs": output_names, "max_abs_diff_vs_sklearn": max_diff},
        "features": FEATURES,
        "feature_order": FEATURE_NAMES,
        "feature_stats": feature_stats,
        "missing_value_strategy": "median imputation inside the ONNX graph (send NaN for unknown)",
        "decision_threshold": DECISION_THRESHOLD,
        "risk_bands": RISK_BANDS,
        "hyperparameters": {**best_params, "random_state": SEED,
                            "search": {"grid": PARAM_GRID[args.search], "cv_folds": 5,
                                       "scoring": "roc_auc", "best_cv_score": float(search.best_score_)}},
        "training_data": {
            "name": train_ds.name, "schema": train_ds.schema, "sha256": train_ds.sha256,
            "data_report": train_ds.report, "split": {"test_size": args.test_size, "stratified": True,
                                                      "random_state": SEED},
            "n_train": int(len(y_train)), "n_test": int(len(y_test)),
        },
        "evaluation": {
            "cross_validation": cv_summary,
            "internal_test": internal,
            "external": external_results,
            "external_skipped": skipped,
        },
        "feature_importance": importance,
        "operating_analysis": operating,
        "feature_distribution": distribution,
        "baselines": baselines,
        "parity_fixtures": fixtures,
        "duration_seconds": round(time.time() - started, 1),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    summary = {
        "success": True,
        "version": args.version,
        "output_dir": str(out_dir),
        "best_params": best_params,
        "internal_test": {k: internal[k] for k in ("accuracy", "precision", "recall", "specificity", "f1", "roc_auc")},
        "external": [{"name": e["name"], **{k: e["metrics"][k] for k in ("accuracy", "recall", "roc_auc")}}
                     for e in external_results],
        "n_train": int(len(y_train)),
        "n_test": int(len(y_test)),
    }
    progress(100, "Training complete")
    print("RESULT_JSON:" + json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
