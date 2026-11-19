# Cardiovascular Disease Prediction Support – Saint Mary's Hospital, Drobo

Web application that gives authorised hospital staff a **Random Forest** estimate of cardiovascular-disease
probability from routine clinical measurements – decision support, not diagnosis.

| Folder | Contents |
|---|---|
| `model_training/` | Datasets and the Python training pipeline (`train_random_forest.py`) |
| `backend/` | Express API: Better Auth, Drizzle/Neon PostgreSQL, ONNX inference, retraining jobs |
| `frontend/` | Next.js dashboard |
| `docs/PROJECT_PLAN.md` | **Full documentation** – architecture, model results, security, API, runbook |

Quick start: see [docs/PROJECT_PLAN.md §9](docs/PROJECT_PLAN.md#9-running-the-system).
