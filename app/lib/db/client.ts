import postgres from "postgres";

export type DataSource = "postgres" | "json";

let sqlInstance: ReturnType<typeof postgres> | null = null;

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || undefined;
}

export function usePostgres(): boolean {
  return Boolean(getDatabaseUrl());
}

export function getDataSource(): DataSource {
  return usePostgres() ? "postgres" : "json";
}

/** Neon pooler works best with prepared statements disabled. */
export function getSql() {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!sqlInstance) {
    sqlInstance = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
      max_lifetime: 60 * 30,
      prepare: false,
    });
  }
  return sqlInstance;
}

export function resetSqlConnection(): void {
  if (sqlInstance) {
    void sqlInstance.end({ timeout: 1 }).catch(() => {});
    sqlInstance = null;
  }
}

const TRANSIENT_DB_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ENETUNREACH",
  "EAI_AGAIN",
  "57P01",
  "57P02",
  "57P03",
  "08006",
  "08001",
  "08004",
]);

export function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: string }).code) : "";
  if (TRANSIENT_DB_CODES.has(code)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /timeout|connect|ECONN|ETIMEDOUT|connection terminated|Connection terminated/i.test(
    message
  );
}

/** Postgres undefined_table — e.g. outlet_explanations not migrated yet. */
export function isMissingRelationError(err: unknown, relation?: string): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: string }).code) : "";
  if (code !== "42P01") return false;
  if (!relation) return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes(relation);
}

function allowJsonFallback(): boolean {
  if (process.env.DB_JSON_FALLBACK === "true") return true;
  if (process.env.DB_JSON_FALLBACK === "false") return false;
  return process.env.NODE_ENV === "development";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a Postgres query with short retries, then optional JSON fallback in dev.
 */
export async function withDbRead<T>(
  label: string,
  pgFn: () => Promise<T>,
  jsonFn: () => Promise<T>
): Promise<{ value: T; dataSource: DataSource }> {
  if (!usePostgres()) {
    return { value: await jsonFn(), dataSource: "json" };
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { value: await pgFn(), dataSource: "postgres" };
    } catch (err) {
      lastErr = err;
      if (attempt < 2 && isTransientDbError(err)) {
        console.warn(`[db/${label}] transient error, retrying (${attempt + 1}/3)`);
        resetSqlConnection();
        await delay(300 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  if (allowJsonFallback()) {
    console.warn(`[db/${label}] Postgres unavailable — using outlets.json fallback`);
    return { value: await jsonFn(), dataSource: "json" };
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
