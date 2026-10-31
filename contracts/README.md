# Contracts

**Owner:** Iain

Shared schemas for SG-01.2 and SG-01.3. The package validates payloads and documents selection rules. It does not train a model, serve an API, or render the dashboard. Queue bands are assigned by the prototype policy in `contracts/triage.py`, version `triage-prototype-sg-01.4`. That policy does not change these schemas.

## Startup

From the repository root:

```bash
python -m contracts
```

The command confirms the package imports. There is no server to start.

Checks:

```bash
python -m unittest tests.test_contracts
```

## Identifiers

Encounter IDs and observation IDs are different types with the same spelling.

| ID | Example | Integer means |
| --- | --- | --- |
| Encounter | `train:57` | `event_id` in that file |
| Observation | `train:1234` | 0-based CSV row in that file |

`event_id` restarts in each file. `train:57` and `test:57` are different encounters. A row id of `train:57` is not encounter `train:57`.

## Quantities

| Field | Meaning |
| --- | --- |
| Supplied early risk | log10(Pc) on a message. It may be a model feature only when `time_to_tca >= 2` days. |
| Current rule tier | Organiser tier rules applied to the message in hand: Critical, then Elevated, then Safe. |
| Forecast final tier | Model output for the final message. Title case: `Safe`, `Elevated`, `Critical`. |
| `p_critical` | Upgrade classifier score for “will the final tier be Critical?”. See below. |
| Predicted final log10(Pc) and Pc | Optional. Null for the current upgrade model. |

`p_critical` comes from the SG-05 upgrade classifier: `predict_proba` for the Critical class with `class_weight="balanced"`. It is not a calibrated probability, not a collision probability, and not a percentage. It is present only when that classifier is applied to an encounter with at least one observation at `time_to_tca >= 2` days. It is null for the persistence baseline, for `unable_to_assess`, and when inference is unavailable. Encounters whose final message is itself early can still have a score. The primary cohort is an evaluation filter, not a condition for the score.

A known Critical trigger on the current message stays Critical when the other input is missing, including when the forecast is null. An Elevated input with the other input missing stays unrated, because the missing input could still be Critical.

## Units

Confirmed from the organiser `data_notes` sheet: miss distance and relative position are metres, relative speed is m/s, and `time_to_tca` is days. Hours are `days * 24` for display only. Sigma units are unconfirmed.

## Selection

| Use | Rule |
| --- | --- |
| Training and evaluation labels | Smallest raw `time_to_tca`, including negative values |
| Upcoming views | Smallest nonnegative raw `time_to_tca` |
| Early inference | Smallest raw `time_to_tca` among rows at or above 2 days |

Comparisons and filtering use the raw values. `train_data.csv` has 391 negative finals. The workbook's rounded `final_time_to_tca_days` counts 389 because events 10630 and 12907 are stored as −0. Rounding is display only. Eleven train encounters have no nonnegative message, so they have no upcoming observation.

Ties break by the smaller observation row index, then by source name. Exactly 2.0 days is eligible. Anything below 2 days is refused for inference and is not silently scored.

A forecast shown on a later message keeps the original source observation id and that observation’s TCA, and its status is `carried_forward`.

## Status

| Forecast status | Forecast tier | `p_critical` |
| --- | --- | --- |
| `available` | Set | Set only for the upgrade classifier; otherwise null |
| `unable_to_assess` | Null | Null. The encounter has no eligible early observation. |
| `unavailable` | Null | Null. Inference failed explicitly. |
| `carried_forward` | Copied | Copied from the source forecast, not recomputed |

## Evaluation

Score final-tier metrics on held-out training encounters that have final labels. The merged split is encounter-grouped, seed 42, 20% validation, stratified by `final_tier`, usable encounters only (at least one message at or beyond 2 days). The primary cohort excludes `final_is_early` and is reported separately from all usable encounters. Test messages contain current risk and no final outcomes, so test final-tier accuracy is `unavailable` and must not be filled in. Labels live on evaluation records, not on inference payloads.

## Fixtures

`synthetic_examples()` is labelled `synthetic development fixtures` and uses the `fixture:` source. It covers a successful forecast, `unable_to_assess` with a visible current Critical trigger, an unavailable model, and a carried-forward forecast.

## Prototype review policy

Version `triage-prototype-sg-01.4`. This orders review attention. It is not a certified operational standard and it is not an instruction to execute a manoeuvre. The schema version remains `sg-01.2-sg-01.3`.

The prioritisation tier is the more severe of the current rule tier and `forecast_final_tier`. Neither stored tier is overwritten. `p_critical` and the model’s upgrade threshold are not inputs. Urgency uses the current observation’s TCA. Exactly 0 days and exactly 1 day are inside the one-day bands. Negative current TCA is omitted from the upcoming queue.

A known Elevated tier with an unavailable forecast stays High at exactly 1 day and Scheduled just beyond 1 day. The reason `forecast_not_treated_as_safe` says the missing forecast was not treated as Safe. Known Critical evidence stays Immediate or High. Safe, or no current tier, with an unavailable forecast is Incomplete. Routine still requires current Safe and a valid Safe forecast. Missing risk and distance stay unrated; they are not turned into Elevated. An unrated current message keeps the `incomplete_review` reason even when a forecast tier sets its band. Each encounter appears at most once in the queue, and a forecast's source observation must come from the same file as the encounter.

| Current tier | Forecast tier | Current TCA | Priority | Why |
| --- | --- | --- | --- | --- |
| Critical | Safe | 0.5 day | Immediate | Current evidence wins; the forecast does not downgrade it; time is within 1 day |
| Critical | Safe | 2 days | High | Current Critical remains; time is outside 1 day |
| Safe | Critical | 0.5 day | Immediate | Forecast escalates; time is within 1 day |
| Safe | Critical | 2 days | High | Forecast escalates; other Critical encounters are High |
| Elevated | Safe | 2 days | Scheduled | Current Elevated is not downgraded |
| Elevated | Elevated | 1 day | High | Elevated and time is within 1 day, including the boundary |
| Safe | Safe, valid forecast | 3 days | Routine | Complete current Safe assessment and a valid Safe forecast |
| Safe | unavailable or unable to assess | 0.2 day | Incomplete | A missing forecast is not treated as Safe and is not filed as Routine |
| null | null | 0.2 day | Incomplete | No tier evidence |
| Critical | unavailable | 0 days | Immediate | Known Critical evidence stays urgent |
| Elevated | unavailable | 1 day | High | Known Elevated stays in its time band; the forecast is not treated as Safe |
| Elevated | unavailable | just over 1 day | Scheduled | The same evidence outside the 1-day boundary |
| Safe | Critical, carried forward from 3 days | 0.25 day | Immediate | Urgency uses 0.25 day; source observation and source TCA stay on the forecast |

Carried-forward forecasts must name the same encounter as the row under review. Within each upcoming band, rows are ordered by current TCA, then source name, then numeric encounter id. The incomplete band stays separate from Routine.
