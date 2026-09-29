"""Validate the minimum SRS coverage of sample_complaints.csv."""
import csv
from collections import Counter
from pathlib import Path

DATA = Path(__file__).with_name("sample_complaints.csv")
REQUIRED = {
    "complaint_id", "title", "description", "customer_type", "product_or_service",
    "order_reference", "channel", "expected_category", "expected_subcategory",
    "expected_department", "expected_priority", "expected_urgency",
    "expected_escalation", "expected_policy_reference", "expected_sentiment",
    "expected_secondary_categories", "expected_supporting_departments",
    "previous_complaint_reference", "case_tags",
}


def validate():
    with DATA.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        missing = REQUIRED - set(reader.fieldnames or ())
        if missing:
            raise ValueError(f"Missing columns: {sorted(missing)}")
        rows = list(reader)
    ids = [r["complaint_id"] for r in rows]
    descriptions = [" ".join(r["description"].casefold().split()) for r in rows]
    categories = {r["expected_category"] for r in rows}
    subcategories = {r["expected_subcategory"] for r in rows}
    departments = {r["expected_department"] for r in rows}
    tag_counts = Counter(tag for row in rows for tag in row["case_tags"].split(";") if tag)
    failures = []
    if len(rows) < 500: failures.append(f"expected >=500 rows, got {len(rows)}")
    if len(set(ids)) != len(rows): failures.append("complaint_id values are not unique")
    if len(set(descriptions)) != len(rows): failures.append("complaint descriptions are not unique")
    if len(categories) < 10: failures.append(f"expected >=10 categories, got {len(categories)}")
    if len(subcategories) < 20: failures.append(f"expected >=20 subcategories, got {len(subcategories)}")
    if len(departments) < 8: failures.append(f"expected >=8 departments, got {len(departments)}")
    for label in ("multi_issue", "policy_conflict", "prompt_injection", "repeat_contact", "unsupported_refund_request"):
        if tag_counts[label] < 20:
            failures.append(f"expected >=20 {label} cases, got {tag_counts[label]}")
    if any(not row["description"].strip() or not row["expected_policy_reference"].strip() for row in rows):
        failures.append("empty complaint descriptions or expected policy references found")
    id_set=set(ids)
    linked=[r for r in rows if r["previous_complaint_reference"]]
    if len(linked)<25: failures.append(f"expected >=25 linked repeat contacts, got {len(linked)}")
    if any(r["previous_complaint_reference"] not in id_set for r in linked):
        failures.append("repeat-contact reference points to a missing complaint")
    if failures:
        raise ValueError("; ".join(failures))
    return rows, tag_counts, (len(categories), len(subcategories), len(departments))


if __name__ == "__main__":
    rows, tags, coverage = validate()
    print(f"PASS: {len(rows)} unique complaints; {coverage[0]} categories, {coverage[1]} subcategories, {coverage[2]} departments")
    print("Tagged cases:", ", ".join(f"{k}={tags[k]}" for k in ("multi_issue", "policy_conflict", "prompt_injection", "repeat_contact")))
