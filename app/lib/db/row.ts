import type { ModelDrivers, Outlet } from "@/lib/types";

/** DB row shape (snake_case) */
export type OutletRow = {
  id: string;
  predicted_liters: number;
  own_max_vol: number;
  gap_liters: number;
  recent_3m_avg: number;
  province: string;
  distributor_id: string;
  competitor_density: number;
  competitor_density_z: number;
  market_saturation: string;
  dbscan_zone: number;
  dbscan_is_core: boolean;
  cluster_id: string;
  cluster_ceiling: number;
  kmeans_ceiling: number;
  qr_ceiling: number;
  base_ensemble: number;
  adjusted_ceiling: number;
  jan_factor: number;
  seasonality_label: string;
  cooler_count: number;
  outlet_size: string;
  outlet_type: string;
  lat: number;
  lon: number;
  decay_transport: number;
  decay_food: number;
  decay_worship: number;
  decay_total: number;
  trade_spend_lkr: number;
  predicted_incremental_liters: number;
  dominant_method: string;
  adjustment_factor: number;
  model_drivers: ModelDrivers | null;
};

export function rowToOutlet(row: OutletRow): Outlet {
  return {
    id: row.id,
    predictedLiters: Number(row.predicted_liters),
    ownMaxVol: Number(row.own_max_vol),
    gapLiters: Number(row.gap_liters),
    recent3mAvg: Number(row.recent_3m_avg),
    province: row.province,
    distributorId: row.distributor_id,
    competitorDensity: Number(row.competitor_density),
    competitorDensityZ: Number(row.competitor_density_z),
    marketSaturation: row.market_saturation,
    dbscanZone: Number(row.dbscan_zone),
    dbscanIsCore: Boolean(row.dbscan_is_core),
    clusterId: row.cluster_id,
    clusterCeiling: Number(row.cluster_ceiling),
    kmeansCeiling: Number(row.kmeans_ceiling),
    qrCeiling: Number(row.qr_ceiling),
    baseEnsemble: Number(row.base_ensemble),
    adjustedCeiling: Number(row.adjusted_ceiling),
    janFactor: Number(row.jan_factor),
    seasonalityLabel: row.seasonality_label,
    coolerCount: Number(row.cooler_count),
    outletSize: row.outlet_size,
    outletType: row.outlet_type,
    lat: Number(row.lat),
    lon: Number(row.lon),
    decayTransport: Number(row.decay_transport),
    decayFood: Number(row.decay_food),
    decayWorship: Number(row.decay_worship),
    decayTotal: Number(row.decay_total),
    tradeSpendLkr: Number(row.trade_spend_lkr),
    predictedIncrementalLiters: Number(row.predicted_incremental_liters),
    dominantMethod: row.dominant_method,
    adjustmentFactor: Number(row.adjustment_factor),
    modelDrivers: row.model_drivers ?? undefined,
  };
}
