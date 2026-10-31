"""Interim demo API: serves real encounters and the frozen model to the dashboard.

Run:    python -m ml.demo_api                          # held-out validation encounters, port 8000
        python -m ml.demo_api --cohort test            # test_data.csv encounters (no outcomes)
        python -m ml.demo_api --metrics frontend/src/evidence/validation.json
Then start the dashboard with VITE_API_URL=http://localhost:8000.

A stand-in until the SG-02 backend lands, so the dashboard shows real data instead of
fixtures. It implements the dashboard's provisional API (frontend/src/api/types.ts):
GET /queue, GET /encounters/{id}, GET /radar, GET /metrics, POST /encounters/{id}/review.
Field names follow that provisional shape; the SG-01.2 contracts win where they differ.

- Rule tiers apply the organisers' thresholds to each message's supplied risk and miss distance.
- The forecast is ml.inference.predict_encounters on messages >= 2 days out. p_critical is a
  ranking score, not a probability. The model can raise a tier to Critical, never lower it.
- Validation encounters were never used to fit the model. Their histories include messages
  inside 2 days, so the current observation is the last message: a historical replay.
- Review state is in memory and lost on restart.
- Uses only the standard library HTTP server; not for production.
"""

import argparse
import json
import math
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

import numpy as np
import pandas as pd

from ml.config import (
    CRITICAL_DISTANCE_M,
    CRITICAL_LOG_PC,
    EARLY_CUTOFF_DAYS,
    ELEVATED_DISTANCE_M,
    ELEVATED_LOG_PC,
    RISK_FLOOR,
)
from ml.data import load_messages
from ml.features import SIGMA_PLACEHOLDER, build_features
from ml.inference import _reasons, load_model, predict_encounters
from ml.split import load_split

URGENT_HOURS = 24.0
POLICY_VERSION = "triage-policy-0.1 (prototype) via ml.demo_api"
LEVEL = {"safe": 0, "elevated": 1, "critical": 2}
BAND_ORDER = ["immediate", "high", "scheduled", "routine", "incomplete"]
BIN_EDGES = [0, 6, 12, 24, 48, 72, 120, 168]
STORAGE = "ml.demo_api: in-memory, lost on restart"

HANDLING = {
    "SIGMA_PLACEHOLDER": "A radial sigma held the 6.378136e7 placeholder and was treated as missing. "
    "Sigma is supplied covariance, not model confidence.",
    "SPACE_WEATHER_MISSING": "F10 and/or AP were not supplied. The model handles missing values natively; nothing was imputed.",
    "SINGLE_EARLY_MESSAGE": "Only one message at least 2 days out, so trend features are undefined. "
    "The forecast rests on a single message.",
    "NO_EARLY_MESSAGE": "No message at least 2 days before closest approach, so the model could not score this encounter. "
    "The tier comes from the rules alone.",
    "MISSING_MISS_DISTANCE": "Miss distance is a required input. The distance rule could not run, so the assessment is "
    "incomplete and routed for review. It is never treated as safe.",
}


def _num(value) -> float | None:
    """JSON-safe number: NaN and infinities become null."""
    if value is None:
        return None
    value = float(value)
    return value if math.isfinite(value) else None


def rule_tier(log_pc: float | None, miss: float | None) -> str | None:
    if log_pc is None or miss is None:
        return None
    if log_pc >= CRITICAL_LOG_PC or miss < CRITICAL_DISTANCE_M:
        return "critical"
    if log_pc >= ELEVATED_LOG_PC or miss <= ELEVATED_DISTANCE_M:
        return "elevated"
    return "safe"


def threshold_rules(log_pc: float | None, miss: float | None) -> dict[str, bool]:
    return {
        "PC_GE_1E-4": log_pc is not None and log_pc >= CRITICAL_LOG_PC,
        "MISS_LT_1KM": miss is not None and miss < CRITICAL_DISTANCE_M,
        "PC_GE_1E-6": log_pc is not None and ELEVATED_LOG_PC <= log_pc < CRITICAL_LOG_PC,
        "MISS_LE_5KM": miss is not None and CRITICAL_DISTANCE_M <= miss <= ELEVATED_DISTANCE_M,
    }


def priority_for(tier: str | None, tca_hours: float | None) -> str:
    if tier is None:
        return "incomplete"
    soon = tca_hours is not None and tca_hours <= URGENT_HOURS
    if tier == "critical":
        return "immediate" if soon else "high"
    if tier == "elevated":
        return "high" if soon else "scheduled"
    return "routine"


def _message_flags(row: pd.Series) -> list[str]:
    flags = []
    if row["c_sigma_r"] >= SIGMA_PLACEHOLDER or row["t_sigma_r"] >= SIGMA_PLACEHOLDER:
        flags.append("SIGMA_PLACEHOLDER")
    if pd.isna(row["F10"]) or pd.isna(row["AP"]):
        flags.append("SPACE_WEATHER_MISSING")
    if pd.isna(row["miss_distance"]):
        flags.append("MISSING_MISS_DISTANCE")
    return flags


def _sigma(value) -> float | None:
    value = _num(value)
    return None if value is None or value >= SIGMA_PLACEHOLDER else value


class DemoData:
    """Everything the endpoints serve, computed once from real messages and the frozen model."""

    def __init__(self, cohort: str, model_dir: str | None, metrics_path: Path | None):
        self.model = load_model(model_dir) if model_dir else load_model()
        if cohort == "validation":
            messages = load_messages("train")
            split = load_split()
            ids = split.index[split["partition"] == "validation"]
            messages = messages[messages["encounter_id"].isin(ids)]
            self.cohort = "validation (held-out, never used to fit the model); historical replay"
            self.caveat = (
                "Historical held-out validation encounters. Hours are relative to each encounter's own closest "
                "approach, and the current observation is each encounter's last message. Not a live clock."
            )
        else:
            messages = load_messages("test")
            self.cohort = "test_data.csv (no outcomes); every message is at least 2 days out"
            self.caveat = (
                "Test encounters: every message is at least 2 days before closest approach, so the 24-hour window "
                "is empty by construction. Hours are relative to each encounter's own closest approach."
            )
        self.messages = messages.sort_values(["encounter_id", "time_to_tca", "row_id"], ascending=[True, False, True])
        self.by_encounter = {eid: g for eid, g in self.messages.groupby("encounter_id", sort=False)}

        preds = predict_encounters(self.model, self.messages).set_index("encounter_id")
        feats = build_features(self.messages)
        self.preds = preds
        self.reasons = {eid: _reasons(feats.loc[eid]) for eid in feats.index}
        self.n_early = feats["n_early"].to_dict()
        self.reviews: dict[str, dict] = {}
        self.metrics = json.loads(metrics_path.read_text()) if metrics_path else None
        self.items = {}
        for eid in self.by_encounter:
            item = self._queue_item(eid)
            if item is not None:
                self.items[eid] = item

    # --- per-encounter pieces -------------------------------------------------

    def history(self, eid: str) -> list[dict]:
        out = []
        for i, (_, m) in enumerate(self.by_encounter[eid].iterrows(), start=1):
            log_pc, miss = _num(m["risk"]), _num(m["miss_distance"])
            out.append(
                {
                    "observation_id": m["row_id"],
                    "update_index": i,
                    "tca_hours": _num(m["time_to_tca"] * 24),
                    "log10_pc": log_pc,
                    "miss_distance_m": miss,
                    "relative_speed_m_s": _num(m["relative_speed"]),
                    "rule_tier": rule_tier(log_pc, miss),
                    "model_input": bool(m["time_to_tca"] >= EARLY_CUTOFF_DAYS),
                    "quality_flags": _message_flags(m),
                }
            )
        return out

    def _current(self, hist: list[dict]) -> dict | None:
        """Selected observation: smallest non-negative time to closest approach (SG-01.3)."""
        upcoming = [o for o in hist if o["tca_hours"] is not None and o["tca_hours"] >= 0]
        return min(upcoming, key=lambda o: o["tca_hours"]) if upcoming else None

    def _assess(self, eid: str, hist: list[dict]) -> dict | None:
        current = self._current(hist)
        if current is None:
            return None
        pred = self.preds.loc[eid]
        scored = pred["status"] == "assessed"
        p = _num(pred["p_critical"]) if scored else None
        tier = current["rule_tier"]
        upgraded = scored and p is not None and p >= self.model["threshold"] and tier is not None and tier != "critical"
        early = [o for o in hist if o["model_input"]]
        return {
            "current": current,
            "rule_tier": tier,
            "risk_tier": None if tier is None else ("critical" if upgraded else tier),
            "upgraded": upgraded,
            "scored": scored,
            "p": p,
            "model_input": early[-1] if early else None,
            "model_input_count": len(early),
        }

    def _changes(self, hist: list[dict]) -> list[dict]:
        out = []
        for a, b in zip(hist, hist[1:]):
            ra, rb = threshold_rules(a["log10_pc"], a["miss_distance_m"]), threshold_rules(b["log10_pc"], b["miss_distance_m"])
            crossings = [{"code": k, "direction": "entered" if rb[k] else "left"} for k in rb if ra[k] != rb[k]]
            new_flags = [f for f in b["quality_flags"] if f not in a["quality_flags"]]
            cleared = [f for f in a["quality_flags"] if f not in b["quality_flags"]]
            urgent = (
                a["tca_hours"] is not None and b["tca_hours"] is not None
                and a["tca_hours"] > URGENT_HOURS >= b["tca_hours"]
            )
            out.append(
                {
                    "from_observation_id": a["observation_id"],
                    "to_observation_id": b["observation_id"],
                    "from_update_index": a["update_index"],
                    "to_update_index": b["update_index"],
                    "tier_before": a["rule_tier"],
                    "tier_after": b["rule_tier"],
                    "crossings": crossings,
                    "delta_miss_m": None if None in (a["miss_distance_m"], b["miss_distance_m"]) else b["miss_distance_m"] - a["miss_distance_m"],
                    "delta_log10_pc": None if None in (a["log10_pc"], b["log10_pc"]) else b["log10_pc"] - a["log10_pc"],
                    "entered_urgent_window": urgent,
                    "crossed_model_cutoff": a["model_input"] and not b["model_input"],
                    "new_flags": new_flags,
                    "cleared_flags": cleared,
                    "significant": a["rule_tier"] != b["rule_tier"] or bool(crossings) or urgent or bool(new_flags),
                }
            )
        return out

    def _review(self, eid: str, hist: list[dict], changes: list[dict]) -> dict:
        r = self.reviews.get(eid)
        if not r or r["status"] == "unreviewed" or r["observation_id"] is None:
            return {"status": "unreviewed", "observation_id": None, "needs_renewal": False, "renewal_reason": None, "storage": STORAGE}
        reviewed = next((o for o in hist if o["observation_id"] == r["observation_id"]), None)
        reason = None
        if reviewed:
            for c in changes:
                if c["to_update_index"] <= reviewed["update_index"]:
                    continue
                before = -1 if c["tier_before"] is None else LEVEL[c["tier_before"]]
                after = -1 if c["tier_after"] is None else LEVEL[c["tier_after"]]
                at = f"at update {c['to_update_index']}, after the review of update {reviewed['update_index']}."
                if c["tier_after"] is None and c["tier_before"] is not None:
                    reason = f"Assessment could not be completed {at}"
                elif after > before:
                    reason = f"Tier rose from {c['tier_before']} to {c['tier_after']} {at}"
                elif c["entered_urgent_window"]:
                    reason = f"Closest approach moved inside {URGENT_HOURS:g} h {at}"
                if reason:
                    break
        return {"status": r["status"], "observation_id": r["observation_id"], "needs_renewal": reason is not None,
                "renewal_reason": reason, "storage": STORAGE}

    def _queue_item(self, eid: str, hist: list[dict] | None = None) -> dict | None:
        hist = hist or self.history(eid)
        a = self._assess(eid, hist)
        if a is None:
            return None  # no non-negative observation: not in upcoming views (SG-01.3)
        cur = a["current"]
        fired = threshold_rules(cur["log10_pc"], cur["miss_distance_m"])
        reason_codes = [k for k, v in fired.items() if v]
        if a["upgraded"]:
            reason_codes.append("MODEL_UPGRADE")
        if cur["tca_hours"] is not None and cur["tca_hours"] <= URGENT_HOURS:
            reason_codes.append("TCA_LE_24H")
        if a["rule_tier"] is None:
            reason_codes.append("ASSESSMENT_INCOMPLETE")
        object_type = self.by_encounter[eid]["c_object_type"].iloc[-1]
        return {
            "encounter_id": eid,
            "observation_id": cur["observation_id"],
            "priority": priority_for(a["risk_tier"], cur["tca_hours"]),
            "status": "incomplete" if a["rule_tier"] is None else "assessed",
            "model_status": "scored" if a["scored"] else "unable_to_assess",
            "risk_tier": a["risk_tier"],
            "rule_tier": a["rule_tier"],
            "upgraded": a["upgraded"],
            "p_critical": a["p"],
            "log10_pc": cur["log10_pc"],
            "miss_distance_m": cur["miss_distance_m"],
            "tca_hours": cur["tca_hours"],
            "quality_flags": cur["quality_flags"],
            "reason_codes": reason_codes,
            "object_type": None if pd.isna(object_type) else str(object_type),
            "review": self._review(eid, hist, self._changes(hist)),
        }

    def _receipt(self, eid: str, hist: list[dict], a: dict, geo: dict) -> dict:
        cur = a["current"]
        pc, d, tca, p = cur["log10_pc"], cur["miss_distance_m"], cur["tca_hours"], a["p"]
        fired = threshold_rules(pc, d)
        threshold = self.model["threshold"]
        if not a["scored"]:
            model_evidence = "no score: no message ≥ 2 d before closest approach"
        elif a["upgraded"]:
            model_evidence = f"score {p:.2f} ≥ {threshold} · rule tier {a['rule_tier']} raised to critical"
        elif a["rule_tier"] == "critical":
            model_evidence = f"score {p:.2f} · rule tier already critical, nothing to raise"
        elif a["rule_tier"] is None:
            model_evidence = f"score {p:.2f} · no rule tier to raise"
        else:
            model_evidence = f"score {p:.2f} < {threshold}"

        def pc_text(v):
            return "log₁₀ Pc not supplied" if v is None else f"log₁₀ Pc = {v:.2f}" + (" (reporting floor)" if v <= RISK_FLOOR else "")

        miss_text = "miss distance not supplied" if d is None else f"miss = {d:.0f} m"
        rules = [
            {"code": "PC_GE_1E-4", "kind": "probability", "description": f"Supplied log₁₀ Pc ≥ {CRITICAL_LOG_PC:g} → critical",
             "triggered": fired["PC_GE_1E-4"], "evidence": pc_text(pc)},
            {"code": "MISS_LT_1KM", "kind": "distance", "description": f"Supplied miss distance < {CRITICAL_DISTANCE_M / 1000:g} km → critical",
             "triggered": fired["MISS_LT_1KM"], "evidence": miss_text},
            {"code": "PC_GE_1E-6", "kind": "probability", "description": f"Supplied log₁₀ Pc ≥ {ELEVATED_LOG_PC:g} → at least elevated",
             "triggered": fired["PC_GE_1E-6"], "evidence": pc_text(pc)},
            {"code": "MISS_LE_5KM", "kind": "distance", "description": f"Supplied miss distance ≤ {ELEVATED_DISTANCE_M / 1000:g} km → at least elevated",
             "triggered": fired["MISS_LE_5KM"], "evidence": miss_text},
            {"code": "MODEL_UPGRADE", "kind": "model",
             "description": f"Forecast score ≥ {threshold} raises a safe or elevated rule tier to critical. It never lowers a tier.",
             "triggered": a["upgraded"], "evidence": model_evidence},
            {"code": "TCA_LE_24H", "kind": "urgency", "description": f"Closest approach within {URGENT_HOURS:g} h → raises the queue band, not the tier",
             "triggered": tca is not None and tca <= URGENT_HOURS,
             "evidence": "time to closest approach not supplied" if tca is None else f"{tca:.1f} h to closest approach"},
            {"code": "ASSESSMENT_INCOMPLETE", "kind": "quality", "description": "A required input is missing → routed to incomplete review, never safe",
             "triggered": a["rule_tier"] is None,
             "evidence": "miss distance not supplied" if a["rule_tier"] is None else "all required inputs present"},
        ]

        causes = []
        if a["risk_tier"] == "critical":
            causes += [c for c, k in (("probability", "PC_GE_1E-4"), ("distance", "MISS_LT_1KM")) if fired[k]]
            if a["upgraded"]:
                causes.append("model")
        elif a["risk_tier"] == "elevated":
            causes += [c for c, k in (("probability", "PC_GE_1E-6"), ("distance", "MISS_LE_5KM")) if fired[k]]
        urgent = tca is not None and tca <= URGENT_HOURS and a["risk_tier"] not in (None, "safe")

        cause_text = " and ".join(
            f"supplied probability (log₁₀ Pc {pc:.2f})" if c == "probability"
            else f"supplied miss distance ({d:.0f} m)" if c == "distance"
            else f"the model forecast (score {p:.2f})"
            for c in causes
        )
        if not a["scored"]:
            model_text = "No forecast: there is no message at least 2 days before closest approach."
        elif a["upgraded"]:
            model_text = f"The forecast raised the rule tier from {a['rule_tier']} to critical."
        elif a["rule_tier"] == "critical" and p >= threshold:
            model_text = f"The forecast score ({p:.2f}) also exceeds the upgrade threshold."
        elif a["rule_tier"] == "critical" and not cur["model_input"]:
            model_text = (f"The forecast score was {p:.2f} at the 2-day cutoff: the early messages carried no warning. "
                          "The critical tier comes from the latest message alone.")
        else:
            model_text = f"The forecast score ({p:.2f}) is below the upgrade threshold, so the tier comes from the rules alone."
        if a["rule_tier"] is None:
            summary = ("Assessment incomplete: miss distance was not supplied, so the distance rule could not run. "
                       "Routed for manual review rather than treated as safe.")
        elif a["risk_tier"] == "safe":
            summary = f"No probability or distance rule fired on the latest message. {model_text} Kept in routine monitoring."
        else:
            band = (f"Closest approach inside {URGENT_HOURS:g} h moved it up a band." if urgent
                    else f"Not inside the {URGENT_HOURS:g} h window, so urgency did not change the band.")
            summary = f"{a['risk_tier'].capitalize()} because of {cause_text}. {model_text} {band}"

        msg = self.by_encounter[eid].set_index("row_id").loc[cur["observation_id"]]

        def used(rule: bool, model: bool) -> list[str]:
            return (["rule"] if rule else []) + (["model"] if model and a["scored"] else [])

        def fmt(v, digits=0):
            v = _num(v)
            return "not supplied" if v is None else f"{v:.{digits}f}"

        inputs = [
            {"field": "time_to_tca", "value": fmt(tca, 1), "unit": "h", "used_by": used(True, True), "imputed": False,
             "note": "supplied in days; converted to hours"},
            {"field": "risk", "value": fmt(pc, 2), "unit": "log₁₀ Pc", "used_by": used(True, True), "imputed": False,
             "note": "reporting floor: Pc too small to compute" if pc is not None and pc <= RISK_FLOOR else "supplied with the message, not a model output"},
            {"field": "miss_distance", "value": fmt(d), "unit": "m", "used_by": used(True, True), "imputed": False,
             "note": "required input missing" if d is None else None},
            {"field": "relative_speed", "value": fmt(geo["relative_speed_m_s"]), "unit": "m/s", "used_by": used(False, True), "imputed": False, "note": None},
            {"field": "relative_position_r", "value": fmt(geo["r_m"]), "unit": "m", "used_by": used(False, True), "imputed": False, "note": None},
            {"field": "relative_position_t", "value": fmt(geo["t_m"]), "unit": "m", "used_by": used(False, True), "imputed": False, "note": None},
            {"field": "relative_position_n", "value": fmt(geo["n_m"]), "unit": "m", "used_by": used(False, True), "imputed": False, "note": None},
            {"field": "c_sigma_r", "value": fmt(msg["c_sigma_r"], 1), "unit": "m", "used_by": used(False, True), "imputed": False,
             "note": "placeholder treated as missing" if msg["c_sigma_r"] >= SIGMA_PLACEHOLDER else None},
            {"field": "t_sigma_r", "value": fmt(msg["t_sigma_r"], 1), "unit": "m", "used_by": used(False, True), "imputed": False,
             "note": "placeholder treated as missing" if msg["t_sigma_r"] >= SIGMA_PLACEHOLDER else None},
            {"field": "c_object_type", "value": "not supplied" if pd.isna(msg["c_object_type"]) else str(msg["c_object_type"]),
             "unit": None, "used_by": used(False, True), "imputed": False, "note": None},
            {"field": "F10", "value": fmt(msg["F10"]), "unit": "sfu", "used_by": used(False, True), "imputed": False,
             "note": "space weather missing" if pd.isna(msg["F10"]) else None},
            {"field": "AP", "value": fmt(msg["AP"]), "unit": None, "used_by": used(False, True), "imputed": False,
             "note": "space weather missing" if pd.isna(msg["AP"]) else None},
        ]

        flags = list(cur["quality_flags"])
        if not a["scored"]:
            flags.append("NO_EARLY_MESSAGE")
        elif self.n_early.get(eid) == 1:
            flags.append("SINGLE_EARLY_MESSAGE")
        return {
            "observation_id": cur["observation_id"],
            "model_input_observation_id": a["model_input"]["observation_id"] if a["model_input"] else None,
            "model_input_count": a["model_input_count"],
            "inputs": inputs,
            "thresholds": {
                "critical_log10_pc": CRITICAL_LOG_PC, "elevated_log10_pc": ELEVATED_LOG_PC,
                "critical_distance_m": CRITICAL_DISTANCE_M, "elevated_distance_m": ELEVATED_DISTANCE_M,
                "urgent_tca_hours": URGENT_HOURS, "upgrade_p_critical": threshold,
                "model_input_cutoff_hours": EARLY_CUTOFF_DAYS * 24,
            },
            "rules": rules,
            "rule_tier": a["rule_tier"],
            "risk_tier": a["risk_tier"],
            "upgraded": a["upgraded"],
            "p_critical": p,
            "model_status": "scored" if a["scored"] else "unable_to_assess",
            "upgrade_reasons": self.reasons.get(eid, []) if a["upgraded"] else [],
            "escalation_causes": causes,
            "urgency_raised_band": urgent,
            "escalation_summary": summary,
            "quality_handling": [{"flag": f, "handling": HANDLING.get(f, "No handling note.")} for f in flags],
            "model_version": self.model["model_version"],
            "model_sha256": self.model["model_sha256"],
            "policy_version": POLICY_VERSION,
        }

    # --- endpoints -------------------------------------------------------------

    def queue(self) -> dict:
        items = sorted(
            self.items.values(),
            key=lambda i: (BAND_ORDER.index(i["priority"]), i["tca_hours"] if i["tca_hours"] is not None else math.inf, i["encounter_id"]),
        )
        return {"model_version": self.model["model_version"], "policy_version": POLICY_VERSION, "cohort": self.cohort, "items": items}

    def encounter(self, eid: str) -> dict | None:
        if eid not in self.items:
            return None
        hist = self.history(eid)
        a = self._assess(eid, hist)
        cur = self.by_encounter[eid].set_index("row_id").loc[a["current"]["observation_id"]]
        placeholder = bool(cur["c_sigma_r"] >= SIGMA_PLACEHOLDER or cur["t_sigma_r"] >= SIGMA_PLACEHOLDER)
        geo = {
            "r_m": _num(cur["relative_position_r"]), "t_m": _num(cur["relative_position_t"]), "n_m": _num(cur["relative_position_n"]),
            "relative_speed_m_s": _num(cur["relative_speed"]),
            "c_sigma_r_m": _sigma(cur["c_sigma_r"]), "t_sigma_r_m": _sigma(cur["t_sigma_r"]),
            "sigma_placeholder": placeholder,
        }
        return {"summary": self._queue_item(eid, hist), "history": hist, "changes": self._changes(hist),
                "geometry": geo, "receipt": self._receipt(eid, hist, a, geo)}

    def radar(self) -> dict:
        bins = [{"from_hours": lo, "to_hours": BIN_EDGES[i + 1] if i + 1 < len(BIN_EDGES) else None,
                 "critical": 0, "elevated": 0, "safe": 0, "incomplete": 0} for i, lo in enumerate(BIN_EDGES)]
        for item in self.items.values():
            t = item["tca_hours"]
            if t is None or t < 0:
                continue
            b = next((b for b in bins if t >= b["from_hours"] and (b["to_hours"] is None or t < b["to_hours"])), None)
            if b is not None:
                b[item["risk_tier"] or "incomplete"] += 1
        return {"bins": bins, "cohort": self.cohort, "caveat": self.caveat}

    def set_review(self, eid: str, status: str, observation_id: str) -> dict:
        if eid not in self.items:
            raise KeyError(eid)
        if status not in ("unreviewed", "acknowledged", "escalated"):
            raise ValueError(f"unknown review status {status!r}")
        hist = self.history(eid)
        if not any(o["observation_id"] == observation_id for o in hist):
            raise ValueError(f"observation {observation_id} is not part of {eid}")
        self.reviews[eid] = {"status": status, "observation_id": None if status == "unreviewed" else observation_id}
        state = self._review(eid, hist, self._changes(hist))
        self.items[eid]["review"] = state
        return state


def make_handler(data: DemoData):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, status: int, body) -> None:
            payload = json.dumps(body, default=_num).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def _error(self, status: int, message: str) -> None:
            self._send(status, {"error": message})

        def do_OPTIONS(self):  # CORS preflight for the review POST
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self):
            path = self.path.split("?", 1)[0].rstrip("/")
            if path == "/queue":
                return self._send(200, data.queue())
            if path == "/radar":
                return self._send(200, data.radar())
            if path == "/metrics":
                if data.metrics is None:
                    return self._error(404, "no metrics file given; start with --metrics")
                return self._send(200, data.metrics)
            if path in ("", "/health"):
                return self._send(200, {"status": "ok", "cohort": data.cohort, "encounters": len(data.items),
                                        "model_version": data.model["model_version"]})
            m = re.fullmatch(r"/encounters/([^/]+)", path)
            if m:
                detail = data.encounter(unquote(m.group(1)))
                return self._send(200, detail) if detail else self._error(404, f"no encounter {unquote(m.group(1))}")
            self._error(404, f"unknown path {path}")

        def do_POST(self):
            m = re.fullmatch(r"/encounters/([^/]+)/review", self.path.split("?", 1)[0])
            if not m:
                return self._error(404, f"unknown path {self.path}")
            try:
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                return self._send(200, data.set_review(unquote(m.group(1)), body.get("status"), body.get("observation_id")))
            except KeyError as e:
                return self._error(404, f"no encounter {e}")
            except (ValueError, json.JSONDecodeError) as e:
                return self._error(400, str(e))

        def log_message(self, fmt, *args):
            pass

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--cohort", choices=["validation", "test"], default="validation")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--model-dir", default=None)
    parser.add_argument("--metrics", type=Path, default=None,
                        help="evaluation JSON to serve at /metrics (e.g. the dashboard's bundled validation.json)")
    args = parser.parse_args()

    data = DemoData(args.cohort, args.model_dir, args.metrics)
    counts = pd.Series([i["priority"] for i in data.items.values()]).value_counts().to_dict()
    print(f"ml.demo_api: {len(data.items)} encounters ({data.cohort}); model {data.model['model_version']}")
    print(f"  bands: {counts}")
    print(f"  http://localhost:{args.port}  (dashboard: VITE_API_URL=http://localhost:{args.port})")
    ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(data)).serve_forever()


if __name__ == "__main__":
    main()
