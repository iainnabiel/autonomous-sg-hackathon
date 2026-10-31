"""SG-04.1 Profile data quality.

Run:    python -m ml.profile_data
Writes: ml/reports/data_profile.md

Reports schema, missingness, ranges, label consistency, cohort counts, and suspected
sentinel values. Nothing is removed here: findings feed SG-04.3 and docs/ML_DECISIONS.md.
"""

from datetime import date

import numpy as np
import pandas as pd

from ml.config import (
    CRITICAL_DISTANCE_M,
    CRITICAL_LOG_PC,
    LABELS_CSV,
    MESSAGE_CATEGORICAL,
    MESSAGE_NUMERIC,
    REPORTS_DIR,
    RISK_FEATURE,
    RISK_FLOOR,
    TIERS,
)
from ml.data import SOURCES, early_messages, file_sha256, load_labels, load_messages, tier

PROFILE_COLUMNS = MESSAGE_NUMERIC + [RISK_FEATURE]
SIGMA_COLUMNS = ["c_sigma_r", "t_sigma_r"]


def _table(df: pd.DataFrame) -> str:
    return df.to_markdown()


def _column_profile(messages: pd.DataFrame) -> pd.DataFrame:
    cols = messages[PROFILE_COLUMNS]
    return pd.DataFrame(
        {
            "dtype": cols.dtypes.astype(str),
            "missing": cols.isna().sum(),
            "missing %": (cols.isna().mean() * 100).round(2),
            "min": cols.min(),
            "median": cols.median(),
            "max": cols.max(),
        }
    )


def _sentinels(messages: pd.DataFrame) -> pd.DataFrame:
    """Values repeated at a column's extreme: candidates for placeholders, not proven invalid."""
    rows = []
    for col in PROFILE_COLUMNS:
        values = messages[col].dropna()
        for label, extreme in (("min", values.min()), ("max", values.max())):
            count = int((values == extreme).sum())
            if count >= 10:
                rows.append(
                    {
                        "column": col,
                        "at": label,
                        "value": extreme,
                        "rows": count,
                        "% rows": round(100 * count / len(messages), 2),
                        "encounters": messages.loc[messages[col] == extreme, "encounter_id"].nunique(),
                    }
                )
    return pd.DataFrame(rows).set_index("column") if rows else pd.DataFrame()


def _section_messages(source: str, messages: pd.DataFrame) -> list[str]:
    early = early_messages(messages)
    lines = [
        f"## {source}_data.csv",
        "",
        f"- Messages: {len(messages):,}; encounters: {messages['encounter_id'].nunique():,}",
        f"- Early messages (time_to_tca ≥ 2 days): {len(early):,}, "
        f"covering {early['encounter_id'].nunique():,} encounters",
        f"- Negative time_to_tca (after closest approach): {(messages['time_to_tca'] < 0).sum():,} messages",
        f"- risk at the {RISK_FLOOR:g} floor: {(messages['risk'] <= RISK_FLOOR).mean():.1%} of messages",
        f"- Duplicate (event_id, time_to_tca) pairs: {messages.duplicated(['event_id', 'time_to_tca']).sum():,}",
        "",
        "### Columns",
        "",
        _table(_column_profile(messages)),
        "",
        "### c_object_type",
        "",
        _table(messages[MESSAGE_CATEGORICAL[0]].value_counts(dropna=False).to_frame("messages")),
        "",
        "### Suspected sentinel values",
        "",
        "Extremes shared by 10 or more messages. These are investigated, not removed.",
        "",
    ]
    sentinels = _sentinels(messages)
    lines.append(_table(sentinels) if not sentinels.empty else "None found.")
    lines.append("")
    return lines


def _section_labels(labels: pd.DataFrame, train: pd.DataFrame) -> list[str]:
    final = train.sort_values(["encounter_id", "time_to_tca"]).groupby("encounter_id").head(1)
    final = final.set_index("encounter_id").loc[labels.index]
    reproduced = (tier(final["risk"], final["miss_distance"]) == labels["final_tier"]).mean()

    usable = labels[labels["usable"]]
    primary = usable[~usable["final_is_early"]]
    support = pd.DataFrame(
        {
            "all encounters": labels["final_tier"].value_counts(),
            "usable": usable["final_tier"].value_counts(),
            "primary cohort": primary["final_tier"].value_counts(),
        }
    ).reindex(TIERS)

    critical = primary[primary["final_tier"] == "Critical"]
    by_pc = critical["final_risk_log10_pc"] >= CRITICAL_LOG_PC
    by_distance = critical["final_miss_distance_m"] < CRITICAL_DISTANCE_M
    return [
        "## train_event_labels.csv",
        "",
        f"- Encounters: {len(labels):,}; final_tier reproduced from train_data + tier rules: {reproduced:.1%}",
        f"- Usable (≥ 1 early message): {len(usable):,}; unusable → \"unable to assess\": {(~labels['usable']).sum():,}",
        f"- final_is_early (final message itself ≥ 2 days out, excluded from primary cohort): "
        f"{usable['final_is_early'].sum():,}",
        f"- Primary cohort: {len(primary):,} encounters",
        f"- Final message after closest approach (negative final_time_to_tca): "
        f"{(labels['final_time_to_tca_days'] < 0).sum():,}",
        f"- Final risk at the {RISK_FLOOR:g} floor: {(labels['final_risk_log10_pc'] <= RISK_FLOOR).mean():.1%}",
        "",
        "### Tier support",
        "",
        _table(support),
        "",
        "### Why primary-cohort encounters are Critical",
        "",
        f"- By distance (< {CRITICAL_DISTANCE_M:g} m) only: {(by_distance & ~by_pc).sum():,}",
        f"- By Pc (risk ≥ {CRITICAL_LOG_PC:g}) only: {(by_pc & ~by_distance).sum():,}",
        f"- Both: {(by_pc & by_distance).sum():,}",
        "",
        "### Tier by mission_id (not a feature; see D6)",
        "",
        _table(pd.crosstab(labels["mission_id"], labels["final_tier"]).reindex(columns=TIERS, fill_value=0)),
        "",
    ]


def main() -> None:
    train = load_messages("train")
    test = load_messages("test")
    labels = load_labels()

    lines = [
        "# Data profile (SG-04.1)",
        "",
        f"Generated by `python -m ml.profile_data` on {date.today().isoformat()}. Do not edit by hand.",
        "",
        "| File | SHA-256 |",
        "| --- | --- |",
        *[f"| `{path.name}` | `{file_sha256(path)}` |" for path in [*SOURCES.values(), LABELS_CSV]],
        "",
        "Units (organisers' data_notes.csv): miss_distance and relative_position_* in metres, "
        "relative_speed in m/s, time_to_tca in days. Sigma units are not stated.",
        "",
    ]
    lines += _section_labels(labels, train)
    lines += _section_messages("train", train)
    lines += _section_messages("test", test)

    test_ids = test["event_id"].unique()
    overlap = np.isin(test_ids, train["event_id"].unique()).sum()
    lines += [
        "## Cross-file checks",
        "",
        f"- {overlap:,} of {len(test_ids):,} test event_ids also appear in train. They are different encounters "
        "(IDs restart per file), so encounter IDs are source-qualified.",
        f"- test_data.csv minimum time_to_tca: {test['time_to_tca'].min():.3f} days (all messages are early).",
        "",
        "## Interpretation (carried into SG-04.3)",
        "",
        "- `risk = -30` is the organisers' placeholder for Pc too small to compute. Kept as a value (Pc ≈ 0).",
        "- `c_sigma_r` / `t_sigma_r` = 6.378136e7 is ten times Earth's radius in metres and repeats exactly, "
        "so it is treated as a suspected placeholder for unknown uncertainty: kept, flagged with an indicator "
        "feature, and excluded from the miss-distance/sigma ratio. Not confirmed with the organisers.",
        "- `F10` = 66 and `AP` = 0 repeat at the minimum but are physically plausible (quiet solar and "
        "geomagnetic conditions), so they are kept as real values.",
        "- `F10` and `AP` are missing together in about 4–5% of messages; imputed with an indicator.",
        "- Most Critical labels come from miss distance, not Pc, so the model is effectively forecasting "
        "whether the final miss distance falls below 1 km.",
        "",
    ]

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out = REPORTS_DIR / "data_profile.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {out.relative_to(REPORTS_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
