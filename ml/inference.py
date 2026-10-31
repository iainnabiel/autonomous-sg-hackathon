"""SG-05.4 Package inference.

Backend usage (Iain, SG-02.3):
    from ml.inference import load_model, predict_rows
    model = load_model("ml/artifacts/<run>")
    records = predict_rows(model, rows)

Done when:
- Preprocessing and model saved together; risk excluded even if present in rows.
- Output records follow contracts/ (SG-01.2): row/observation ID, predicted
  log-Pc, Pc, model version, quality/imputation flags.
- Feature schema, dependency versions, artifact checksum, and version recorded.
- Missing or unloadable model raises an explicit error, never fabricated output.
"""


def load_model(path):
    raise NotImplementedError("SG-05.4")


def predict_rows(model, rows):
    raise NotImplementedError("SG-05.4")
