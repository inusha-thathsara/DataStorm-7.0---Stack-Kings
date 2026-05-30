import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stack Kings — Outlet Intelligence",
  description: "Potential-Based Trade Marketing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900 text-white shadow-md">
          <div className="mx-auto flex max-w-7xl flex-col gap-0.5 px-4 py-4 md:px-8">
            <h1 className="text-lg font-semibold tracking-tight md:text-xl">
              Stack Kings — Outlet Intelligence
            </h1>
            <p className="text-sm text-slate-400">
              Potential-Based Allocation · January 2026
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
