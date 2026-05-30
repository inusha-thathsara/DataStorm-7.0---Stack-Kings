"use client";

import { useEffect } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isChunk =
    error.message.includes("Cannot find module") ||
    error.message.includes("ChunkLoadError") ||
    error.message.includes("./");

  return (
    <Alert title="Something went wrong">
      <p>{error.message}</p>
      {isChunk && (
        <p className="mt-3 text-red-800">
          This is usually a stale Next.js build cache. Stop the server, then from the{" "}
          <code className="rounded bg-red-100 px-1">app</code> folder run:{" "}
          <code className="rounded bg-red-100 px-1">npm run build:clean</code> or{" "}
          <code className="rounded bg-red-100 px-1">npm run dev:clean</code>
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => reset()}>
          Try again
        </Button>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
    </Alert>
  );
}
