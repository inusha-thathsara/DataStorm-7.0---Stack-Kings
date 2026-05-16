"""
de_checks.py — Reusable, Parameterizable Data Engineering Checks
=================================================================
Phase 2 / Step 4 requirement: implement parameterizable checks applied
consistently across all datasets. Each function is PURE — it takes rows
(list[dict]) and returns (passed_rows, quarantined_rows). Quarantined
rows carry an extra key "failure_reason" for audit trail.

Supported checks
----------------
- strip_whitespace        : strip leading/trailing whitespace from all fields (run first)
- check_duplicates        : PK-based duplicate detection
- check_nulls             : mandatory field null / empty detection
- check_referential_integrity : foreign key existence check
- check_value_range       : numeric field min/max boundary assertion
- check_format_type       : field type/format conformance validation
- normalize_categorical   : string normalisation (typo correction, case)
- run_checks_pipeline     : convenience wrapper to chain multiple checks
"""
from __future__ import annotations

from collections import Counter
from typing import Any, Callable

# ── Reason code constants ─────────────────────────────────────────────────────
RC_DUPLICATE = "pk_duplicate"
RC_NULL = "null_required_field"
RC_REFERENTIAL = "referential_integrity_fail"
RC_RANGE = "value_out_of_range"
RC_FORMAT = "format_type_mismatch"


# ── Type alias ────────────────────────────────────────────────────────────────
Row = dict[str, str]
CheckResult = tuple[list[Row], list[Row]]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tag(row: Row, reason: str) -> Row:
    """Return a shallow copy of row with failure_reason set."""
    r = dict(row)
    existing = r.get("failure_reason", "")
    r["failure_reason"] = f"{existing}|{reason}" if existing else reason
    return r


def _parse_float(v: str) -> float | None:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _parse_int(v: str) -> int | None:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    try:
        return int(v)
    except ValueError:
        return None


# ── Whitespace Strip (always run first) ──────────────────────────────────────

def strip_whitespace(
    rows: list[Row],
    fields: list[str] | None = None,
) -> tuple[list[Row], int]:
    """
    Strip leading/trailing whitespace from all string fields (or a subset).
    Records are never quarantined — this is a pre-processing transform.

    Parameters
    ----------
    rows   : input rows
    fields : field names to strip; if None, all fields are stripped

    Returns
    -------
    (stripped_rows, count_cells_changed)
    """
    stripped: list[Row] = []
    count_changed = 0

    for row in rows:
        new_row = dict(row)
        target = fields if fields is not None else list(row.keys())
        for f in target:
            val = row.get(f, "")
            stripped_val = val.strip()
            if stripped_val != val:
                new_row[f] = stripped_val
                count_changed += 1
        stripped.append(new_row)

    return stripped, count_changed


# ── Check 1: Duplicate Detection ──────────────────────────────────────────────

def check_duplicates(
    rows: list[Row],
    pk_fields: list[str],
    keep: str = "first",
) -> CheckResult:
    """
    Detect duplicate rows based on a composite primary key.

    Parameters
    ----------
    rows       : input rows
    pk_fields  : list of field names forming the composite PK
    keep       : 'first' (default) keeps first occurrence, rejects rest

    Returns
    -------
    (passed, quarantined)  — quarantined rows have failure_reason = RC_DUPLICATE
    """
    seen: set[tuple] = set()
    passed: list[Row] = []
    quarantined: list[Row] = []

    for row in rows:
        pk_key = tuple(row.get(f, "").strip() for f in pk_fields)
        if pk_key in seen:
            quarantined.append(_tag(row, RC_DUPLICATE))
        else:
            seen.add(pk_key)
            passed.append(row)

    return passed, quarantined


# ── Check 2: Null / Empty Field Check ─────────────────────────────────────────

def check_nulls(
    rows: list[Row],
    required_fields: list[str],
) -> CheckResult:
    """
    Flag rows where any required field is null or empty string.

    Parameters
    ----------
    rows            : input rows
    required_fields : fields that must be non-empty

    Returns
    -------
    (passed, quarantined)  — quarantined rows have failure_reason = RC_NULL
    """
    passed: list[Row] = []
    quarantined: list[Row] = []

    for row in rows:
        failed_fields = [
            f for f in required_fields
            if row.get(f, "").strip() == ""
        ]
        if failed_fields:
            reason = f"{RC_NULL}:[{','.join(failed_fields)}]"
            quarantined.append(_tag(row, reason))
        else:
            passed.append(row)

    return passed, quarantined


# ── Check 3: Referential Integrity ────────────────────────────────────────────

def check_referential_integrity(
    rows: list[Row],
    fk_field: str,
    ref_set: set[str],
) -> CheckResult:
    """
    Validate that foreign key values exist in a reference set.

    Parameters
    ----------
    rows      : input rows
    fk_field  : field name whose value must appear in ref_set
    ref_set   : valid set of values (e.g. set of Outlet_IDs from master)

    Returns
    -------
    (passed, quarantined)  — quarantined rows have failure_reason = RC_REFERENTIAL
    """
    passed: list[Row] = []
    quarantined: list[Row] = []

    for row in rows:
        val = row.get(fk_field, "").strip()
        if val not in ref_set:
            reason = f"{RC_REFERENTIAL}:{fk_field}={val!r}"
            quarantined.append(_tag(row, reason))
        else:
            passed.append(row)

    return passed, quarantined


# ── Check 4: Value Range ──────────────────────────────────────────────────────

def check_value_range(
    rows: list[Row],
    field: str,
    min_val: float | int | None = None,
    max_val: float | int | None = None,
    parser: Callable[[str], Any] = _parse_float,
    allow_null: bool = True,
) -> CheckResult:
    """
    Assert that a numeric field falls within [min_val, max_val].

    Parameters
    ----------
    rows       : input rows
    field      : field name to check
    min_val    : inclusive minimum (None = no lower bound)
    max_val    : inclusive maximum (None = no upper bound)
    parser     : function to convert string → numeric value
    allow_null : if True, empty/null values pass (default True)

    Returns
    -------
    (passed, quarantined)  — quarantined rows have failure_reason = RC_RANGE
    """
    passed: list[Row] = []
    quarantined: list[Row] = []

    for row in rows:
        raw = row.get(field, "").strip()
        val = parser(raw)

        if val is None:
            # null handling
            if allow_null:
                passed.append(row)
            else:
                reason = f"{RC_RANGE}:{field}=null"
                quarantined.append(_tag(row, reason))
            continue

        out_of_range = (
            (min_val is not None and val < min_val) or
            (max_val is not None and val > max_val)
        )
        if out_of_range:
            reason = f"{RC_RANGE}:{field}={val}(expected[{min_val},{max_val}])"
            quarantined.append(_tag(row, reason))
        else:
            passed.append(row)

    return passed, quarantined


# ── Check 5: Format / Type Validation ────────────────────────────────────────

def check_format_type(
    rows: list[Row],
    field: str,
    parser: Callable[[str], Any],
    allow_null: bool = True,
) -> CheckResult:
    """
    Validate that a field can be parsed into its expected type/format.

    Parameters
    ----------
    rows       : input rows
    field      : field name to validate
    parser     : callable that returns None on parse failure
    allow_null : if True, empty strings pass; if False they fail

    Returns
    -------
    (passed, quarantined)  — quarantined rows have failure_reason = RC_FORMAT
    """
    passed: list[Row] = []
    quarantined: list[Row] = []

    for row in rows:
        raw = row.get(field, "").strip()

        if not raw:
            if allow_null:
                passed.append(row)
            else:
                reason = f"{RC_FORMAT}:{field}=empty"
                quarantined.append(_tag(row, reason))
            continue

        if parser(raw) is None:
            reason = f"{RC_FORMAT}:{field}={raw!r}"
            quarantined.append(_tag(row, reason))
        else:
            passed.append(row)

    return passed, quarantined


# ── Normalisation (transform, not quarantine) ─────────────────────────────────

def normalize_categorical(
    rows: list[Row],
    field: str,
    mapping: dict[str, str],
    case_insensitive: bool = False,
) -> tuple[list[Row], int]:
    """
    Apply a string normalisation mapping to a categorical field.
    Records are never quarantined — this is a transform.

    Parameters
    ----------
    rows             : input rows (mutated copies returned)
    field            : field name to normalise
    mapping          : {raw_value: canonical_value}
    case_insensitive : if True, match on lower-cased keys

    Returns
    -------
    (normalised_rows, count_transformed)
    """
    normalised: list[Row] = []
    count_transformed = 0

    lookup = (
        {k.lower(): v for k, v in mapping.items()}
        if case_insensitive
        else mapping
    )

    for row in rows:
        raw = row.get(field, "")
        stripped = raw.strip()           # strip whitespace before lookup
        key = stripped.lower() if case_insensitive else stripped
        canonical = lookup.get(key)
        if canonical is not None and canonical != stripped:
            r = dict(row)
            r[field] = canonical
            normalised.append(r)
            count_transformed += 1
        elif stripped != raw:
            # whitespace was the only issue — still write the stripped value
            r = dict(row)
            r[field] = stripped
            normalised.append(r)
            count_transformed += 1
        else:
            normalised.append(dict(row))

    return normalised, count_transformed


# ── Pipeline Convenience Wrapper ──────────────────────────────────────────────

class CheckSummary:
    """Accumulates quarantine counts per reason code for audit reporting."""

    def __init__(self, dataset: str, rows_input: int):
        self.dataset = dataset
        self.rows_input = rows_input
        self.quarantine_counts: Counter = Counter()
        self.transform_counts: Counter = Counter()
        self.rows_clean: int = rows_input

    def record_quarantine(self, quarantined: list[Row]) -> None:
        for row in quarantined:
            reason = row.get("failure_reason", "unknown")
            # extract just the top-level reason code (before the colon)
            code = reason.split(":")[0].split("|")[0]
            self.quarantine_counts[code] += 1
        self.rows_clean -= len(quarantined)

    def record_transform(self, name: str, count: int) -> None:
        self.transform_counts[name] += count

    @property
    def rows_quarantined(self) -> int:
        return self.rows_input - self.rows_clean

    @property
    def pct_quarantined(self) -> float:
        return round(100.0 * self.rows_quarantined / self.rows_input, 2) if self.rows_input else 0.0

    def top_failure_reasons(self, n: int = 3) -> str:
        return "; ".join(
            f"{k}={v}" for k, v in self.quarantine_counts.most_common(n)
        )


def run_checks_pipeline(
    rows: list[Row],
    checks: list[tuple[str, dict]],
) -> tuple[list[Row], list[Row], dict[str, int]]:
    """
    Run a sequence of named checks, accumulating quarantine rows.

    Parameters
    ----------
    rows   : input rows
    checks : list of (check_name, kwargs) tuples, where check_name is one of:
             'duplicates', 'nulls', 'referential_integrity',
             'value_range', 'format_type'

    Returns
    -------
    (clean_rows, all_quarantined, quarantine_count_by_check)
    """
    CHECK_MAP: dict[str, Callable] = {
        "duplicates": check_duplicates,
        "nulls": check_nulls,
        "referential_integrity": check_referential_integrity,
        "value_range": check_value_range,
        "format_type": check_format_type,
    }

    current = rows
    all_quarantined: list[Row] = []
    counts: dict[str, int] = {}

    for check_name, kwargs in checks:
        fn = CHECK_MAP[check_name]
        current, failed = fn(current, **kwargs)
        all_quarantined.extend(failed)
        counts[check_name] = len(failed)

    return current, all_quarantined, counts
