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

export function getSql() {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!sqlInstance) {
    sqlInstance = postgres(url, { max: 5, idle_timeout: 20 });
  }
  return sqlInstance;
}
