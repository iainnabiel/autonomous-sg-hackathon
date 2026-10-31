# Airbus Problem Statements: Autonomous SG 2026

Acacia Hackathon Society x NUS Product Club, AI & Aerospace Track, 31 October 2026, NUS.

Datasets: https://drive.google.com/drive/u/1/folders/13h0JZnSqhYTX3rV8dGDGy5AiwaADQvJR

> Source: [`Requirements.md`](Requirements.md) (full Challenge #1 brief plus the judging rubric; original PDF is on the Drive link above). This file covers Challenge #1 and the rubric, plus the team's dataset findings and decisions. Keep `Requirements.md` as a faithful copy of the organisers' wording.

---

## Challenge #1

> "How could we leverage AI-driven technologies for satellite collision avoidance"

### Description

Low earth orbit (LEO) is crowded with satellites and space debris. Satellite operators receive thousands of data messages daily warning of potential close encounters. Evaluating every encounter and deciding whether corrective action is needed takes too much manual labor and is vulnerable to human error.

### Want to see

A **collision risk evaluator** that reads orbital conjunction telemetry, calculates the collision probability (Pc) for satellite-debris pairs, and automatically flags high-risk events that require maneuver planning.

#### 1. Risk classification

An algorithm that predicts whether an event is high risk, requires maneuvering, or is safe, backed by probability.

Follows the NASA Spacecraft Conjunction Assessment and Collision Avoidance Best Practices Handbook (NASA/SP-20205011318) and ESA Space Debris Office standards.

| Tier | Condition |
|---|---|
| **Safe** | Pc < 10^-6 **and** miss distance > 5.0 km |
| **Elevated risk** | 10^-6 <= Pc < 10^-4 **or** miss distance between 1.0 km and 5.0 km |
| **Critical (maneuver required)** | Pc >= 10^-4 (i.e. `risk >= -4.0` in the dataset) **or** miss distance < 1.0 km |

Notes for implementation:
- The tiers are evaluated from the highest severity down. An event is Critical if either condition holds, otherwise Elevated if either holds, otherwise Safe.
- The dataset `risk` column is log10(Pc), so the thresholds are `-6.0` and `-4.0`.
- `miss_distance` is in metres (see [Clarifications](#clarifications)), so the thresholds are `1000` and `5000`.

#### 2. Dashboard UI

A visual platform showing:
- Trajectories
- Collision risk scores
- Miss distances
- Warnings: how many events come within the defined dangerous distance in a 24 hour window
- Generated insights

### Provided data

Collision Avoidance Challenge dataset, at `Challenge #1\archive(1).zip`.

- For simplicity, use **only** these columns:
  - `event_id`
  - `time_to_tca`
  - `miss_distance`
  - `relative_speed`
  - `relative_position_r`
  - `relative_position_t`
  - `relative_position_n`
  - `c_object_type`
  - `c_sigma_r`
  - `t_sigma_r`
  - `max_risk_estimate`
  - `F10`
  - `AP`
- Inside `archive(1).zip`:
  - Use `train_data` to train models, fit parameters, and learn relationships between telemetry features.
  - The `risk` column is log10(Pc). Map it to the operational risk tiers above to train and validate models.
  - Use `test_data` to generate predictions on rows. These outputs are scored to see how well the model generalises to unseen encounters.

Local copies: `Datasets/train_data.csv` and `Datasets/test_data.csv` (not committed).

---

## Judging rubric

Each criterion is scored 1 to 5 by 3 judges, then weighted. Weighted total = sum of (score / 5 x weight).

| Criterion | Weight | Question judges ask |
|---|---|---|
| Problem realism | 20% | Does this solve a specific aerospace workflow problem? |
| Technical soundness | 25% | Does the prototype work, with the right method for each task? |
| Honest evaluation | 20% | What was tested, against what baseline, and where does it fail? |
| Trust and traceability | 20% | Can a qualified person verify the output before acting? |
| Impact | 10% | What improves over the current process, and by how much? |
| Time discipline | 5% | Was the project submitted early and presented efficiently? |

### What separates strong from weak

- **Problem realism.** Name the user, the current process and its cost in time, money or risk. Explain the constraints of the chosen challenge, not aviation in general.
  - Strong: a credible user, narrow workflow and clear status quo.
  - Weak: a generic aviation chatbot, or a solution looking for a problem.
- **Technical soundness.** Show an end-to-end build. Use LLMs for reading and explanation; use solvers, rules or statistics for scheduling, constraints and detection. Test beyond a scripted demo.
  - Strong: working inputs and outputs, explicit constraints, and a sound LLM / non-LLM split.
  - Weak: LLM-only legality checks, opaque risk scores, or a hard-coded demo.
- **Honest evaluation.** State metrics, test data and results. Label synthetic data and its limits. Show one case where the system is wrong, uncertain or declines, and explain how the user knows.
  - Strong: a baseline, measured results, and a visible failure with a reason.
  - Weak: only success cases, unsupported accuracy claims, or hidden data limits.
- **Trust and traceability.** Trace claims to a document, revision and section, a timestamped signal, or an applied rule. Handle applicability and missing evidence. Keep the qualified person in control.
  - Strong: checkable sources, visible uncertainty, and a clear refusal when needed.
  - Weak: confident unsourced answers, or a claim to replace expert judgement.
- **Impact.** Compare against the stated baseline (for example false alarms). Distinguish measured improvement from estimates.
  - Strong: a credible before/after measure and realistic adoption constraints.
  - Weak: large benefit claims with no baseline or unstated assumptions.
- **Time discipline.** Earlier valid submission is better (recorded submission time), plus a clear, focused presentation within **3 minutes**. One combined score.

Judges' notes: "Where does this fail, and how would your user know?" Reward sound restraint, not presentation polish. Earlier submission does not substitute for quality or evidence.

---

## Clarifications

Facts checked against the local datasets, plus interpretations the team has agreed. Add to this list as decisions are made.

### Verified from the data

| Fact | Evidence |
|---|---|
| `miss_distance` is in metres | Range 9 to 67,373 in train |
| `time_to_tca` is in days | Train range -0.15 to 6.99 |
| Test rows are all at least 2 days before TCA | Test `time_to_tca` range 2.00 to 6.99 |
| `risk = -30` is a floor value meaning "effectively zero" | 41% of train rows, 28% of test rows |
| Each event has multiple CDM rows | Train: 162,634 rows / 13,154 events. Test: 24,484 rows / 2,167 events |
| Tiers are imbalanced | Tier of each event's latest CDM, train: Safe 9,843 / Elevated 2,403 / Critical 908. Test: 1,481 / 500 / 186 |
| `c_object_type` values | DEBRIS, UNKNOWN, PAYLOAD, ROCKET BODY, TBA |
| `test_data.csv` includes a `risk` column | Present in the header |

### Interpretations (to confirm with organisers if possible)

- `risk` is not in the allowed input columns, so it is the **label only**. Models predict the tier from the 13 allowed columns.
- Predictions are made **per row** (per CDM), matching "generate predictions on rows".
- Train/validation splits are grouped by `event_id`, so CDMs from one event never appear on both sides.

### Open questions

- What output format will test predictions be scored in, and on which metric?
- The 24-hour warning: test rows never fall within 24 h of TCA, so how should the dashboard demonstrate it?
