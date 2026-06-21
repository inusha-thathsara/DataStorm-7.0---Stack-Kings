"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { FieldLabel } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { Outlet } from "@/lib/types";

type Props = {
  slotLabel: string;
  value: string;
  excludeId?: string;
  onChange: (id: string) => void;
  className?: string;
};

export function CompareOutletPicker({ slotLabel, value, excludeId, onChange, className }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: "0",
          pageSize: "12",
          sortBy: "id",
          sortDir: "asc",
        });
        if (query.trim()) params.set("search", query.trim());
        const res = await fetch(`/api/outlets?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load outlets");
        const json = (await res.json()) as { outlets?: Outlet[] };
        if (!cancelled) setResults(json.outlets ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <FieldLabel htmlFor={`${listId}-trigger`} className="sr-only">
        Change {slotLabel}
      </FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <button
          id={`${listId}-trigger`}
          type="button"
          className="inline-flex min-w-0 items-center gap-1 rounded-md border border-border bg-surface-card px-2.5 py-1.5 text-sm font-semibold text-brand-accent hover:bg-surface-muted focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/20 no-print"
          aria-expanded={open}
          aria-controls={`${listId}-panel`}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="truncate">{value}</span>
          <span aria-hidden className="text-xs text-text-muted">
            ▾
          </span>
        </button>
        <Link
          href={`/outlet/${value}`}
          className="text-xs font-medium text-text-muted hover:text-brand-accent hover:underline"
        >
          View
        </Link>
      </div>

      {open ? (
        <div
          id={`${listId}-panel`}
          className="absolute z-20 mt-2 w-full min-w-[16rem] max-w-sm rounded-lg border border-border bg-surface-card p-3 shadow-lg no-print"
        >
          <FieldLabel htmlFor={`${listId}-search`}>Search outlet ID</FieldLabel>
          <Input
            id={`${listId}-search`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. OUT_00010"
            autoComplete="off"
            className="mt-1"
          />
          <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border-muted">
            {loading ? (
              <li className="px-3 py-2 text-sm text-text-muted">Searching…</li>
            ) : results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-text-muted">No outlets found.</li>
            ) : (
              results.map((outlet) => {
                const disabled = outlet.id === excludeId;
                return (
                  <li key={outlet.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                      aria-current={outlet.id === value ? "true" : undefined}
                      onClick={() => pick(outlet.id)}
                    >
                      <span className="font-medium text-text-primary">{outlet.id}</span>
                      <span className="shrink-0 tabular-nums text-xs text-text-muted">
                        {outlet.gapLiters.toFixed(0)} L gap
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
