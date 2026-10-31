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
| SG-01.2 | Extend shared contracts | Specify observation identity, prediction, risk tier, queue priority, receipt, and history responses. | Include source-qualified encounter ID, stable observation ID, units, model version, policy version, quality flags, and reason codes; unavailable values use explicit null/status fields. | Not started |
| SG-01.3 | Define data and snapshot conventions | Document unit assumptions, encounter-grouped splitting, selected-observation policy, and historical-view limits. | Units remain labelled assumptions until confirmed; select smallest nonnegative TCA per encounter with deterministic ties; split membership is fixed; no claim of a shared live calendar timeline. | Not started |
| SG-01.4 · New | Define triage policy | Establish transparent queue rules separate from risk classification. | **Immediate:** critical within 24h. **High:** other critical, or elevated within 24h. **Scheduled:** other elevated. **Routine:** safe with adequate inputs. Policy is versioned and labelled a prototype; incomplete assessments have a separate review route. | Not started |

### SG-02 · Core — Explainable review queue

*As an operator, I want to know which encounter to review next and why.*

**Done when:** real predictions feed a deterministic queue; risk, urgency, and data quality remain distinguishable.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-02.1 | Validate inputs and units | Validate telemetry and convert units centrally. | Invalid required inputs cannot produce "safe"; optional imputation is flagged; negative TCA excluded from upcoming views; supplied sigma fields are not described as model confidence. |
| SG-02.2 | Implement risk classification | Apply the brief's probability and distance thresholds, critical first. | **Critical** if log-risk ≥ −4 or distance < 1 km; otherwise **elevated** if log-risk ≥ −6 or distance ≤ 5 km; otherwise **safe**. Exact boundaries tested. A known critical trigger remains visible even if another assessment input is missing. |
| SG-02.3 | Integrate model estimates | Load the real pipeline or its reproducible prediction outputs. | `risk` excluded from inference inputs; predictions carry model version and row identity; unavailable inference returns an explicit failure; no fabricated results. |
| SG-02.4 | Implement queue and encounter APIs | Return one selected observation per encounter, priority, history, and quality status. | Queue follows SG-01.4; within bands sort by TCA with deterministic ties; incomplete cases remain visible outside Routine; history order is correct. |
| SG-02.5 | Implement radar summaries | Aggregate selected encounters by relative TCA and risk tier. | Distinct-encounter counts match filters; 0–24h window includes boundaries; empty test window shown honestly; historical view is labelled; no fabricated calendar timestamps. |
| SG-02.6 · New | Generate decision receipts | Create a structured record explaining each assessment and escalation. | Contains observation ID, relevant inputs, unit assumptions, estimated Pc, supplied distance/TCA, triggered rules, quality handling, model and policy versions; explains whether probability, distance, or urgency caused escalation. |
| SG-02.7 · Next · New | Detect assessment changes | Compare consecutive observations of the same encounter. | Reports tier changes, threshold crossings, distance/Pc changes, and new quality issues; identifies both observations; first observation has no invented previous state. |
| SG-02.8 · Next · New | Track human review status | Support Unreviewed, Acknowledged, and Escalated for planning. | Status changes do not alter risk; review is linked to an observation; a new tier escalation, urgent-band crossing, or assessment failure marks the encounter for renewed review; storage limitations documented. |

### SG-03 · Core — Independent evaluation and delivery

*As a judge, I want evidence that both the model and queue add value.*

**Done when:** reproducible metrics distinguish probability estimation, operational classification, and prioritisation.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-03.1 | Validate evaluation joins | Join predictions to labels by stable observation ID. | Duplicate/missing/unexpected IDs detected; shuffling rows does not change results; source-qualified IDs prevent cross-file collisions. |
| SG-03.2 | Evaluate detection | Calculate probability-critical and operational-tier metrics separately. | Precision, recall, false negatives, sample counts, and raw/normalised confusion matrices reported; undefined metrics explicitly marked. |
| SG-03.3 · Updated | Evaluate triage usefulness | Compare proposed queue with risk-only, distance-first, and TCA-first rankings. | Same predetermined observation cohort for every ranking; report top-10/20/30% coverage of imminent critical encounters and all critical encounters; urgent subset size shown; no-positive subsets marked not applicable. |
| SG-03.4 | Serve evaluation evidence | Provide actual evaluation artifacts through `/metrics`. | Includes dataset, cohort, model/policy versions, baseline definitions, and sample counts; absent results show "not evaluated". |
| SG-03.5 | Verify complete delivery | Check clean startup and the entire operator workflow. | Another teammate can run it; queue, receipt, radar, and metrics work together; required PRs reviewed and human-merged; no unexplained fixtures. |

---

## Khaleil — Data, model, limitations

### SG-04 · Core — Reliable modelling data

*As a developer, I want reproducible data preparation without encounter leakage.*

**Done when:** a saved split and preprocessing keep validation encounters independent from fitting.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-04.1 | Profile data quality | Inspect schema, missingness, extreme values, negative TCA, and the target floor. | Report required fields and exclusions; `risk = −30` identified as a possible reporting floor; suspected sentinel values are investigated rather than silently removed. |
| SG-04.2 | Save encounter-grouped split | Assign stable row IDs and fixed training/validation encounter membership. | No encounter crosses partitions; seed and membership saved; critical support counts reported; test file excluded from tuning. |
| SG-04.3 | Implement preprocessing | Handle missing numeric values and object categories consistently. | Fit transformations only on training partition; unseen categories supported; `risk` and encounter IDs excluded as features; imputed fields can be identified for receipts. |

### SG-05 · Core — Collision-probability estimation

*As an operator, I want a telemetry-based estimate of the encounter's reported collision probability.*

**Done when:** a versioned pipeline produces predictions and is compared against a reproducible baseline.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-05.1 | Train constant baseline | Establish minimum log-risk regression performance. | Fitted on training partition only; validation predictions and error exported with row IDs. |
| SG-05.2 | Train telemetry model | Train one tree-based regressor without `max_risk_estimate`. | Reproducible configuration; finite outputs for supported inputs; conversion to Pc and any clipping documented; no claim of calibrated confidence. |
| SG-05.3 | Compare permitted risk feature | Train the same model including `max_risk_estimate`. | Identical split/cohort; report regression and detection changes; dependence on the existing risk-related input clearly disclosed. |
| SG-05.4 | Package inference | Save preprocessing/model and expose `predict_rows()`. | Backend can load it using documented commands; feature schema, dependencies, checksum, and version included; quality information follows the contract. |

### SG-06 · Core — Model selection and honest limitations

*As a judge, I want to understand predictive value, failure cases, and limits.*

**Done when:** selection is justified on validation data; final test evaluation is separate; claims match the evidence.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-06.1 | Select model on validation | Compare error, critical detection, and feature dependence with the team. | Selection rationale recorded; no reliance on overall accuracy alone; test results do not drive tuning. |
| SG-06.2 | Investigate missed critical cases | Inspect probability-critical cases, particularly those ≥ 1 km apart. | Report support, detected/missed cases, and additional false alerts; provide a genuine failure/limitation example; selected examples are labelled. |
| SG-06.3 | Freeze and score test data | Generate final predictions after settings are fixed. | Test labels excluded from inference; final artifacts saved; any later changes and repeated test use disclosed. |
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
| SG-07.2 · Updated | Build prioritised queue | Display Immediate, High, Scheduled, and Routine bands plus incomplete assessments. | Shows encounter ID, risk tier, priority, Pc, miss distance, TCA, and flags; uses backend ordering; incomplete cases never look safe; small probabilities are readable. |
| SG-07.3 · Updated | Build relative-time radar | Show selected encounters in TCA bins with risk highlighting and filters. | Counts match backend; axes say hours to closest approach; historical/test views labelled; no seasonal, geopolitical, or live-clock claims. |
| SG-07.4 | Connect real predictions | Replace fixture data with backend outputs. | Real encounter opens end to end; API errors never silently trigger fake results; model version visible. |

### SG-08 · Core — Understand and verify an assessment

*As an operator, I want to see exactly why an encounter was escalated.*

**Done when:** the detail view presents a decision receipt, history, geometry, and limitations.

| ID | Task | Description | Acceptance criteria |
| --- | --- | --- | --- |
| SG-08.1 · Updated | Display decision receipt | Present backend evidence and escalation reasons clearly. | Includes inputs, thresholds, model/policy versions, quality handling, and observation ID; probability, distance, and urgency reasons are distinguished; supplied distance is not called an ML prediction. |
| SG-08.2 | Plot assessment history | Show predicted log-Pc and supplied miss distance across updates. | Correct update order and units; threshold lines; no implication that update history is a physical trajectory. |
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
