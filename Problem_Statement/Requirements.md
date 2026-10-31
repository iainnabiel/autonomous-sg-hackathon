# Airbus Problem Statements: Autonomous SG 2026

Acacia Hackathon Society x NUS Product Club, AI & Aerospace Track, 31 October 2026, NUS.

Datasets: https://drive.google.com/drive/u/1/folders/13h0JZnSqhYTX3rV8dGDGy5AiwaADQvJR

> Faithful markdown transcription of the organisers' brief for Challenge #1 (the only challenge we are doing) and the judging rubric. Challenges #2 to #5 were removed. Wording is kept as close to the original as possible. Team decisions and dataset findings for Challenge #1 belong in `PROBLEM_STATEMENT.md`, not here.

**Contents**
- [Challenge #1: Satellite collision avoidance](#challenge-1)
- [Judging rubric](#judging-rubric)

---

## Challenge #1

> "How could we leverage AI-driven technologies for satellite collision avoidance"

### Description

With low earth orbit (LEO) being crowded with satellites and space debris, satellite operators receive thousands of data messages daily warning of potential close encounters. Evaluating every encounter and determining if corrective action is required necessitates too much manual labor and is vulnerable to human error.

### Want to see

A **collision risk evaluator** that reads orbital conjunction telemetry and subsequently calculates the collision probability (Pc) for satellite-debris pairs, automatically flagging high-risk events that require maneuver planning.

**Risk classification:** Algorithm predicting whether an event is high risk, requires maneuvering, or safe (backed by probability).

In accordance with *NASA Spacecraft Conjunction Assessment and Collision Avoidance Best Practices Handbook (NASA/SP-20205011318)* and *ESA Space Debris Office Standards*.

| Tier | Condition |
|---|---|
| **Safe** | Pc < 10⁻⁶ **and** miss distance > 5.0 km |
| **Elevated risk** | 10⁻⁶ ≤ Pc < 10⁻⁴ **or** miss distance between 1.0 km and 5.0 km |
| **Critical (Maneuver Required)** | Pc ≥ 10⁻⁴ (i.e. `risk >= -4.0` in the dataset) **or** miss distance < 1.0 km |

**Dashboard UI:** Visual platform showing trajectories, collision risk scores and miss distances.

Warnings: in a 24 hour frame, how many come within the defined dangerous distance; generate insights.

### Provided data

Collision Avoidance Challenge dataset (file in `Challenge #1\archive(1).zip`).

- Can use only columns `event_id`, `time_to_tca`, `miss_distance`, `relative_speed`, `relative_position_r`, `relative_position_t`, `relative_position_n`, `c_object_type`, `c_sigma_r`, `t_sigma_r`, `max_risk_estimate`, `F10`, `AP` for simplicity purposes.
- In `archive(1).zip`:
  - Use `train_data` to train models, fit parameters, relationships between telemetry features etc.
  - Has column called `risk`, which represents log10(Pc); map this to operational risk tiers to train and validate models.
  - Use `test_data` to generate predictions on rows, for outputs to be scored to see how well the model generalises to unseen encounters.

---

## Judging rubric

Six criteria. Each is scored from 1 to 5 by 3 judges, then weighted. Total weight: 100%.

**Scale:** 1 = weak; 2 = limited; 3 = credible; 4 = strong; 5 = exceptional evidence.

**Weighted total / 100** = sum of (criterion score / 5 x criterion weight). Example: technical soundness scored 4/5 earns 20 of its 25 points.

| Criterion | Weight | Question |
|---|---|---|
| Problem realism | 20% | Does this solve a specific aerospace workflow problem? |
| Technical soundness | 25% | Does the prototype work, with the right method for each task? |
| Honest evaluation | 20% | What was tested, against what baseline, and where does it fail? |
| Trust and traceability | 20% | Can a qualified person verify the output before acting? |
| Impact | 10% | What improves over the current process, and by how much? |
| Time discipline | 5% | Was the project submitted early and presented efficiently? |

### Problem realism (20%)

Name the user, current process and cost in time, money or risk. Explain the constraints of the chosen challenge, rather than describing aviation in general. Judges want a named user (a duty manager, a B1 technician, a supply planner), a clear picture of what they do today without the tool, and a believable cost in time, money or risk.

- **Strong:** a credible user, narrow workflow and clear status quo.
- **Weak:** a generic aviation chatbot, or a solution looking for a problem.

### Technical soundness (25%)

Show an end-to-end build. Use LLMs for reading and explanation; use solvers, rules or statistics for scheduling, constraints and detection. Test beyond a scripted demo.

- **Strong:** working inputs and outputs; explicit constraints and a sound LLM / non-LLM split.
- **Weak:** LLM-only legality checks, opaque risk scores, or a hard-coded demo.

### Honest evaluation (20%)

State metrics, test data and results. Label synthetic data and its limits. Show one case where the system is wrong, uncertain or declines, and explain how the user knows. Aerospace values knowing a system's limits as much as its capabilities.

- **Strong:** a baseline, measured results, and a visible failure with a reason.
- **Weak:** only success cases, unsupported accuracy claims, or hidden data limits.

### Trust and traceability (20%)

Trace claims to a document, revision and section, a timestamped signal, or an applied rule. Handle applicability and missing evidence. Keep the qualified person in control.

- **Strong:** checkable sources, visible uncertainty, and a clear refusal when needed.
- **Weak:** confident unsourced answers, or a claim to replace expert judgement.

### Impact (10%)

Compare against the stated baseline: delay minutes, supplier impact, retrieval quality or false alarms, as relevant. Distinguish measured improvement from estimates.

- **Strong:** a credible before/after measure and realistic adoption constraints.
- **Weak:** large benefit claims with no baseline, or unstated assumptions.

### Time discipline (5%)

Earlier valid submission is better, using the recorded submission time. Also assessed: a clear, focused presentation completed within **3 minutes**. One combined 1 to 5 score.

- **Strong:** earlier submission and a focused, complete presentation within 3 minutes.
- **Weak:** later submission and a rushed, unfocused or over-time presentation.

### Judges' notes

- Score criteria separately. Ask: **"Where does this fail, and how would your user know?"**
- Reward sound restraint, not presentation polish.
- Time is only 5%: earlier submission does not substitute for quality or evidence.