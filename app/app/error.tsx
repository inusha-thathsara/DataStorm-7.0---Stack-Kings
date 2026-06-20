"use client";

import { useEffect } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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
    <Card className="max-w-2xl">
      <Alert title="Something went wrong" variant="error">
        <p>{error.message}</p>
        {isChunk && (
          <p className="mt-3">
            This is usually a stale Next.js build cache. Stop the server, then from the{" "}
            <code className="rounded bg-red-100 px-1">app</code> folder run:{" "}
            <code className="rounded bg-red-100 px-1">npm run build:clean</code> or{" "}
            <code className="rounded bg-red-100 px-1">npm run dev:clean</code>
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => reset()}>
            Try again
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </Alert>
    </Card>
  );
}
