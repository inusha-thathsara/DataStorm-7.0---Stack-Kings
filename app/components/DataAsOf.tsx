"use client";

import { useEffect, useState } from "react";

type Health = {
  ok: boolean;
  dataSource: "postgres" | "json";
  generatedAt: string | null;
};

export function DataAsOf() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((json: Health) => setHealth(json))
      .catch(() => setHealth(null));
  }, []);

  if (!health?.generatedAt) return null;

  const date = new Date(health.generatedAt);
  const label = Number.isNaN(date.getTime())
    ? health.generatedAt
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });

  return (
    <p className="text-center text-[11px] text-text-muted">
      Data as of {label}
      {health.dataSource === "json" && (
        <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-amber-800">
          local JSON fallback
        </span>
      )}
    </p>
  );
}
