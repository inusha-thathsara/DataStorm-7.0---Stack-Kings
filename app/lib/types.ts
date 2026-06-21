export type QrFeatureDriver = {
  feature: string;
  label: string;
  weight: number;
  standardizedValue: number;
  contributionLiters: number;
  direction: "up" | "down";
};

export type ModelDrivers = {
  dominantMethod: string;
  winningCeilingMethod: string;
  kmeansCeilingLiters: number;
  qrCeilingLiters: number;
  baseEnsembleLiters: number;
  competition: {
    normalizedDensity: number;
    saturationPenalty: number;
    isolationBoost: number;
    combinedAdjustmentFactor: number;
    gamma: number;
    delta: number;
  };
  kmeansPeerSignal: string;
  qrTopDrivers: QrFeatureDriver[];
  qrModelTau?: number | null;
  qrInterceptLiters?: number;
};

export type Outlet = {
  id: string;
  predictedLiters: number;
  ownMaxVol: number;
  gapLiters: number;
  recent3mAvg: number;
  province: string;
  distributorId: string;
  competitorDensity: number;
  competitorDensityZ: number;
  marketSaturation: string;
  dbscanZone: number;
  dbscanIsCore: boolean;
  clusterId: string;
  clusterCeiling: number;
  kmeansCeiling: number;
  qrCeiling: number;
  baseEnsemble: number;
  adjustedCeiling: number;
  janFactor: number;
  seasonalityLabel: string;
  coolerCount: number;
  outletSize: string;
  outletType: string;
  lat: number;
  lon: number;
  decayTransport: number;
  decayFood: number;
  decayWorship: number;
  decayTotal: number;
  tradeSpendLkr: number;
  predictedIncrementalLiters: number;
  dominantMethod: string;
  adjustmentFactor: number;
  modelDrivers?: ModelDrivers;
};

export type OptimizationSummary = Record<string, string>;

export type OutletsData = {
  outlets: Outlet[];
  count: number;
};

/** Which backend produced the outlet XAI narrative */
export type ExplainSource = "ollama" | "gemini" | "template";

export type CachedExplanation = {
  outletId: string;
  payload: import("./explainSchema").StructuredExplanation;
  source: ExplainSource;
  model: string | null;
  generatedAt: string;
};

/** Proof-of-inference metadata from a verified Ollama /api/chat response */
export type ExplainMeta = {
  model: string;
  evalCount: number;
  totalDurationMs: number;
  loadDurationMs: number;
  promptEvalCount: number;
};
