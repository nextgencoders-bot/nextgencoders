"""Compare deterministic SupportNova checks with the synthetic fixture labels."""
import csv
import os
import sys
from collections import Counter
from pathlib import Path

# The evaluation must remain offline even if the project .env has a provider key.
for key in ("SUPPORTNOVA_AI_API_KEY", "OPENROUTER_API_KEY", "SUPPORTNOVA_OPENAI_API_KEY"):
    os.environ[key] = ""

import server

DATA = Path(__file__).with_name("sample_complaints.csv")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
FIELDS = (
    ("category", "expected_category"),
    ("subcategory", "expected_subcategory"),
    ("department", "expected_department"),
    ("priority", "expected_priority"),
    ("urgency", "expected_urgency"),
    ("escalation", "expected_escalation"),
    ("sentiment", "expected_sentiment"),
)


def evaluate():
    with DATA.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    compared, matches, mismatches = Counter(), Counter(), []
    for row in rows:
        result = server.analyze(row["description"], row["title"], row["product_or_service"], row["order_reference"])
        tags = set(row["case_tags"].split(";"))
        for field, expected in FIELDS:
            # Linked-history priority/escalation is checked through the API
            # workflow test, which opens the referenced unresolved complaint.
            if field in ("priority", "urgency", "escalation") and "repeat_contact" in tags:
                continue
            compared[field] += 1
            if result[field] == row[expected]:
                matches[field] += 1
            else:
                mismatches.append((row["complaint_id"], field, row[expected], result[field]))
    return compared, matches, mismatches


if __name__ == "__main__":
    compared, matches, mismatches = evaluate()
    for field, total in compared.items():
        print(f"{field}: {matches[field]}/{total} deterministic matches")
    if mismatches:
        print("Mismatches:", mismatches[:20])
        raise SystemExit(1)
    print("PASS: all compared deterministic fields match the synthetic labels.")
