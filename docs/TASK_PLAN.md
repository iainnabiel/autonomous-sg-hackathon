# Task Plan

This plan adds a review queue, decision receipts, and update comparisons, and makes uncertainty and the radar more precise. Task IDs are unchanged from the first plan; the tables below replace the earlier descriptions and acceptance criteria. Completed work only needs updating where the requirements changed.

## Labels

| Label | Meaning |
| --- | --- |
| **Core** | Required. |
| **Next** | Build after the core works. |
| **Stretch** | Optional. |
| **New** | Added in this revision. |
| **Updated** | Requirements changed in this revision. |

These development labels are separate from the operator queue priorities (Immediate / High / Scheduled / Routine).

> **Update, 31 Oct:** the organisers' data notes changed the ML target to each encounter's final tier, predicted from messages ≥ 2 days before closest approach. [ML_DECISIONS.md](ML_DECISIONS.md) records how this changes SG-01.3, SG-02.3, SG-03, and SG-05. Iain confirmed D1, D4, and D5 on 31 Oct 2026. D2, D3, and D6 are unchanged. Where the two documents disagree, ML_DECISIONS.md applies.

## Ownership

| Owner | Area | Stories |
| --- | --- | --- |
| Iain | Contracts, backend, evaluation | SG-01, SG-02, SG-03 |
| Khaleil | Data, model, limitations | SG-04, SG-05, SG-06 |
| Shanya | Dashboard, evidence, demo | SG-07, SG-08, SG-09 |

## Workflow and order

- One subtask → one feature branch → one PR → teammate review → human merge.
- Finish the SG-01 contracts first, then build the model, backend, and dashboard in parallel.
- Integrate queue + receipt + radar **before** adding review controls, update comparisons, or the sensitivity explorer.

---

## Iain — Contracts, backend, evaluation

### SG-01 · Core — Shared project foundation

*As a developer, I want shared interfaces and policies so the model, backend, and dashboard integrate consistently.*

**Done when:** contracts define prediction, classification, priority, quality flags, and evidence; all teammates use the same definitions.

| ID | Task | Description | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| SG-01.1 | Project structure and ownership | Maintain `backend/`, `evaluation/`, `ml/`, `frontend/`, and `contracts/`. | Ownership and startup commands documented; datasets, secrets, and large generated artifacts excluded from Git. | In review |
| SG-01.2 | Extend shared contracts | Specify observation identity, the separate risk and forecast fields, queue priority names, receipt, history, and metrics responses. | Encounter ID is source-qualified (`train:57`) and is a different type from observation ID (`train:1234`). Title-case tiers are Safe, Elevated, Critical. `unable_to_assess` has a null forecast tier and an explicit status. Supplied early risk, current rule tier, forecast final tier, uncalibrated `p_critical`, and optional predicted final Pc are separate; the current model leaves predicted final Pc null. Model version, policy version, quality flags, and reason codes are included. Unavailable values use null plus status. Priority names are reserved; SG-01.4 assigns them. | In review |
| SG-01.3 | Define data and snapshot conventions | Document confirmed units, encounter-grouped splitting, label versus upcoming selection, the 2-day inference cutoff, and historical-view limits. | Miss distance and relative position are metres, relative speed is m/s, and `time_to_tca` is days. Hours are a display conversion. Sigma units stay unconfirmed. Labels use the smallest raw `time_to_tca`, including negative values: 391 encounters in `train_data.csv`. Upcoming views use the smallest nonnegative raw `time_to_tca`. The workbook's rounded `final_time_to_tca_days` counts 389 negatives because events 10630 and 12907 are stored as −0. Comparisons and filtering use raw values; rounding is display only. Eleven train encounters have no nonnegative message. Early inference uses only TCA at or above 2 days, and exactly 2.0 is eligible. Ties break by smaller observation row index, then source name. A forecast shown inside 2 days keeps its source observation and TCA and is marked carried forward. Inputs below 2 days are not scored. The split remains the saved encounter-grouped split. There is no shared live calendar timeline. | In review |
| SG-01.4 · New | Define triage policy | Establish transparent queue rules separate from risk classification. | **Immediate:** critical within 24h. **High:** other critical, or elevated within 24h. **Scheduled:** other elevated. **Routine:** safe with adequate inputs. Policy is versioned and labelled a prototype; incomplete assessments have a separate review route. | Not started |

### SG-02 · Core — Explainable review queue

*As an operator, I want to know which encounter to review next and why.*

**Done when:** real predictions feed a deterministic queue; risk, urgency, and data quality remain distinguishable.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-02.1 | Validate inputs and units | Validate telemetry and convert units centrally. | Invalid required inputs cannot produce "safe"; optional imputation is flagged; negative TCA excluded from upcoming views; supplied sigma fields are not described as model confidence. |
| SG-02.2 | Implement risk classification | Apply the brief's probability and distance thresholds, critical first. | **Critical** if log-risk ≥ −4 or distance < 1 km; otherwise **elevated** if log-risk ≥ −6 or distance ≤ 5 km; otherwise **safe**. Exact boundaries tested. A known critical trigger remains visible even if another assessment input is missing. |
| SG-02.3 | Integrate model estimates | Load the real pipeline or its reproducible prediction outputs. | Only `risk` from messages with `time_to_tca` ≥ 2 days may be an inference input. Later-message `risk` stays excluded. `final_*` labels, identifiers, `mission_id`, and full-event metadata are excluded. Predictions carry model version and observation identity. Unavailable inference returns status `unavailable` and a null forecast tier. No fabricated results. |
| SG-02.4 | Implement queue and encounter APIs | Return one selected observation per encounter, priority, history, and quality status. | Queue follows SG-01.4; within bands sort by TCA with deterministic ties; incomplete cases remain visible outside Routine; history order is correct. |
| SG-02.5 | Implement radar summaries | Aggregate selected encounters by relative TCA and risk tier. | Distinct-encounter counts match filters; 0–24h window includes boundaries; empty test window shown honestly; historical view is labelled; no fabricated calendar timestamps. |
| SG-02.6 · New | Generate decision receipts | Create a structured record explaining each assessment and escalation. | Contains observation ID, supplied early risk, current rule tier, forecast final tier, `p_critical` only when present and labelled as the uncalibrated final-tier class score, supplied distance and TCA, carried-forward source observation when used, quality flags, reason codes, and model and policy versions. A known current Critical trigger stays visible when the forecast is null. `p_critical` is not called a collision probability. Predicted final Pc is null for the current model. |
| SG-02.7 · Next · New | Detect assessment changes | Compare consecutive observations of the same encounter. | Reports tier changes, threshold crossings, distance/Pc changes, and new quality issues; identifies both observations; first observation has no invented previous state. |
| SG-02.8 · Next · New | Track human review status | Support Unreviewed, Acknowledged, and Escalated for planning. | Status changes do not alter risk; review is linked to an observation; a new tier escalation, urgent-band crossing, or assessment failure marks the encounter for renewed review; storage limitations documented. |

### SG-03 · Core — Independent evaluation and delivery

*As a judge, I want evidence that both the model and queue add value.*

**Done when:** reproducible metrics distinguish probability estimation, operational classification, and prioritisation.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-03.1 | Validate evaluation joins | Join predictions to labels by source-qualified encounter ID (`train:57`). | Duplicate/missing/unexpected IDs detected; shuffling rows does not change results; source-qualified encounter IDs prevent cross-file collisions. One forecast is joined per encounter, not per observation. |
| SG-03.2 | Evaluate detection | Score forecast final tier on held-out training encounters that have final labels. | Use the saved encounter-grouped split. Report the primary cohort and all usable encounters separately. The primary cohort excludes `final_is_early`. An encounter with no eligible early message is unable to assess, never Safe. Headline is Critical recall against the persistence baseline at a comparable false-alarm level, with per-tier precision, recall, support, and confusion matrices. Accuracy is not the headline. `p_critical` stays separate from Pc. Test final-tier accuracy is unavailable because the test file has no final outcomes. |
| SG-03.3 · Updated | Evaluate triage usefulness | Compare proposed queue with risk-only, distance-first, and TCA-first rankings. | Same predetermined observation cohort for every ranking; report top-10/20/30% coverage of imminent critical encounters and all critical encounters; urgent subset size shown; no-positive subsets marked not applicable. |
| SG-03.4 | Serve evaluation evidence | Provide actual evaluation artifacts through `/metrics`. | Includes dataset, the primary cohort excluding `final_is_early`, the separate all-usable count, model/policy versions, baseline definitions, and sample counts; absent results show "not evaluated". |
| SG-03.5 | Verify complete delivery | Check clean startup and the entire operator workflow. | Another teammate can run it; queue, receipt, radar, and metrics work together; required PRs reviewed and human-merged. Explicitly labelled synthetic fixtures are allowed. Unexplained fixtures are not. |

---

## Khaleil — Data, model, limitations

### SG-04 · Core — Reliable modelling data

*As a developer, I want reproducible data preparation without encounter leakage.*

**Done when:** a saved split and preprocessing keep validation encounters independent from fitting.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-04.1 | Profile data quality | Inspect schema, missingness, extreme values, negative TCA, and the target floor. | Report required fields and exclusions; `risk = −30` identified as a possible reporting floor; suspected sentinel values are investigated rather than silently removed. |
| SG-04.2 | Save encounter-grouped split | Assign stable row IDs and fixed training/validation encounter membership. | No encounter crosses partitions; seed and membership saved; critical support counts reported; test file excluded from tuning. |
| SG-04.3 | Implement preprocessing | Handle missing numeric values and object categories consistently. | Fit transformations only on the training partition; unseen categories supported. Early-message `risk` is allowed only for `time_to_tca` ≥ 2 days. `final_*` labels, identifiers, `mission_id`, and full-event metadata are excluded. Imputed fields can be identified for receipts. |

### SG-05 · Core — Final-tier prediction

*As an operator, I want the final tier forecast from messages at least 2 days before closest approach, with the persistence rule as the baseline.*

**Done when:** a versioned pipeline produces forecast tiers and is compared with persistence. This story is not implemented by the contract.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-05.1 | Train persistence baseline | Apply the tier rules to the latest early message. | Fitted on no learned parameters; validation predictions exported with encounter IDs. This is not a log-risk regression. `p_critical` is null. |
| SG-05.2 | Train the Critical-upgrade model | Train the classifier without `max_risk_estimate`. The classifier can raise a tier to Critical and cannot lower one. | Reproducible configuration. `p_critical` is the uncalibrated score that the final tier is Critical, not a collision probability. Predicted final Pc stays null. |
| SG-05.3 | Compare `max_risk_estimate` | Train the same upgrade model including `max_risk_estimate`. | Identical split and cohort. Report the comparison and disclose dependence on that input. |
| SG-05.4 | Package inference | Save preprocessing and the model and expose `predict_encounters()`. | Backend can load it using documented commands. Feature schema, dependencies, checksum, and version included. Encounters with no early message return `unable_to_assess`. Quality information follows this contract. |

### SG-06 · Core — Model selection and honest limitations

*As a judge, I want to understand predictive value, failure cases, and limits.*

**Done when:** selection is justified on validation data; final test evaluation is separate; claims match the evidence.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-06.1 | Select model on validation | Compare error, critical detection, and feature dependence with the team. | Selection rationale recorded; no reliance on overall accuracy alone; test results do not drive tuning. |
| SG-06.2 | Investigate missed critical cases | Inspect probability-critical cases, particularly those ≥ 1 km apart. | Report support, detected/missed cases, and additional false alerts; provide a genuine failure/limitation example; selected examples are labelled. |
| SG-06.3 | Freeze and score test data | Generate demo predictions after settings are fixed. | Test messages contain current risk and no final outcomes. Test final-tier accuracy is unavailable and must not be fabricated. Later changes and repeated test use are disclosed. |
| SG-06.4 | Prepare held-out demo histories | Export validation encounters supporting receipts, update comparisons, and relative-time views. | Encounters were not used to fit the demo model; observation identities preserved; selected examples distinguished from the full evaluation cohort. |
| SG-06.5 · Next | Evaluate quality sensitivity | Measure performance by TCA band and with optional inputs masked. | Sample counts shown; masking labelled synthetic; results do not turn telemetry sigma into a model-confidence percentage. |
| SG-06.6 · Stretch · New | Define bounded sensitivity experiment | Specify a small set of supported hypothetical input changes. | Explicitly identifies mutable fields and ranges; original inputs retained; flags potentially inconsistent combinations; outputs described as model sensitivity, never manoeuvre effectiveness. |

---

## Shanya — Dashboard, evidence, demo

### SG-07 · Core — Operator review queue

*As an operator, I want to find urgent encounters without losing sight of their actual risk and data quality.*

**Done when:** the dashboard exposes priority, risk tier, TCA, and quality separately using real API results.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-07.1 | Build dashboard shell | Implement layout, API client, and initial contract fixtures. | Configurable API URL; labelled fixtures; loading/error/empty states; documented startup. |
| SG-07.2 · Updated | Build prioritised queue | Display Immediate, High, Scheduled, and Routine bands plus incomplete assessments. | Shows encounter ID, current rule tier, forecast final tier, priority, supplied early risk, `p_critical` only as the uncalibrated class score, miss distance, TCA, and flags. Uses backend ordering. `unable_to_assess` and incomplete cases never look Safe. Predicted final Pc is empty for the current model. |
| SG-07.3 · Updated | Build relative-time radar | Show selected encounters in TCA bins with risk highlighting and filters. | Counts match backend; axes say hours to closest approach; historical/test views labelled; no seasonal, geopolitical, or live-clock claims. |
| SG-07.4 | Connect real predictions | Replace fixture data with backend outputs. | Real encounter opens end to end; API errors never silently trigger fake results; model version visible. |

### SG-08 · Core — Understand and verify an assessment

*As an operator, I want to see exactly why an encounter was escalated.*

**Done when:** the detail view presents a decision receipt, history, geometry, and limitations.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-08.1 · Updated | Display decision receipt | Present backend evidence and escalation reasons clearly. | Includes inputs, thresholds, model/policy versions, quality handling, and observation ID; probability, distance, and urgency reasons are distinguished; supplied distance is not called an ML prediction. |
| SG-08.2 | Plot assessment history | Show supplied miss distance and the forecast fields that exist across updates. | Correct update order and units. Supplied early risk is not the forecast. `p_critical` is not drawn as Pc. Carried-forward points keep their source observation. Threshold lines use the tier rules. History is not a physical trajectory. |
| SG-08.3 | Show relative encounter geometry | Plot relative position with target at origin. | Uses actual R/T/N fields; labelled axes/scale; described as encounter geometry, not a reconstructed orbit; missing values handled. |
| SG-08.4 · Stretch | Add schematic animation | Illustrate geometry if time permits. | Visible approximation label; no claim of validated orbital propagation. |
| SG-08.5 · Next · New | Show "what changed" | Surface backend comparisons with the previous observation. | Displays crossings, tier changes, and quality changes; identifies compared observations; no unsupported claim that every fluctuation is significant. |
| SG-08.6 · Next · New | Add review controls | Let users acknowledge or escalate an assessment. | Controls call backend; status stays separate from risk; renewed-review indicator visible; does not imply a manoeuvre was executed. |
| SG-08.7 · Stretch · New | Add sensitivity explorer | Display original and hypothetical model predictions side by side. | Depends on SG-06.6 and a supported scoring interface; assumptions and changed fields visible; reset available; hypothetical results never overwrite operational records or receipts. |

### SG-09 · Core — Evidence-led demo

*As a judge, I want to see a working workflow and credible proof of value within three minutes.*

**Done when:** the demo covers prioritisation, receipt, evaluation, and a genuine limitation.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-09.1 | Display evaluation results | Present model comparisons, confusion matrices, and ranking coverage. | Actual results with denominators, cohort/model/policy labels, and clearly separated probability/operational metrics. |
| SG-09.2 · Updated | Explain prioritisation benefit | Visualise imminent-critical coverage versus review proportion and baselines. | Same cohort used throughout; also shows overall critical coverage; claims labelled offline prioritisation results, not measured time savings or avoided collisions. |
| SG-09.3 | Prepare three-minute narrative | Demonstrate queue → encounter → receipt → evaluation → limitation. | Full rehearsal ≤ 3 minutes; each teammate knows their section; uncertainty or failure is visible. |
| SG-09.4 | Prepare submission and backup | Assemble instructions, links, screenshots, and recording. | Materials match frozen model/policy; startup checked; submission completed with buffer. |
