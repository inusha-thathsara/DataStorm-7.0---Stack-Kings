"""
validate_xai_llm.py — Optional live LLM XAI validation (Workstream 6)
=======================================================================
Spot-checks Ollama and/or Gemini explanations against exported outlet JSON.
Skips gracefully when no LLM is reachable (exit 0). Use --strict to fail on errors.

  python src/validate_xai_llm.py
  python src/validate_xai_llm.py --strict
  python src/validate_xai_llm.py --samples 5
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_DATA = ROOT / "app" / "public" / "data" / "outlets.json"
ENV_LOCAL = ROOT / "app" / ".env.local"


def load_env_local() -> None:
    if not ENV_LOCAL.exists():
        return
    for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def build_xai_prompt(outlet: dict) -> str:
    payload = {
        "outletId": outlet["id"],
        "predictedLiters": outlet["predictedLiters"],
        "ownMaxVol": outlet["ownMaxVol"],
        "gapLiters": outlet["gapLiters"],
        "modelDrivers": outlet.get("modelDrivers"),
        "instructions": (
            "Write 3 short business paragraphs. Use ONLY JSON facts. "
            "Mention at least one qrTopDrivers label/weight and competition adjustment."
        ),
    }
    return (
        "Explain this FMCG outlet prediction in 3 short business paragraphs. "
        "Use ONLY the facts in the JSON below.\n\n"
        + json.dumps(payload, indent=2)
    )


def ollama_explain(outlet: dict) -> str | None:
    if os.environ.get("OLLAMA_ENABLED", "").lower() == "false":
        return None
    base = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", "gemma4:e4b")
    prompt = build_xai_prompt(outlet)
    body = json.dumps({
        "model": model,
        "stream": False,
        "think": False,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a FMCG analytics assistant. Use only provided data. "
                    "Write exactly 3 short paragraphs."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "options": {"temperature": 0.2, "num_predict": 512},
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = (data.get("message") or {}).get("content", "").strip()
        return text or None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def gemini_explain(outlet: dict) -> str | None:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key or key == "your_gemini_key_here":
        return None
    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    prompt = build_xai_prompt(outlet)
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}"
        f":generateContent?key={key}"
    )
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 400},
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return text or None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, IndexError):
        return None


def llm_factuality_ok(outlet: dict, narrative: str) -> tuple[bool, list[str]]:
    issues: list[str] = []
    pred = float(outlet["predictedLiters"])
    own = float(outlet["ownMaxVol"])
    oid = outlet["id"]

    if oid not in narrative:
        issues.append("missing outlet id")
    pred_variants = {f"{pred:.0f}", f"{pred:.1f}", f"{pred:.2f}", f"{int(round(pred))}"}
    if not any(v in narrative for v in pred_variants):
        issues.append("missing predicted liters")
    if own > 0:
        own_variants = {f"{own:.0f}", f"{own:.1f}", f"{int(round(own))}"}
        if not any(v in narrative for v in own_variants):
            issues.append("missing own max")

    md = outlet.get("modelDrivers") or {}
    qr = md.get("qrTopDrivers") or []
    if qr:
        top = qr[0]
        label_word = (top.get("label") or "").split()[0].lower()
        if label_word and label_word not in narrative.lower():
            if str(top.get("weight")) not in narrative:
                issues.append("missing top QR driver reference")
    comp = md.get("competition")
    if comp and "saturation" not in narrative.lower() and "competition" not in narrative.lower():
        issues.append("missing competition adjustment mention")

    # Obvious hallucination: large numbers not in payload
    nums_in_text = set(re.findall(r"\b\d{4,}\b", narrative))
    allowed = {
        str(int(pred)), str(int(own)),
        str(int(outlet.get("tradeSpendLkr", 0) or 0)),
    }
    for n in nums_in_text:
        if int(n) > 5000 and n not in allowed and n not in str(outlet):
            issues.append(f"suspicious number {n}")
            break

    return len(issues) == 0, issues


def main() -> None:
    parser = argparse.ArgumentParser(description="Optional live LLM XAI validation")
    parser.add_argument("--strict", action="store_true", help="Exit 1 if LLM checks fail")
    parser.add_argument("--samples", type=int, default=3, help="Outlets per backend (default 3)")
    args = parser.parse_args()

    load_env_local()
    print("=== XAI Live LLM Validation (optional) ===\n")

    if not APP_DATA.exists():
        print("  Run phase6_export_app_data.py first")
        sys.exit(1 if args.strict else 0)

    data = json.loads(APP_DATA.read_text(encoding="utf-8"))
    outlets = data.get("outlets", [])
    if not outlets:
        print("  No outlets in JSON")
        sys.exit(1 if args.strict else 0)

    # Western outlets with spend — richer XAI context
    candidates = [
        o for o in outlets
        if o.get("province") == "Western" and float(o.get("tradeSpendLkr", 0) or 0) > 0
    ]
    if len(candidates) < args.samples:
        candidates = outlets[: args.samples]
    else:
        candidates = candidates[: args.samples]

    backends: list[tuple[str, callable]] = [
        ("ollama", ollama_explain),
        ("gemini", gemini_explain),
    ]

    any_ran = False
    failures = 0

    for name, fn in backends:
        print(f"  [{name}]")
        ok_count = 0
        for o in candidates:
            text = fn(o)
            if text is None:
                print(f"    {o['id']}: skipped (unavailable)")
                continue
            any_ran = True
            ok, issues = llm_factuality_ok(o, text)
            if ok:
                ok_count += 1
                print(f"    {o['id']}: PASS ({len(text)} chars)")
            else:
                failures += 1
                print(f"    {o['id']}: FAIL — {', '.join(issues)}")
        if any_ran:
            print(f"    {ok_count}/{len(candidates)} passed for {name}\n")

    if not any_ran:
        print("  SKIPPED: no LLM backend reachable (Ollama/Gemini). Template validation still applies.")
        print("  Set OLLAMA_ENABLED=true or GEMINI_API_KEY in app/.env.local to enable.\n")
        sys.exit(0)

    print(f"  Live LLM validation complete ({failures} failures)")
    if failures > 0 and args.strict:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
