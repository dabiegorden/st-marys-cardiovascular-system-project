"""
cvd/features.py – the single source of truth for model inputs
=============================================================
Every artifact the backend and frontend use (feature order, labels,
units, allowed ranges, categorical options) is generated from FEATURES
and written into the model manifest. Nothing downstream hard-codes them.

Feature set
-----------
The 11 variables shared by the training dataset (Cardiovascular Disease
Dataset, 12 predictors) and the external validation dataset
(Statlog/Cleveland/Hungary, 11 predictors). `noofmajorvessels` exists only
in the training data (and requires fluoroscopy), so it is excluded to keep
external validation possible.
"""

from __future__ import annotations

TARGET = "target"

# Values that mean "not measured" in the source datasets. They are turned
# into NaN and imputed (median) inside the exported ONNX pipeline.
ZERO_MEANS_MISSING = ("resting_bp", "cholesterol")

FEATURES: list[dict] = [
    {
        "name": "age", "label": "Age", "group": "Demographics",
        "type": "number", "unit": "years", "step": 1,
        "min": 18, "max": 100, "required": True,
        "help": "Patient age in completed years.",
    },
    {
        "name": "sex", "label": "Sex", "group": "Demographics",
        "type": "category", "required": True,
        "options": [{"value": 0, "label": "Female"}, {"value": 1, "label": "Male"}],
    },
    {
        "name": "resting_bp", "label": "Resting blood pressure (systolic)",
        "group": "Vital signs", "type": "number", "unit": "mmHg", "step": 1,
        "min": 70, "max": 250, "required": True,
        "help": "Systolic blood pressure at rest.",
    },
    {
        "name": "max_heart_rate", "label": "Maximum heart rate achieved",
        "group": "Vital signs", "type": "number", "unit": "bpm", "step": 1,
        "min": 50, "max": 230, "required": True,
        "help": "Highest heart rate reached during the exercise test.",
    },
    {
        "name": "cholesterol", "label": "Serum cholesterol", "group": "Laboratory",
        "type": "number", "unit": "mg/dL", "step": 1,
        "min": 80, "max": 650, "required": False,
        "help": "Leave blank if not measured – the model substitutes the training median and the result is flagged.",
    },
    {
        "name": "fasting_blood_sugar", "label": "Fasting blood sugar > 120 mg/dL",
        "group": "Laboratory", "type": "category", "required": True,
        "options": [{"value": 0, "label": "No"}, {"value": 1, "label": "Yes"}],
    },
    {
        "name": "chest_pain_type", "label": "Chest pain type", "group": "Symptoms",
        "type": "category", "required": True,
        "options": [
            {"value": 0, "label": "Typical angina"},
            {"value": 1, "label": "Atypical angina"},
            {"value": 2, "label": "Non-anginal pain"},
            {"value": 3, "label": "Asymptomatic"},
        ],
    },
    {
        "name": "exercise_angina", "label": "Exercise-induced angina",
        "group": "Symptoms", "type": "category", "required": True,
        "options": [{"value": 0, "label": "No"}, {"value": 1, "label": "Yes"}],
    },
    {
        "name": "resting_ecg", "label": "Resting ECG", "group": "ECG & exercise test",
        "type": "category", "required": True,
        "options": [
            {"value": 0, "label": "Normal"},
            {"value": 1, "label": "ST-T wave abnormality"},
            {"value": 2, "label": "Left ventricular hypertrophy"},
        ],
    },
    {
        "name": "oldpeak", "label": "ST depression (oldpeak)",
        "group": "ECG & exercise test", "type": "number", "unit": "mm", "step": 0.1,
        "min": -3, "max": 7, "required": True,
        "help": "ST depression induced by exercise relative to rest.",
    },
    {
        "name": "slope", "label": "Slope of peak exercise ST segment",
        "group": "ECG & exercise test", "type": "category", "required": True,
        "options": [
            {"value": 1, "label": "Upsloping"},
            {"value": 2, "label": "Flat"},
            {"value": 3, "label": "Downsloping"},
        ],
    },
]

FEATURE_NAMES: list[str] = [f["name"] for f in FEATURES]

# Probability thresholds for the result display. The classification
# threshold is 0.5; the bands are presentation only and must be agreed
# with clinicians before use.
DECISION_THRESHOLD = 0.5
RISK_BANDS = [
    {"name": "low", "label": "Low", "min": 0.0, "max": 0.30},
    {"name": "moderate", "label": "Moderate", "min": 0.30, "max": 0.60},
    {"name": "high", "label": "High", "min": 0.60, "max": 1.0},
]
