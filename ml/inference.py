"""SG-05.4 Package inference.

Backend usage (Iain, SG-02.3):
    from ml.inference import load_model, predict_encounters
    model = load_model("ml/artifacts/<run>")
    records = predict_encounters(model, messages)   # messages for one or more encounters

Output per encounter (field names follow contracts/ once SG-01.2 lands):
    encounter_id, latest_early_row_id, persistence_tier, p_critical, predicted_tier,
    upgraded (bool), upgrade_reasons, model_version, status

Done when:
- Messages with time_to_tca < 2 days are ignored; encounters with no early message
  return status "unable_to_assess", never a tier.
- Model, features, and threshold saved together; feature schema, dependency versions,
  artifact checksum, and version recorded.
- Missing or unloadable model raises an explicit error, never fabricated output.
"""


def load_model(path):
    raise NotImplementedError("SG-05.4")


def predict_encounters(model, messages):
    raise NotImplementedError("SG-05.4")
