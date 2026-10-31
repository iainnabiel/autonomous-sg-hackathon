# ML Decisions

Decisions for the model (SG-04 to SG-06) that follow from the organisers' new data notes. Several of them change shared definitions in SG-01.3, SG-02.3 and SG-03, so the backend and dashboard need to follow them too.

Decided by Khaleil, 31 Oct 2026. Iain to confirm the items marked **shared**.

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

### D1. Early-message `risk` is an allowed input (shared)

`risk` (log10 Pc) in a message sent ≥ 2 days out is information an operator already has at prediction time, so it isn't the answer. The model may use it.

The final message's risk, and every `final_*` column, remain forbidden. `ml/data.check_features` enforces this.

**Changes:** SG-02.3 currently says "risk excluded from inference inputs". It becomes "only `risk` from messages with `time_to_tca` ≥ 2 days may be an input".

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

### D4. Evaluation cohort (shared)

- Use only usable encounters, meaning at least one early message: 11,942 of 13,154.
- **Primary cohort:** excludes the 3,050 `final_is_early` encounters, whose final message is itself ≥ 2 days out, so their label is visible in the inputs. That leaves 8,892 encounters.
- Also report results including them, labelled as such.
- Encounters with no early message get the status **"unable to assess"**, never Safe.

**Changes:** SG-03 evaluation must use the same cohort definition so numbers match.

### D5. What "final" means (shared)

- **Training and evaluation labels:** the organisers' definition. The final message is the one with the smallest `time_to_tca`, **including negative values**. 389 encounters have a negative final time.
- **Dashboard "upcoming" views:** keep SG-01.3's smallest **non-negative** `time_to_tca`.

**Changes:** SG-01.3 must say which definition applies where.

### D6. `mission_id` is not a feature

It is a strong shortcut (mission 16 has 83 Critical, 32 Elevated, 0 Safe) and may not carry over to new missions. Revisit only with a mission-grouped check.

## Baseline result

Persistence evaluated on all usable train encounters. It fits nothing, so it needs no split; SG-05.1 will re-run it on the saved validation split for a like-for-like comparison with the model.

| Cohort | n | Critical precision | Critical recall | Critical → Safe misses |
| --- | --- | --- | --- | --- |
| Primary (excludes `final_is_early`) | 8,892 | 0.791 | 0.810 | 13 |
| All usable | 11,942 | 0.851 | 0.866 | 13 |

Target for the upgrade model: catch more of the 112 Critical encounters that persistence misses in the primary cohort, especially the 13 it calls Safe, without a large rise in the 126 false Critical alarms.
