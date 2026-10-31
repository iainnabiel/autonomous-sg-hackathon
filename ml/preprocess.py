"""SG-04.3 Implement preprocessing.

Library module, used by ml.train and ml.inference:
    build_preprocessor(feature_set) -> unfitted sklearn transformer

Done when:
- Fitted on the training partition only.
- Missing numerics imputed, with indicator columns so receipts can name imputed fields.
- Unseen c_object_type categories handled at inference.
- risk and encounter IDs cannot enter the matrix (use ml.data.feature_columns).
"""


def build_preprocessor(feature_set: str):
    raise NotImplementedError("SG-04.3")
