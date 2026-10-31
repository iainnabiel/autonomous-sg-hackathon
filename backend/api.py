"""SG-02.4/02.5/02.6 HTTP API for the dashboard (standard library server).

Run from the repository root, with the challenge CSVs in ``Datasets/`` and a
model bundle from ``python -m ml.train --model upgrade --features base``:

    python -m backend.api --cohort validation --model-dir ml/artifacts/upgrade_base --port 8000

Endpoints (dashboard client paths, provisional ``frontend/src/api/types.ts`` shape):

- ``GET /health``: cohort, counts, data and model checksums, model status.
- ``GET /queue``: encounters in band order, plus ``excluded`` (all messages
  after closest approach), cohort label and versions.
- ``GET /encounters/{id}``: summary, history in update order, geometry and
  decision receipt. ``changes`` is null until SG-02.7.
- ``GET /radar``: counts by hours to closest approach and tier.
- ``POST /encounters/{id}/review``: 501, SG-02.8 is not implemented.
- ``GET /metrics``: 404, evaluation evidence is SG-03.4.

A failed model load is not fatal: every forecast is ``unavailable`` and the
reason is in ``/health`` and each receipt. Missing data files are fatal.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

from backend.radar import radar
from backend.receipts import build_receipt
from backend.service import CohortState, build_cohort
from backend.views import geometry, history, queue_item
from contracts.ids import EncounterId
from contracts.policy import POLICY_VERSION, TRIAGE_POLICY_VERSION

_ENCOUNTER = re.compile(r"/encounters/([^/]+)")
_REVIEW = re.compile(r"/encounters/([^/]+)/review")


def health(state: CohortState) -> dict:
    bands = Counter(a.decision.priority.value for a in state.queue)
    return {
        "status": "ok",
        "cohort": state.cohort,
        "view_label": state.view_label,
        "encounters": len(state.assessments),
        "queued": len(state.queue),
        "excluded": len(state.excluded),
        "bands": dict(bands),
        "message_status": state.status_counts,
        "messages_without_encounter": state.messages_without_encounter,
        "data_sha256": state.data_sha256,
        "model_status": "unavailable" if state.model is None else "loaded",
        "model_problem": state.model_problem,
        "model_version": state.model.model_version if state.model else None,
        "model_sha256": state.model.model_sha256 if state.model else None,
        "upgrade_threshold": state.model.threshold if state.model else None,
        "policy_version": TRIAGE_POLICY_VERSION,
        "schema_version": POLICY_VERSION,
    }


def queue(state: CohortState) -> dict:
    return {
        "items": [queue_item(a) for a in state.queue],
        "excluded": [queue_item(a) for a in state.excluded],
        "cohort": state.view_label,
        "model_version": state.model.model_version if state.model else None,
        "model_sha256": state.model.model_sha256 if state.model else None,
        "model_problem": state.model_problem,
        "policy_version": TRIAGE_POLICY_VERSION,
    }


def encounter(state: CohortState, key: str) -> dict | None:
    assessment = state.find(key)
    if assessment is None:
        return None
    return {
        "summary": queue_item(assessment),
        "history": history(assessment),
        "changes": None,
        "geometry": geometry(assessment.assessed_message),
        "receipt": build_receipt(assessment, state.model),
    }


def make_handler(state: CohortState):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, status: int, body: dict) -> None:
            payload = json.dumps(body, allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def _error(self, status: int, message: str) -> None:
            self._send(status, {"error": message})

        def do_OPTIONS(self) -> None:
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self) -> None:
            path = self.path.split("?", 1)[0].rstrip("/") or "/health"
            if path == "/health":
                return self._send(200, health(state))
            if path == "/queue":
                return self._send(200, queue(state))
            if path == "/radar":
                return self._send(200, radar(state.assessments.values(), cohort=state.view_label, caveat=state.caveat))
            if path == "/metrics":
                return self._error(404, "evaluation evidence is served by SG-03.4, not this backend")
            match = _ENCOUNTER.fullmatch(path)
            if match:
                key = unquote(match.group(1))
                try:
                    EncounterId.parse(key)
                except ValueError:
                    return self._error(400, f"malformed encounter id {key!r}; expected e.g. 'test:57'")
                detail = encounter(state, key)
                return self._send(200, detail) if detail else self._error(404, f"no encounter {key} in this cohort")
            return self._error(404, f"unknown path {path}")

        def do_POST(self) -> None:
            if _REVIEW.fullmatch(self.path.split("?", 1)[0]):
                return self._error(501, "review status is SG-02.8 (Next) and is not implemented yet")
            return self._error(404, f"unknown path {self.path}")

        def log_message(self, fmt, *args) -> None:
            pass

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="SG-02 review-queue API")
    parser.add_argument("--cohort", choices=["validation", "test"], default="validation")
    parser.add_argument("--model-dir", default="ml/artifacts/upgrade_base")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    state = build_cohort(args.cohort, args.model_dir)
    info = health(state)
    print(f"backend.api: {info['encounters']} encounters ({state.view_label})")
    print(f"  queued {info['queued']}, excluded {info['excluded']}, bands {info['bands']}")
    print(f"  model {info['model_status']}: {info['model_version'] or info['model_problem']}")
    print(f"  http://{args.host}:{args.port}  (dashboard: VITE_API_URL=http://localhost:{args.port})")
    ThreadingHTTPServer((args.host, args.port), make_handler(state)).serve_forever()


if __name__ == "__main__":
    main()
