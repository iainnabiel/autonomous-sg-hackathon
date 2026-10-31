# ML Decisions

Decisions for the model (SG-04 to SG-06) that follow from the organisers' new data notes. Several of them change shared definitions in SG-01.3, SG-02.3 and SG-03, so the backend and dashboard need to follow them too.

Decided by Khaleil, 31 Oct 2026. The **shared** items (D1, D4, D5) were confirmed by Iain on 31 Oct 2026.

## The task

The organisers' `data_notes.csv` says: *"Predict each event's final_tier using only messages with time_to_tca >= 2 days."*

So the model makes **one prediction per encounter**:

- **Input:** that encounter's messages sent at least 2 days before closest approach ("early messages").
- **Output:** the tier of its final message (Safe / Elevated / Critical).

The model no longer estimates each message's own log Pc.

Data files:

| File | Grain | Use |
| --- | --- | --- |
| `train_data.csv` | one row per message | model inputs (early messages only) |
| `train_event_labels.csv` | one row per train encounter | `final_tier` label; reproduces exactly from `train_data.csv` + tier rules |
| `test_data.csv` | one row per message, all ≥ 2 days out | demo predictions only; no outcomes provided |
| `tier_rules.csv`, `data_notes.csv` | notes | reference |

`event_id` restarts in each file, so encounter IDs must be source-qualified (`train:57`, `test:57`).

## Decisions

### D1. Early-message `risk` is an allowed input (shared, confirmed)

`risk` (log10 Pc) in a message sent ≥ 2 days out is information an operator already has at prediction time, so it isn't the answer. The model may use it.

- **Allowed:** the ordinary `risk` column of any eligible message, meaning raw `time_to_tca` ≥ 2 days.
- **Excluded from features:** every message with raw `time_to_tca` < 2 days, and every `final_*` label field. `ml/data.early_messages` applies the cutoff and `ml/data.check_features` rejects the workbook's `final_*` label columns.
- **Eligible final message:** if an encounter's final message is itself ≥ 2 days out, its ordinary `risk` is an eligible input like any other. That encounter stays in the all-usable cohort; D4 excludes it from the primary cohort because its label is visible in the inputs.

**Changes:** Only `risk` from messages with raw `time_to_tca` ≥ 2 days may be an inference input. Later-message `risk` and all `final_*` fields stay excluded. SG-02.3 does not exclude every `risk` value.

### D2. Headline metric

The headline metric is **Critical recall against the persistence baseline, at a comparable false-alarm level**. We'll also report:

- per-tier precision and recall, with support counts
- confusion matrices
- the number of Critical encounters predicted Safe

Accuracy and macro-F1 are never the headline.

### D3. Approach: persistence rule plus Critical upgrade

1. **Persistence (SG-05.1 baseline):** apply the tier rules to the latest early message.
2. **Upgrade model (SG-05.2):** a binary classifier predicts "will this encounter end Critical?". If its probability passes a threshold chosen on validation, it raises the tier to Critical. It never lowers a tier.

Receipts can then say which rule set the base tier and why the model escalated it.

### D4. Evaluation cohort (shared, confirmed)

- Use only usable encounters, meaning at least one early message: 11,942 of 13,154.
- **Primary cohort:** excludes the 3,050 `final_is_early` encounters, whose final message is itself ≥ 2 days out, so their label is visible in the inputs. That leaves 8,892 encounters.
- Also report results including them, labelled as such.
- Encounters with no early message get the status **"unable to assess"**, never Safe.

These counts are the same whether computed from raw `train_data.csv` or from the workbook's rounded values, because no encounter's raw final time is within rounding distance of 2 days.

**Changes:** SG-03 evaluation must use the same cohort definition so numbers match. The cohort is per encounter, so SG-03 joins predictions to labels by source-qualified encounter ID. SG-02.3 must return "unable to assess" for encounters with no early message.

### D5. What "final" means (shared, confirmed)

- **Training and evaluation labels:** the organisers' definition. The final message is the one with the smallest raw `time_to_tca`, **including negative values**. 391 encounters have a negative raw final time.
- **Dashboard "upcoming" views:** keep SG-01.3's smallest **non-negative** raw `time_to_tca`. 11 train encounters have no non-negative message, so they have no upcoming observation.

**Raw values, not rounded ones.** The workbook's `final_*` columns are rounded to 4 decimal places. Events 10630 and 12907 have raw final times of about −1.6 s and −2.0 s, which display as −0.0, so the workbook shows 389 negative finals instead of 391. Selection, the 2-day cutoff, the negative-time test and `final_is_early` use raw `train_data.csv` values. Rounding is for display only.

**Changes:** SG-01.3 must say which definition applies where, and that both use raw `time_to_tca`.

### D7. Upgrade budget: at most 3 false alarms per extra Critical caught

An upgrade to Critical must be right at least 25% of the time (`MIN_UPGRADE_PRECISION` in `ml/config.py`). A missed Critical encounter can mean a collision, while a false alarm costs one operator review.

The threshold is chosen on 5-fold out-of-fold predictions from the **training** partition, never on validation. A stricter rule ("overall Critical precision must not drop") blocked every upgrade, because no upgrade can be as precise as the rule's own Critical calls.

`p_critical` is also returned for every encounter, so the backend can rank the review queue by it (SG-03.3) whether or not a tier was upgraded.

### D8. Ship the `base` feature set

`max_risk_estimate` (SG-05.3) raised ranking AUC only from 0.896 to 0.908 on training folds and caught fewer Critical encounters on validation (see results). The shipped model doesn't use it, so there's no dependence on an existing risk estimate to disclose.

### D6. `mission_id` is not a feature

It is a strong shortcut (mission 16 has 83 Critical, 32 Elevated, 0 Safe) and may not carry over to new missions. Revisit only with a mission-grouped check.

## Baseline result

Persistence evaluated on all usable train encounters. It fits nothing, so it needs no split; SG-05.1 will re-run it on the saved validation split for a like-for-like comparison with the model.

| Cohort | n | Critical precision | Critical recall | Critical → Safe misses |
| --- | --- | --- | --- | --- |
| Primary (excludes `final_is_early`) | 8,892 | 0.791 | 0.810 | 13 |
| All usable | 11,942 | 0.851 | 0.866 | 13 |

Target for the upgrade model: catch more of the 112 Critical encounters that persistence misses in the primary cohort, especially the 13 it calls Safe, without a large rise in the 126 false Critical alarms.

## Validation results (SG-05)

Validation partition, primary cohort: 1,786 encounters, 126 Critical. Each threshold was fixed on training folds before scoring. Reproduce with `python -m ml.train --model persistence` and `python -m ml.train --model upgrade --features base` (or `base_mre`); full metrics are in `ml/reports/*.json`.

| Model | Critical recall (95% CI) | Critical precision | Upgrades | False Critical alarms | Critical → Safe |
| --- | --- | --- | --- | --- | --- |
| Persistence (SG-05.1) | 0.802 (0.730–0.865) | 0.765 | — | 31 | 2 |
| **Upgrade, `base` (SG-05.2), shipped** | **0.873 (0.817–0.929)** | 0.679 | 30 | 52 | 2 |
| Upgrade, `base_mre` (SG-05.3) | 0.833 (0.762–0.897) | 0.750 | 8 | 35 | 2 |

**What this shows:**
- The shipped model catches **9 more of 126** Critical encounters than the rule, at the cost of 21 more false alarms. That's 30% upgrade precision, within the D7 budget.
- The confidence intervals overlap, so the gain is real but modest at this sample size.
- **Limitation:** neither model rescues the 2 Critical encounters that look Safe 2 days out.
