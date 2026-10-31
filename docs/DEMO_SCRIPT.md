# Three-minute demo script (SG-09.3)

Audience: the three judges. Rubric weights: technical soundness 25, problem realism 20, honest evaluation 20, trust and traceability 20, impact 10, time discipline 5. The script hits each in order and ends on a visible failure, because the judges' own note is "where does this fail, and how would your user know?"

Timing is for one rehearsed run at normal speaking pace. Rehearse with a stopwatch; cut from the sections marked *optional* first.

## Setup before the slot

- `cd frontend && npm run dev`, open `http://localhost:5173/queue` in a browser at 1440 px or wider, zoom 100%. Dark theme is built in.
- Open these tabs in order so no typing happens live: `/queue`, `/encounter/fixture:0412`, `/evaluation`, `/encounter/fixture:0873`.
- If the backend (SG-02) is running, set `VITE_API_URL` and restart; the nav badge then says **Live API**. If not, it says **Demo data** and every figure is tagged. Say which one it is in the first sentence of section 2. Never let a judge discover it.
- Backup: `docs/screenshots/` and the recording link in `docs/SUBMISSION.md`.

## Script

### 0:00 – 0:30 · The problem and the user (Khaleil or Iain) — problem realism

> A LEO operator's conjunction analyst gets thousands of conjunction data messages a day. Each one says two objects might pass close, and most of them re-report the same encounter as the estimate updates. The analyst has to decide which few need a manoeuvre decision, by hand, before closest approach. Miss one and the cost is a satellite; chase every one and nothing else gets done.
>
> Orbit is a review queue for that analyst. It does not plan manoeuvres. It decides what the human looks at first, and shows its working.

### 0:30 – 1:10 · The queue and the policy (Shanya) — technical soundness

Tab 1, `/queue`.

> *(Point at the badge.)* This is running on labelled demonstration fixtures / the live backend.
>
> Every encounter gets a risk tier from the organisers' thresholds on the supplied probability and miss distance. Separately, a classifier trained on messages at least two days before closest approach forecasts whether the encounter will *end* critical. It can raise a tier, never lower one. Then urgency, hours to closest approach, places it in one of four review bands. Risk, urgency and data quality are separate columns, so none can hide another.
>
> *(Point at an `↑ model` row.)* This one the rule called elevated; the forecast raised it. *(Point at the Incomplete band.)* This one is missing a required input. It is routed for review, never treated as safe.

### 1:10 – 1:50 · One encounter and its receipt (Shanya) — trust and traceability

Tab 2, `/encounter/fixture:0412`.

> Open an encounter and the first thing is the receipt. Step one, the rules on this observation: critical because the supplied miss distance is 640 m. Step two, the forecast: score 0.41 against a 0.12 threshold, from four early messages. It is a ranking score, not a probability, and the page says so. Step three, urgency: inside 24 hours, so the band moved up. Every input is listed with its unit and whether the rule or the model used it. Model and policy versions are on the page.
>
> *(Scroll to "What changed".)* Each new message is compared with the last: here the tier rose from elevated to critical at update five, and the review recorded at update four is flagged for renewal. Acknowledge or escalate is a human action, stored beside the assessment, and it never changes the risk.

*Optional, 10 s:* the history chart; hollow points are messages the model never saw.

### 1:50 – 2:30 · Evidence (Khaleil) — honest evaluation, impact

Tab 3, `/evaluation`.

> Validation only; the test file has no outcomes, so there is no test score and we do not invent one. Primary cohort, 1,786 held-out encounters, 126 critical.
>
> The rule alone catches 101 of the 126. The forecast catches 110. That is 9 more critical endings, at the cost of 21 more false alarms, 52 instead of 31. We set that budget in advance: an upgrade had to be right at least a quarter of the time. The intervals overlap, so the gain is real but modest, and five-fold cross-validation over 8,892 encounters shows the same gap on every fold.
>
> Adding the dataset's own risk estimate as a feature caught fewer, so the shipped model does not depend on it. The queue-ranking comparison against risk-only, distance-first and TCA-first is not evaluated yet, and the page says not evaluated rather than drawing a curve.

### 2:30 – 2:55 · Where it fails (Iain or Khaleil) — the limitation

Tab 4, `/encounter/fixture:0873`.

> Here is the failure. At the two-day cutoff this encounter looked safe: 28 km apart, probability at the reporting floor, forecast score zero. Inside two days the geometry changed and the miss distance dropped to 829 m. The forecast could not see it because the model never sees messages inside two days. The dashboard caught it only because every new message is re-assessed by the rules, and "what changed" shows exactly when it crossed. Two of the 126 validation critical encounters look like this, and neither model rescues them. The user knows because the receipt says the critical tier came from the latest message alone.

### 2:55 – 3:00 · Close

> Orbit orders attention and shows its working. It does not replace the analyst, and it tells them where it is blind.

## Owner of each section

| Section | Owner | Backup |
| --- | --- | --- |
| Problem and user | Khaleil | Iain |
| Queue and receipt | Shanya | Iain |
| Evidence | Khaleil | Shanya |
| Limitation and close | Iain | Khaleil |

## Rehearsal log

| Date | Run | Time | Cut or fix |
| --- | --- | --- | --- |
| | 1 | | |
| | 2 | | |

Fill in after each full rehearsal. The slot is 3:00 including transitions; aim for 2:45 on the stopwatch.
