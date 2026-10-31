"""SG-04.3 Build encounter features from early messages.

Library module, used by ml.train and ml.inference:
    build_features(early_messages) -> DataFrame, one row per encounter_id

Planned features (all from messages with time_to_tca >= 2 days):
- Latest early message: risk, miss_distance, sigmas, relative position/speed, c_object_type.
- Persistence tier of the latest early message (ml.data.tier).
- Trends: message count, min miss distance, miss-distance and risk slope vs time_to_tca,
  change between first and latest early message.
- Physics-informed: miss_distance / sqrt(c_sigma_r^2 + t_sigma_r^2), log miss distance.

Done when:
- Uses only early messages; same function for train and test.
- Missing values handled with indicator columns so receipts can name them.
- Unseen c_object_type categories handled.
- ml.data.check_features passes (no IDs, mission_id, or final_* columns).
"""


def build_features(early_messages):
    raise NotImplementedError("SG-04.3")
