export type Role = "admin" | "clinician";
export type RiskBand = "low" | "moderate" | "high";

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  highRiskAlerts: boolean;
  smsAlerts: boolean;
  phoneNumber: string | null;
  twoFactorEnabled: boolean;
  twoFactorRequired: boolean;
}

export interface FeatureOption {
  value: number;
  label: string;
}

export interface Feature {
  name: string;
  label: string;
  group: string;
  type: "number" | "category";
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  required: boolean;
  help?: string;
  options?: FeatureOption[];
}

export interface FeatureStat {
  min: number;
  max: number;
  median: number;
  reference: number;
}

export interface Metrics {
  n?: number;
  positives?: number;
  accuracy: number;
  precision: number;
  recall: number;
  specificity: number;
  f1: number;
  roc_auc: number | null;
  brier?: number;
  confusion_matrix?: { tn: number; fp: number; fn: number; tp: number };
  roc_curve?: { fpr: number; tpr: number }[];
  calibration?: { predicted: number; observed: number }[];
}

export interface RiskBandDef {
  name: RiskBand;
  label: string;
  min: number;
  max: number;
}

export interface ActiveModel {
  id: string;
  version: string;
  algorithm: string;
  trainedAt: string;
  activatedAt: string | null;
  features: Feature[];
  featureStats: Record<string, FeatureStat>;
  decisionThreshold: number;
  riskBands: RiskBandDef[];
  metrics: {
    internal: Metrics;
    external: (Metrics & { name: string })[];
  };
  featureImportance: { feature: string; label: string; importance: number }[];
  disclaimer: string;
}

export interface Warning {
  field: string;
  code: string;
  message: string;
}

export interface ExplanationItem {
  feature: string;
  label: string;
  value: string;
  reference: string;
  effect: number;
}

export interface AssessmentListItem {
  id: string;
  createdAt: string;
  prediction: 0 | 1;
  probability: number;
  riskBand: RiskBand;
  imputedFeatures: string[];
  patientId: string;
  hospitalNumber: string;
  clinicianName: string | null;
  modelVersion: string;
  outcome?: Outcome | null;
}

export type Outcome = "cvd_confirmed" | "cvd_excluded";

export interface Assessment {
  id: string;
  patientId: string;
  userId: string | null;
  modelVersionId: string;
  inputFeatures: Record<string, number | null>;
  imputedFeatures: string[];
  warnings: Warning[];
  explanation: ExplanationItem[] | null;
  prediction: 0 | 1;
  probability: number;
  riskBand: RiskBand;
  clinicianNote: string | null;
  createdAt: string;
  decisionThreshold?: number | null;
  outcome?: Outcome | null;
  outcomeSource?: string | null;
  outcomeNote?: string | null;
  outcomeRecordedAt?: string | null;
  hospitalNumber: string;
  modelVersion: string;
  clinicianName?: string | null;
  clinicianEmail?: string | null;
  canEditNote?: boolean;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Patient {
  id: string;
  hospitalNumber: string;
  createdAt: string;
  assessmentCount?: number;
  lastAssessmentAt?: string | null;
}

export interface ModelVersionSummary {
  id: string;
  version: string;
  status: "candidate" | "active" | "retired";
  createdAt: string;
  activatedAt: string | null;
  trainingData: string;
  nTrain: number;
  internal: Partial<Metrics> | null;
  external: Partial<Metrics> | null;
  operatingPoint: {
    threshold: number;
    riskBands: RiskBandDef[];
    custom: boolean;
    reason: string | null;
    updatedAt: string | null;
  };
}

export interface ThresholdRow {
  threshold: number;
  sensitivity: number | null;
  specificity: number | null;
  ppv: number | null;
  npv: number | null;
  accuracy: number | null;
  flagged_rate: number | null;
}

export interface DecisionCurvePoint {
  threshold: number;
  model: number | null;
  treat_all: number;
  treat_none: number;
}

export interface OperatingAnalysis {
  threshold_table: ThresholdRow[];
  decision_curve: DecisionCurvePoint[];
}

export interface Baseline {
  algorithm: string;
  label: string;
  internal: Metrics;
  external: { name: string; metrics: Metrics }[];
}

export interface DataReport {
  rows_raw: number;
  rows_used: number;
  positive_rate: number;
  dropped_duplicates: number;
  zero_as_missing: Record<string, number>;
  schema: string;
}

export interface Manifest {
  version: string;
  algorithm: string;
  created_at: string;
  features: Feature[];
  feature_stats: Record<string, FeatureStat>;
  decision_threshold: number;
  risk_bands: RiskBandDef[];
  hyperparameters: Record<string, unknown> & {
    search?: { grid: Record<string, unknown[]>; cv_folds: number; scoring: string; best_cv_score: number };
  };
  training_data: {
    name: string;
    schema: string;
    sha256: string;
    n_train: number;
    n_test: number;
    data_report: DataReport;
  };
  evaluation: {
    cross_validation: Record<string, { mean: number; std: number }>;
    internal_test: Metrics;
    external: { name: string; schema: string; data_report: DataReport; metrics: Metrics }[];
    external_skipped: { name: string; identical_to: string }[];
  };
  feature_importance: {
    feature: string;
    label: string;
    impurity: number;
    permutation_mean: number;
    permutation_std: number;
  }[];
  baselines: Baseline[];
  framework: Record<string, string>;
  operating_analysis?: {
    internal: OperatingAnalysis | null;
    external: (OperatingAnalysis & { name: string })[];
  };
}

export interface TrainingJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message: string;
  datasetFilename: string;
  searchMode: string;
  error: string | null;
  modelVersionId: string | null;
  createdAt: string;
  finishedAt: string | null;
  startedBy?: string | null;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  banned: boolean | null;
  mustChangePassword: boolean;
  highRiskAlerts: boolean;
  smsAlerts: boolean;
  phoneNumber: string | null;
  twoFactorEnabled: boolean | null;
  createdAt: string;
}

export type NotificationStatus = "pending" | "sending" | "sent" | "failed" | "skipped";

export interface AlertRecipient {
  id: string;
  recipientName: string | null;
  recipientEmail: string;
  status: NotificationStatus;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationRow {
  id: string;
  kind: "high_risk_alert" | "daily_digest" | "test";
  status: NotificationStatus;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  assessmentId: string | null;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse extends Paged<NotificationRow> {
  summary: Partial<Record<NotificationStatus, number>>;
  settings: {
    enabled: boolean;
    from: string | null;
    recipients: "assessor_and_admins" | "all_staff";
    showHospitalNumber: boolean;
    outboxCron: string;
    digestCron: string;
    timezone: string;
  };
  undeliverableUsers: { id: string; name: string; email: string }[];
  optedOutUsers: { id: string; name: string }[];
}

export interface AuditRow {
  id: number;
  createdAt: string;
  action: string;
  actorEmail: string | null;
  userName: string | null;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
}


/* ---------------- follow-up cases ---------------- */
export type CaseStatus = "open" | "acknowledged" | "reviewed" | "referred" | "closed";
export type CaseAction = "acknowledge" | "review" | "refer" | "close" | "reopen" | "note";

export interface CaseEvent {
  id: number;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
  userName: string | null;
}

export interface FollowUpCase {
  id: string;
  status: CaseStatus;
  assessmentId: string;
  assignedToId: string | null;
  assigneeName: string | null;
  acknowledgedAt: string | null;
  closedAt: string | null;
  escalatedAt: string | null;
  escalationCount: number;
  createdAt: string;
  overdue: boolean;
  events: CaseEvent[];
}

export interface CaseListItem {
  id: string;
  status: CaseStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  closedAt: string | null;
  escalationCount: number;
  assessmentId: string;
  assignedToId: string | null;
  assigneeName: string | null;
  hospitalNumber: string;
  probability: number;
  outcome: Outcome | null;
  overdue: boolean;
}

export interface CaseListResponse extends Paged<CaseListItem> {
  counts: Partial<Record<CaseStatus, number>>;
  timing: { medianAckMinutes: number | null; acknowledged: number; overdue: number };
  escalationHours: number;
}

/* ---------------- local validation ---------------- */
export interface Ci {
  value: number | null;
  low: number | null;
  high: number | null;
  n: number;
}

export interface LocalReport {
  n: number;
  positives: number;
  accuracy: Ci;
  sensitivity: Ci;
  specificity: Ci;
  ppv: Ci;
  npv: Ci;
  f1: number | null;
  roc_auc: number | null;
  brier: number | null;
  confusion_matrix: { tn: number; fp: number; fn: number; tp: number };
}

export interface LocalValidation {
  coverage: { withOutcome: number; totalAssessments: number };
  overall: LocalReport;
  byVersion: (LocalReport & { version: string })[];
  byRiskBand: { riskBand: RiskBand; n: number; confirmed: number; observedRate: number | null }[];
  decisionCurve: DecisionCurvePoint[];
  minimumForConclusions: number;
}

/* ---------------- drift ---------------- */
export type DriftLevel = "stable" | "moderate" | "significant" | "insufficient";

export interface DriftReport {
  modelVersion: string;
  windowDays: number;
  n: number;
  minimum: number;
  reliable: boolean;
  available: boolean;
  overall?: DriftLevel;
  message?: string;
  features: {
    feature: string;
    label: string;
    type: "number" | "category";
    psi: number | null;
    level: DriftLevel;
    trainingMean: number | null;
    recentMean: number | null;
    missingRate: number | null;
    bins: { label: string; training: number; recent: number }[];
  }[];
  prediction: { positiveRate: number | null; meanProbability: number | null; trainingPrevalence: number | null } | null;
}

/* ---------------- usability ---------------- */
export interface Stats5 {
  n: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
}

export interface UsabilityReport {
  sus: Stats5 & {
    interpretation: { adjective: string; grade: string; acceptable: boolean } | null;
    byRole: (Stats5 & { role: string })[];
    items: { item: number; text: string; positive: boolean; mean: number | null }[];
    responses: { id: string; role: string | null; score: number; comment: string | null; assessmentCount: number | null; createdAt: string; userName: string | null }[];
  };
  taskTime: { overall: Stats5; byExperience: (Stats5 & { label: string })[] };
}

export interface SusStatus {
  completed: boolean;
  assessmentsDone: number;
  promptAfter: number;
  shouldPrompt: boolean;
  items: string[];
}

/* ---------------- SMS ---------------- */
export interface SmsRow {
  id: string;
  kind: string;
  status: NotificationStatus;
  recipientPhone: string;
  recipientName: string | null;
  message: string;
  assessmentId: string | null;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  sentAt: string | null;
  createdAt: string;
}

export interface SmsResponse extends Paged<SmsRow> {
  summary: Partial<Record<NotificationStatus, number>>;
  settings: { enabled: boolean; sender: string | null; sandbox: boolean; keyConfigured: boolean };
  balance: { sms_balance?: number | string; main_balance?: string; error?: string } | null;
  senderStatus: { status: string; message?: string | null } | null;
  usersWithoutPhone: { id: string; name: string }[];
  optedOutUsers: { id: string; name: string }[];
}

export interface SmsAlertRecipient {
  id: string;
  recipientName: string | null;
  recipientPhone: string;
  status: NotificationStatus;
  sentAt: string | null;
  createdAt: string;
}
