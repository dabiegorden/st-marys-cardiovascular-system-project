/**
 * ml/inference.js – preprocessing + ONNX inference for one model version
 * ======================================================================
 * Everything is driven by the model's manifest.json (written by
 * model_training/train_random_forest.py):
 *   - feature order, types, allowed ranges and categorical options
 *   - training-range statistics (for warnings) and reference values
 *   - decision threshold and risk bands
 *
 * Missing optional values are sent to the model as NaN; median imputation
 * happens inside the ONNX graph, exactly as during training.
 */

import fs from "fs";
import path from "path";
import ort from "onnxruntime-node";

export class ValidationError extends Error {
  constructor(errors) {
    super("Invalid clinical input.");
    this.statusCode = 400;
    this.errors = errors;
  }
}

export class LoadedModel {
  /** @param {string} dir absolute path of the version directory */
  static async load(dir) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, "manifest.json"), "utf-8"),
    );
    const session = await ort.InferenceSession.create(
      path.join(dir, manifest.onnx.file),
    );
    return new LoadedModel(manifest, session);
  }

  constructor(manifest, session) {
    this.manifest = manifest;
    this.session = session;
    this.features = manifest.features;
    this.order = manifest.feature_order;
    this.byName = Object.fromEntries(this.features.map((f) => [f.name, f]));
    this.setOperatingPoint();
  }

  /** Decision threshold + risk bands; defaults come from the manifest, admins may override. */
  setOperatingPoint(threshold, bands) {
    this.threshold = threshold ?? this.manifest.decision_threshold;
    this.bands = bands ?? this.manifest.risk_bands;
  }

  get version() {
    return this.manifest.version;
  }

  /**
   * Validate a { feature: value } object.
   * @returns {{ values: Record<string, number|null>, imputed: string[], warnings: object[] }}
   * @throws {ValidationError}
   */
  validate(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new ValidationError([{ field: "features", message: "Must be an object." }]);
    }
    const errors = [];
    const warnings = [];
    const imputed = [];
    const values = {};

    for (const f of this.features) {
      const raw = input[f.name];
      const blank = raw === undefined || raw === null || raw === "";

      if (blank) {
        if (f.required) errors.push({ field: f.name, message: `${f.label} is required.` });
        else {
          values[f.name] = null;
          imputed.push(f.name);
        }
        continue;
      }

      const v = Number(raw);
      if (!Number.isFinite(v)) {
        errors.push({ field: f.name, message: `${f.label} must be a number.` });
        continue;
      }

      if (f.type === "category") {
        if (!f.options.some((o) => o.value === v)) {
          errors.push({
            field: f.name,
            message: `${f.label}: choose one of ${f.options.map((o) => o.label).join(", ")}.`,
          });
          continue;
        }
      } else if (v < f.min || v > f.max) {
        errors.push({
          field: f.name,
          message: `${f.label} must be between ${f.min} and ${f.max}${f.unit ? " " + f.unit : ""}.`,
        });
        continue;
      }

      const stats = this.manifest.feature_stats?.[f.name];
      if (f.type === "number" && stats && (v < stats.min || v > stats.max)) {
        warnings.push({
          field: f.name,
          code: "outside_training_range",
          message: `${f.label} (${v}) is outside the range seen in training data (${stats.min}–${stats.max}); the prediction is less reliable.`,
        });
      }
      values[f.name] = v;
    }

    if (errors.length) throw new ValidationError(errors);

    for (const name of imputed) {
      warnings.push({
        field: name,
        code: "imputed",
        message: `${this.byName[name].label} was not provided; the training median (${this.manifest.feature_stats?.[name]?.median ?? "n/a"}) was used.`,
      });
    }
    return { values, imputed, warnings };
  }

  toRow(values) {
    return this.order.map((name) =>
      values[name] === null || values[name] === undefined ? NaN : values[name],
    );
  }

  /** Raw probability of the positive class for one or more rows. */
  async probabilities(rows) {
    const flat = Float32Array.from(rows.flat());
    const tensor = new ort.Tensor("float32", flat, [rows.length, this.order.length]);
    const out = await this.session.run({ [this.manifest.onnx.input]: tensor });
    const probs = out[this.manifest.onnx.probability_output].data; // [n, 2]
    return rows.map((_, i) => Number(probs[i * 2 + 1]));
  }

  riskBand(p) {
    const bands = this.bands;
    return (bands.find((b) => p >= b.min && p < b.max) ?? bands[bands.length - 1]).name;
  }

  /**
   * Per-patient explanation: how much the probability changes when each
   * value is replaced by a typical training value (median, or most common
   * category). Positive = this value pushes the risk up.
   */
  async explain(values, probability) {
    const stats = this.manifest.feature_stats ?? {};
    const candidates = this.order.filter(
      (n) => values[n] !== null && stats[n] && values[n] !== stats[n].reference,
    );
    if (!candidates.length) return [];

    const rows = candidates.map((n) => this.toRow({ ...values, [n]: stats[n].reference }));
    const probs = await this.probabilities(rows);
    const labelFor = (n, v) => {
      const f = this.byName[n];
      return f.type === "category"
        ? f.options.find((o) => o.value === v)?.label ?? String(v)
        : `${Number(v.toFixed(2))}${f.unit ? " " + f.unit : ""}`;
    };

    return candidates
      .map((n, i) => ({
        feature: n,
        label: this.byName[n].label,
        value: labelFor(n, values[n]),
        reference: labelFor(n, stats[n].reference),
        effect: Number((probability - probs[i]).toFixed(4)),
      }))
      .filter((e) => Math.abs(e.effect) >= 0.005)
      .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
      .slice(0, 6);
  }

  /** Full assessment for a validated input object. */
  async assess(input) {
    const { values, imputed, warnings } = this.validate(input);
    const [probability] = await this.probabilities([this.toRow(values)]);
    return {
      values,
      imputed,
      warnings,
      probability,
      prediction: probability >= this.threshold ? 1 : 0,
      decisionThreshold: this.threshold,
      riskBand: this.riskBand(probability),
      explanation: await this.explain(values, probability),
    };
  }
}
