/**
 * Model artifact tests – no database required.
 * The parity fixtures were produced by onnxruntime in Python at export time;
 * Node must reproduce them, proving training and inference preprocess identically.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { LoadedModel, ValidationError } from "../src/ml/inference.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../model_store/rf-v1");
let model;
before(async () => {
  model = await LoadedModel.load(dir);
});

const valid = {
  age: 61, sex: 1, resting_bp: 165, max_heart_rate: 120, cholesterol: 260,
  fasting_blood_sugar: 1, chest_pain_type: 3, exercise_angina: 1, resting_ecg: 1, oldpeak: 2.3, slope: 2,
};

test("manifest describes 11 features in a fixed order", () => {
  assert.equal(model.order.length, 11);
  assert.deepEqual(model.order, model.features.map((f) => f.name));
  assert.equal(model.manifest.algorithm, "random_forest");
});

test("Node inference reproduces Python/ONNX probabilities (parity fixtures)", async () => {
  const fixtures = model.manifest.parity_fixtures;
  assert.ok(fixtures.length >= 6);
  const probs = await model.probabilities(fixtures.map((f) => model.toRow(f.input)));
  fixtures.forEach((f, i) => {
    assert.ok(Math.abs(probs[i] - f.probability) < 1e-5, `fixture ${i}: ${probs[i]} vs ${f.probability}`);
  });
});

test("fixtures include rows with missing cholesterol (imputed inside ONNX)", () => {
  assert.ok(model.manifest.parity_fixtures.some((f) => f.input.cholesterol === null));
});

test("valid input produces a bounded probability, class and risk band", async () => {
  const r = await model.assess(valid);
  assert.ok(r.probability >= 0 && r.probability <= 1);
  assert.equal(r.prediction, r.probability >= 0.5 ? 1 : 0);
  assert.ok(["low", "moderate", "high"].includes(r.riskBand));
  assert.deepEqual(r.imputed, []);
});

test("missing optional cholesterol is imputed and flagged", async () => {
  const r = await model.assess({ ...valid, cholesterol: null });
  assert.deepEqual(r.imputed, ["cholesterol"]);
  assert.ok(r.warnings.some((w) => w.code === "imputed" && w.field === "cholesterol"));
});

test("required fields, ranges and categories are enforced", async () => {
  await assert.rejects(model.assess({ ...valid, age: undefined }), ValidationError);
  await assert.rejects(model.assess({ ...valid, age: 300 }), ValidationError);
  await assert.rejects(model.assess({ ...valid, chest_pain_type: 7 }), ValidationError);
  await assert.rejects(model.assess({ ...valid, resting_bp: "abc" }), ValidationError);
  try {
    await model.assess({ ...valid, sex: 9, oldpeak: 50 });
  } catch (e) {
    assert.deepEqual(e.errors.map((x) => x.field).sort(), ["oldpeak", "sex"]);
  }
});

test("values outside the training range produce a warning, not an error", async () => {
  const r = await model.assess({ ...valid, age: 95 });
  assert.ok(r.warnings.some((w) => w.code === "outside_training_range" && w.field === "age"));
});

test("risk bands follow the manifest thresholds", () => {
  assert.equal(model.riskBand(0.1), "low");
  assert.equal(model.riskBand(0.3), "moderate");
  assert.equal(model.riskBand(0.59), "moderate");
  assert.equal(model.riskBand(0.6), "high");
  assert.equal(model.riskBand(1), "high");
});
