-- Stack Kings outlet intelligence — Phase 1 schema
-- Run once against Neon: psql $DATABASE_URL -f app/lib/db/schema.sql

CREATE TABLE IF NOT EXISTS export_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  predictions_sha256_prefix TEXT,
  audit_passed BOOLEAN NOT NULL DEFAULT FALSE,
  row_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS outlets (
  id TEXT PRIMARY KEY,
  predicted_liters DOUBLE PRECISION NOT NULL,
  own_max_vol DOUBLE PRECISION NOT NULL DEFAULT 0,
  gap_liters DOUBLE PRECISION NOT NULL DEFAULT 0,
  recent_3m_avg DOUBLE PRECISION NOT NULL DEFAULT 0,
  province TEXT NOT NULL DEFAULT '',
  distributor_id TEXT NOT NULL DEFAULT '',
  competitor_density DOUBLE PRECISION NOT NULL DEFAULT 0,
  competitor_density_z DOUBLE PRECISION NOT NULL DEFAULT 0,
  market_saturation TEXT NOT NULL DEFAULT '',
  dbscan_zone INTEGER NOT NULL DEFAULT -1,
  dbscan_is_core BOOLEAN NOT NULL DEFAULT FALSE,
  cluster_id TEXT NOT NULL DEFAULT '',
  cluster_ceiling DOUBLE PRECISION NOT NULL DEFAULT 0,
  kmeans_ceiling DOUBLE PRECISION NOT NULL DEFAULT 0,
  qr_ceiling DOUBLE PRECISION NOT NULL DEFAULT 0,
  base_ensemble DOUBLE PRECISION NOT NULL DEFAULT 0,
  adjusted_ceiling DOUBLE PRECISION NOT NULL DEFAULT 0,
  jan_factor DOUBLE PRECISION NOT NULL DEFAULT 1,
  seasonality_label TEXT NOT NULL DEFAULT '',
  cooler_count INTEGER NOT NULL DEFAULT 0,
  outlet_size TEXT NOT NULL DEFAULT '',
  outlet_type TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL DEFAULT 0,
  lon DOUBLE PRECISION NOT NULL DEFAULT 0,
  decay_transport DOUBLE PRECISION NOT NULL DEFAULT 0,
  decay_food DOUBLE PRECISION NOT NULL DEFAULT 0,
  decay_worship DOUBLE PRECISION NOT NULL DEFAULT 0,
  decay_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  trade_spend_lkr DOUBLE PRECISION NOT NULL DEFAULT 0,
  predicted_incremental_liters DOUBLE PRECISION NOT NULL DEFAULT 0,
  dominant_method TEXT NOT NULL DEFAULT '',
  adjustment_factor DOUBLE PRECISION NOT NULL DEFAULT 1,
  model_drivers JSONB
);

CREATE INDEX IF NOT EXISTS idx_outlets_province ON outlets (province);
CREATE INDEX IF NOT EXISTS idx_outlets_distributor ON outlets (distributor_id);
CREATE INDEX IF NOT EXISTS idx_outlets_id_lower ON outlets (LOWER(id));
CREATE INDEX IF NOT EXISTS idx_outlets_gap_liters ON outlets (gap_liters DESC);
CREATE INDEX IF NOT EXISTS idx_outlets_predicted_liters ON outlets (predicted_liters DESC);
CREATE INDEX IF NOT EXISTS idx_outlets_trade_spend ON outlets (trade_spend_lkr DESC);

CREATE TABLE IF NOT EXISTS outlet_explanations (
  outlet_id TEXT PRIMARY KEY REFERENCES outlets(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  source TEXT NOT NULL,
  model TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outlet_explanations_generated ON outlet_explanations (generated_at DESC);

CREATE TABLE IF NOT EXISTS optimization_summary (
  metric TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
