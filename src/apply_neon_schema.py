"""
Apply app/lib/db/schema.sql to Neon Postgres (psql alternative).

Usage:
  python src/apply_neon_schema.py

Reads DATABASE_URL from the environment or app/.env.local.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from env_local import load_env_local

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "app" / "lib" / "db" / "schema.sql"


def statements_from_sql(text: str) -> list[str]:
    parts: list[str] = []
    for chunk in text.split(";"):
        lines = [
            ln
            for ln in chunk.splitlines()
            if ln.strip() and not ln.strip().startswith("--")
        ]
        stmt = "\n".join(lines).strip()
        if stmt:
            parts.append(stmt)
    return parts


def main() -> None:
    load_env_local()
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("ERROR: DATABASE_URL not set in app/.env.local")
        sys.exit(1)
    if "__NEON_PASSWORD__" in database_url:
        print("ERROR: Replace __NEON_PASSWORD__ in app/.env.local with your Neon password")
        sys.exit(1)

    if not SCHEMA_PATH.exists():
        print(f"ERROR: {SCHEMA_PATH} missing")
        sys.exit(1)

    try:
        import psycopg
    except ModuleNotFoundError:
        print("ERROR: pip install 'psycopg[binary]'")
        sys.exit(1)

    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    statements = statements_from_sql(sql)
    print(f"Applying {len(statements)} statements from {SCHEMA_PATH.name}…")

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
        conn.commit()

    print("Neon schema applied successfully.")


if __name__ == "__main__":
    main()
