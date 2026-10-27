# Loan Approval Modeling and EDA

A privacy-conscious portfolio project on application outcomes, monthly demand, and exploratory binary classification. The published analysis uses aggregate monthly counts only; it does not include application-level records or group-identifying fields.

## Population definitions

The earlier portfolio summary reports **18,782 clear outcomes and a 91.3% approval rate**. The exploratory modeling brief reports a separate **10,993-application modeling subset** (9,973 approved, 1,020 cancelled; 90.7% approved). These figures describe different populations and must not be combined.

The local files supplied with this working copy produce a different application population. The application export has 36,103 rows and 36,093 distinct nonblank application IDs. After collapsing consistent duplicates and excluding three conflicting duplicate IDs, 36,090 unique applications remain. Of these, 31,365 are approved only, 4,498 are cancelled only, and 227 have unknown or ambiguous outcomes. The clear-outcome approval rate is 87.46%. An inner join with the related computation export yields 35,027 clear-outcome applications, not 10,993. The historic summary and model results therefore remain unreconciled with the supplied file versions.

## Trend methodology

- Source: local application-computation export; the raw file is not part of the public project.
- Date: `Trans Date`, parsed strictly as `m/d/yyyy`; it spans 2021-01-02 through 2025-01-07. On the 35,234 distinct IDs matched to the related export, it agrees with `transaction date` for all matched rows and differs from `submitted on` for 43.
- Period: monthly. The extract has observations in every month from January 2021 through January 2025. January 2021 and January 2025 are partial at the date-range edges; the latter contains records only through January 7.
- Application count: one row per nonblank application ID after duplicate handling. Consistent duplicate IDs are collapsed. Duplicate IDs that disagree on date or outcome/workflow flags are excluded.
- Clear outcomes: `Approved = Y` xor `Cancelled = Y`. Both flags set, blank, pending, correction, and other statuses are included in the separately reported unknown/ambiguous count.
- Approval rate: approved / (approved + cancelled). Unknown and ambiguous outcomes are excluded from the denominator.
- Period change: current monthly application count versus the immediately previous month; suppressed for missing months, zero denominators, or partial date-range edge months.
- Moving average: trailing three-month simple mean; shown only when all three calendar months are observed and none is a partial date-range edge month.
- Missing months are emitted as `observed: false` with null counts, not as zero activity.
- The extract spans four calendar years plus a partial fifth year. Month comparisons are descriptive; they do not establish seasonality. No forecast is published because the historical population definition is not reconciled and no backtest was performed.

## Exploratory model results

`results.json` contains the exact metrics supplied in the project brief. The values have not been verified against the current local extract because its joined clear-outcome population differs from the reported 10,993. The majority baseline has the highest raw accuracy because approved cases dominate the reported subset. Macro-F1 and ROC-AUC are more informative for comparing class balance; Extra Trees is the best of the reported models on those metrics (0.558 and 0.674), which indicates only limited separation. Process or customer factors absent from the application-time features may contribute to cancellation, but that is a hypothesis to investigate, not a finding.

The reported preprocessing uses median imputation and standard scaling for numeric features, most-frequent imputation and one-hot encoding for categorical features, and class weighting. Decision/workflow fields were excluded to avoid target leakage. Reported features include application-time financial and demographic fields and categorical application attributes; no branch- or employer-level breakdown is published.

**Confusion matrix:** not included yet. Reconcile the original model run and verify held-out counts before publishing a matrix.

Limitations include a single split, no tuning or cross-validation, no probability calibration, and approximately 1,020 examples in the minority class. Results should not be used as lending decisions.

## Reproduce the monthly aggregate

1. Keep the original application and related exports in a local `data/` folder. Do not commit them. The files supplied here have an `.xls` extension but contain UTF-8 CSV text; the script reads the required columns only.
2. Install the dependency: `python -m pip install -r requirements.txt`.
3. From the repository root, run: `python scripts/build_trend_data.py`.
4. The script runs edge-case checks and writes only aggregated monthly JSON to `assets/loan-trends.json`.

To use a different local input folder or filename, set `DATA_DIR`, `APPLICATIONS_FILE`, and optionally `RELATED_FILE` in the environment. No raw rows or identifier-level outputs are written.
