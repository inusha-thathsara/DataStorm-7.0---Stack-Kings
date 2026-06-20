import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { DataAsOf } from "@/components/DataAsOf";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stack Kings — Outlet Intelligence",
  description:
    "Potential-based trade marketing allocation for 20,000 FMCG outlets. Ensemble ceiling model, LKR 5M optimizer, and explainable AI.",
  openGraph: {
    title: "Stack Kings — Outlet Intelligence",
    description: "Potential-Based Trade Marketing · Data Storm 7.0",
    type: "website",
    siteName: "Stack Kings",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-brand-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-header focus:outline-none"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-brand-navy text-text-inverse shadow-header">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-bold shadow-md shadow-emerald-900/30"
                aria-hidden
              >
                SK
              </div>
              <div className="min-w-0">
                <Link
                  href="/"
                  className="block truncate text-lg font-semibold tracking-tight transition-colors hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy md:text-xl"
                >
                  Stack Kings — Outlet Intelligence
                </Link>
                <p className="truncate text-xs text-slate-400 md:text-sm">
                  Potential-Based Allocation · January 2026 · 20,000 outlets
                </p>
              </div>
            </div>
            <nav className="flex shrink-0 items-center gap-3" aria-label="Site">
              <span className="hidden rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300 sm:inline">
                Data Storm 7.0
              </span>
            </nav>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8"
        >
          {children}
        </main>
        <footer className="border-t border-border bg-surface-card/80 py-5 text-center backdrop-blur-sm">
          <p className="text-xs text-text-secondary">
            Stack Kings · Medallion pipeline → ensemble model → LKR 5M optimizer · Explainable AI
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            January 2026 · Western Province pilot · 20,000 outlets
          </p>
          <div className="mt-2">
            <DataAsOf />
          </div>
        </footer>
      </body>
    </html>
  );
}
