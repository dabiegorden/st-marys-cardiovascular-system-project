"""
cvd/data.py – load and harmonise datasets into the canonical schema
===================================================================
Supported source schemas (detected from column names):

1. "cardiovascular"  – Cardiovascular Disease Dataset (1,000 patients)
   chestpain coded 0–3 (0 = typical angina … 3 = asymptomatic)
2. "statlog"         – heart_statlog_cleveland_hungary (1,190 rows)
   chest pain type coded 1–4 (1 = typical angina … 4 = asymptomatic)
3. "canonical"       – already uses FEATURE_NAMES + target

Harmonisation steps (recorded in the returned report):
- rename columns to FEATURE_NAMES, map chest-pain coding to 0–3
- 0 in resting_bp / cholesterol → NaN ("not measured", imputed later)
- drop rows with a missing/non-binary target
- drop exact duplicate rows
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from .features import FEATURE_NAMES, TARGET, ZERO_MEANS_MISSING

_CARDIO_COLUMNS = {
    "age": "age",
    "gender": "sex",
    "chestpain": "chest_pain_type",
    "restingbp": "resting_bp",
    "serumcholestrol": "cholesterol",
    "fastingbloodsugar": "fasting_blood_sugar",
    "restingrelectro": "resting_ecg",
    "maxheartrate": "max_heart_rate",
    "exerciseangia": "exercise_angina",
    "oldpeak": "oldpeak",
    "slope": "slope",
    "target": TARGET,
}

_STATLOG_COLUMNS = {
    "age": "age",
    "sex": "sex",
    "chest pain type": "chest_pain_type",
    "resting bp s": "resting_bp",
    "cholesterol": "cholesterol",
    "fasting blood sugar": "fasting_blood_sugar",
    "resting ecg": "resting_ecg",
    "max heart rate": "max_heart_rate",
    "exercise angina": "exercise_angina",
    "oldpeak": "oldpeak",
    "st slope": "slope",
    "target": TARGET,
}


@dataclass
class Dataset:
    name: str
    schema: str
    X: pd.DataFrame
    y: pd.Series
    sha256: str          # hash of the file bytes
    content_sha256: str  # hash of the harmonised data (detects same data in different files)
    report: dict = field(default_factory=dict)

    @property
    def n(self) -> int:
        return int(len(self.y))


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_any(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix in (".xlsx", ".xls"):
        return pd.read_excel(path)
    if suffix == ".csv":
        return pd.read_csv(path)
    raise ValueError(f"Unsupported file type '{suffix}'. Use .csv, .xlsx or .xls")


def _norm(col: str) -> str:
    return str(col).strip().lower()


def detect_schema(columns) -> str:
    cols = {_norm(c) for c in columns}
    if set(_CARDIO_COLUMNS) <= cols:
        return "cardiovascular"
    if set(_STATLOG_COLUMNS) <= cols:
        return "statlog"
    if set(FEATURE_NAMES + [TARGET]) <= cols:
        return "canonical"
    missing_canonical = sorted(set(FEATURE_NAMES + [TARGET]) - cols)
    raise ValueError(
        "Unrecognised dataset columns. Expected the Cardiovascular Disease "
        "Dataset, the Statlog/Cleveland/Hungary format, or these columns: "
        f"{FEATURE_NAMES + [TARGET]}. Missing (canonical): {missing_canonical}"
    )


def load_dataset(path: str | Path, name: str | None = None) -> Dataset:
    path = Path(path)
    raw = _read_any(path)
    raw.columns = [_norm(c) for c in raw.columns]
    schema = detect_schema(raw.columns)

    if schema == "cardiovascular":
        df = raw[list(_CARDIO_COLUMNS)].rename(columns=_CARDIO_COLUMNS)
    elif schema == "statlog":
        df = raw[list(_STATLOG_COLUMNS)].rename(columns=_STATLOG_COLUMNS)
        df["chest_pain_type"] = df["chest_pain_type"] - 1  # 1–4 → 0–3
    else:
        df = raw[FEATURE_NAMES + [TARGET]].copy()

    report: dict = {"rows_raw": int(len(df)), "schema": schema}

    df = df.apply(pd.to_numeric, errors="coerce")

    # Target must be 0/1
    bad_target = ~df[TARGET].isin([0, 1])
    report["dropped_invalid_target"] = int(bad_target.sum())
    df = df[~bad_target]

    # 0 means "not measured" for these clinical measurements
    report["zero_as_missing"] = {}
    for col in ZERO_MEANS_MISSING:
        zeros = df[col] == 0
        report["zero_as_missing"][col] = int(zeros.sum())
        df.loc[zeros, col] = np.nan

    dups = df.duplicated()
    report["dropped_duplicates"] = int(dups.sum())
    df = df[~dups].reset_index(drop=True)

    report["rows_used"] = int(len(df))
    report["missing_values"] = {
        c: int(v) for c, v in df[FEATURE_NAMES].isna().sum().items() if v
    }
    report["positive_rate"] = float(df[TARGET].mean()) if len(df) else None

    X = df[FEATURE_NAMES].astype("float32")
    y = df[TARGET].astype(int)
    return Dataset(
        name=name or path.name,
        schema=schema,
        X=X,
        y=y,
        sha256=file_sha256(path),
        content_sha256=hashlib.sha256(
            pd.concat([X, y], axis=1).to_csv(index=False).encode()
        ).hexdigest(),
        report=report,
    )
