import { readFile } from "fs/promises";
import path from "path";
import type { Outlet, OutletsData, OptimizationSummary } from "@/lib/types";

let cachedOutlets: OutletsData | null = null;
let cachedSummary: OptimizationSummary | null = null;
let cachedManifest: { generatedAt?: string } | null = null;

const DATA_DIR = path.join(process.cwd(), "public", "data");

async function loadOutletsJson(): Promise<OutletsData> {
  if (cachedOutlets) return cachedOutlets;
  const filePath = path.join(DATA_DIR, "outlets.json");
  const raw = await readFile(filePath, "utf-8");
  const data = JSON.parse(raw) as OutletsData;
  if (!data?.outlets?.length) {
    throw new Error("outlets.json is empty — run: py -3.12 src/phase6_export_app_data.py");
  }
  cachedOutlets = data;
  return data;
}

export async function loadJsonOutlets(): Promise<Outlet[]> {
  const data = await loadOutletsJson();
  return data.outlets;
}

export async function loadJsonTotalCount(): Promise<number> {
  const data = await loadOutletsJson();
  return data.count ?? data.outlets.length;
}

export async function loadJsonOptimizationSummary(): Promise<OptimizationSummary> {
  if (cachedSummary) return cachedSummary;
  try {
    const raw = await readFile(path.join(DATA_DIR, "optimization_summary.json"), "utf-8");
    cachedSummary = JSON.parse(raw) as OptimizationSummary;
    return cachedSummary;
  } catch {
    return {};
  }
}

export async function loadJsonGeneratedAt(): Promise<string | null> {
  if (cachedManifest !== null) {
    return cachedManifest.generatedAt ?? null;
  }
  try {
    const raw = await readFile(path.join(DATA_DIR, "export_manifest.json"), "utf-8");
    cachedManifest = JSON.parse(raw) as { generatedAt?: string };
    return cachedManifest.generatedAt ?? null;
  } catch {
    cachedManifest = {};
    return null;
  }
}

/** Clear in-memory cache (tests) */
export function clearJsonCache(): void {
  cachedOutlets = null;
  cachedSummary = null;
  cachedManifest = null;
}
