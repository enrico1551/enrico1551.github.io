"""Build privacy-safe monthly aggregates from a local application export."""
from __future__ import annotations
import json
import os
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "data"))
APPLICATIONS_FILE = os.environ.get("APPLICATIONS_FILE", "Copy of loan-computations-all-branches-Copy1.xls")
RELATED_FILE = os.environ.get("RELATED_FILE", "Copy of full-computation-list.xls")
OUTPUT_FILE = Path(os.environ.get("OUTPUT_FILE", ROOT / "assets" / "loan-trends.json"))
REQUIRED = ["Comp #", "Trans Date", "Approved", "Cancelled", "Submitted", "For Correction"]
DUPLICATE_CHECK_FIELDS = ["Trans Date", "Approved", "Cancelled", "Submitted", "For Correction"]


def parse_dates(values: pd.Series) -> pd.Series:
    return pd.to_datetime(values.astype("string").str.strip(), format="%m/%d/%Y", errors="coerce")


def load_applications(path: Path) -> tuple[pd.DataFrame, dict]:
    """Read only fields used for time aggregation; exclude inconsistent duplicate IDs."""
    frame = pd.read_csv(path, encoding="utf-8-sig", dtype=str, keep_default_na=False, usecols=REQUIRED)
    raw_rows = len(frame)
    frame["_id"] = frame["Comp #"].str.strip()
    frame["_date"] = parse_dates(frame["Trans Date"])
    frame["_approved_flag"] = frame["Approved"].str.strip().str.upper().eq("Y")
    frame["_cancelled_flag"] = frame["Cancelled"].str.strip().str.upper().eq("Y")
    blank_id_count = int(frame["_id"].eq("").sum())
    frame = frame.loc[frame["_id"].ne("")].copy()
    id_sizes = frame.groupby("_id", sort=False).size()
    duplicate_ids = id_sizes[id_sizes.gt(1)].index
    duplicate_rows = int((id_sizes[id_sizes.gt(1)] - 1).sum())
    duplicate_groups = frame.loc[frame["_id"].isin(duplicate_ids)]
    conflicts = duplicate_groups.groupby("_id", sort=False)[DUPLICATE_CHECK_FIELDS].nunique(dropna=False)
    conflicting_ids = conflicts.index[(conflicts > 1).any(axis=1)]
    frame = frame.loc[~frame["_id"].isin(conflicting_ids)].drop_duplicates("_id", keep="first").copy()
    both_flags = frame["_approved_flag"] & frame["_cancelled_flag"]
    frame["_approved"] = frame["_approved_flag"] & ~frame["_cancelled_flag"]
    frame["_cancelled"] = frame["_cancelled_flag"] & ~frame["_approved_flag"]
    frame["_unknown"] = ~(frame["_approved"] | frame["_cancelled"])
    frame["_period"] = frame["_date"].dt.to_period("M")
    clear = int((frame["_approved"] | frame["_cancelled"]).sum())
    approved = int(frame["_approved"].sum())
    cancelled = int(frame["_cancelled"].sum())
    coverage_start = frame["_date"].min()
    coverage_end = frame["_date"].max()
    metadata = {
        "sourceDescription": "Local application-computation export; aggregated by application month",
        "dateField": "Trans Date",
        "dateFormat": "m/d/yyyy",
        "rawRows": raw_rows,
        "distinctNonblankApplicationIds": int(id_sizes.size),
        "duplicateIds": int(len(duplicate_ids)),
        "duplicateRowsCollapsedOrExcluded": duplicate_rows,
        "conflictingDuplicateIdsExcluded": int(len(conflicting_ids)),
        "blankIdsExcluded": blank_id_count,
        "invalidOrMissingDates": int(frame["_date"].isna().sum()),
        "ambiguousApprovedAndCancelled": int(both_flags.sum()),
        "uniqueDatedApplications": int(frame["_date"].notna().sum()),
        "approvedApplications": approved,
        "cancelledApplications": cancelled,
        "unknownOrPendingApplications": int(frame["_unknown"].sum()),
        "clearOutcomeApplications": clear,
        "approvalRate": approved / (approved + cancelled) if approved + cancelled else None,
        "coverageStartDate": coverage_start.strftime("%Y-%m-%d") if pd.notna(coverage_start) else None,
        "coverageEndDate": coverage_end.strftime("%Y-%m-%d") if pd.notna(coverage_end) else None,
        "periodStart": str(frame["_period"].min()) if frame["_period"].notna().any() else None,
        "periodEnd": str(frame["_period"].max()) if frame["_period"].notna().any() else None,
        "movingAverageWindowMonths": 3,
        "seasonalityNote": "The extract spans calendar years 2021 through 2024 plus a partial January 2025; descriptive month comparisons are possible, but do not claim a stable seasonal pattern.",
        "forecastNote": "No forecast is published; the historical subset and population definition require reconciliation first.",
    }
    return frame, metadata


def build_monthly(frame: pd.DataFrame) -> list[dict]:
    dated = frame.loc[frame["_period"].notna()].copy()
    if dated.empty:
        return []
    grouped = dated.groupby("_period", sort=True).agg(
        total=("_id", "size"), approved=("_approved", "sum"),
        cancelled=("_cancelled", "sum"), unknown=("_unknown", "sum"),
    )
    periods = pd.period_range(grouped.index.min(), grouped.index.max(), freq="M")
    grouped = grouped.reindex(periods)
    first_month, last_month = periods[0], periods[-1]
    first_date, last_date = dated["_date"].min(), dated["_date"].max()
    rows: list[dict] = []
    totals: list[int | None] = []
    for period, row in grouped.iterrows():
        observed = not pd.isna(row["total"])
        total = int(row["total"]) if observed else None
        approved = int(row["approved"]) if observed else None
        cancelled = int(row["cancelled"]) if observed else None
        unknown = int(row["unknown"]) if observed else None
        denominator = (approved or 0) + (cancelled or 0) if observed else 0
        partial_edge = observed and ((period == first_month and first_date.day != 1) or (period == last_month and last_date.day != period.days_in_month))
        totals.append(total)
        rows.append({
            "month": str(period), "observed": observed, "partialDateCoverage": bool(partial_edge), "totalApplications": total,
            "approved": approved, "cancelled": cancelled, "unknownOrPending": unknown,
            "approvalRate": approved / denominator if denominator else None,
            "threeMonthAverageApplications": None, "periodChangeRate": None,
        })
    for i, record in enumerate(rows):
        window = totals[max(0, i - 2):i + 1]
        window_rows = rows[max(0, i - 2):i + 1]
        if len(window) == 3 and all(value is not None for value in window) and all(not item["partialDateCoverage"] for item in window_rows):
            record["threeMonthAverageApplications"] = sum(window) / 3
        if i and not record["partialDateCoverage"] and not rows[i - 1]["partialDateCoverage"] and totals[i] is not None and totals[i - 1] not in (None, 0):
            record["periodChangeRate"] = (totals[i] - totals[i - 1]) / totals[i - 1]
    return rows


def run_self_checks() -> None:
    parsed = parse_dates(pd.Series(["1/2/2024", "", "2024-01-02"]))
    assert parsed.notna().tolist() == [True, False, False]
    fixture = pd.DataFrame({
        "_id": ["a", "b", "c"],
        "_date": pd.to_datetime(["2024-01-01", "2024-01-15", "2024-03-31"]),
        "_period": pd.PeriodIndex(["2024-01", "2024-01", "2024-03"], freq="M"),
        "_approved": [True, False, False], "_cancelled": [False, True, False],
        "_unknown": [False, False, True],
    })
    rows = build_monthly(fixture)
    assert len(rows) == 3
    assert rows[0]["totalApplications"] == 2 and rows[0]["approvalRate"] == 0.5
    assert rows[0]["partialDateCoverage"] is False
    assert rows[1]["observed"] is False and rows[1]["totalApplications"] is None
    assert rows[1]["approvalRate"] is None and rows[1]["periodChangeRate"] is None
    assert rows[2]["unknownOrPending"] == 1 and rows[2]["approvalRate"] is None
    assert rows[2]["threeMonthAverageApplications"] is None and rows[2]["periodChangeRate"] is None


def audit_related_dates(frame: pd.DataFrame, path: Path) -> dict | None:
    """Compare the chosen application date with date fields in the related export."""
    if not path.exists():
        return None
    related = pd.read_csv(path, encoding="utf-8-sig", dtype=str, keep_default_na=False,
                          usecols=["computation #", "transaction date", "submitted on"])
    related["_id"] = related["computation #"].str.strip()
    related = related.loc[related["_id"].ne("")].drop_duplicates("_id", keep="first")
    related["_transaction_date"] = parse_dates(related["transaction date"])
    related["_submitted_on"] = parse_dates(related["submitted on"])
    matched = frame[["_id", "_date", "_approved", "_cancelled"]].merge(related, on="_id", how="inner")
    transaction_match = matched["_date"].eq(matched["_transaction_date"]) & matched["_date"].notna() & matched["_transaction_date"].notna()
    submitted_diff = matched["_date"].ne(matched["_submitted_on"]) & matched["_date"].notna() & matched["_submitted_on"].notna()
    return {
        "matchedUniqueApplicationIds": int(len(matched)),
        "transDateMatchesTransactionDate": int(transaction_match.sum()),
        "transDateDiffersFromTransactionDate": int((~transaction_match & matched["_date"].notna() & matched["_transaction_date"].notna()).sum()),
        "transDateDiffersFromSubmittedOn": int(submitted_diff.sum()),
        "matchedClearOutcomeApplications": int((matched["_approved"] ^ matched["_cancelled"]).sum()),
    }


def main() -> None:
    run_self_checks()
    input_path = DATA_DIR / APPLICATIONS_FILE
    if not input_path.exists():
        raise FileNotFoundError(f"Input not found: {input_path}")
    frame, metadata = load_applications(input_path)
    monthly = build_monthly(frame)
    metadata["relatedDateAudit"] = audit_related_dates(frame, DATA_DIR / RELATED_FILE)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps({"metadata": metadata, "monthly": monthly}, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(monthly)} monthly aggregate records to {OUTPUT_FILE}")
    print("Self-checks passed; output has monthly aggregates only.")


if __name__ == "__main__":
    main()
