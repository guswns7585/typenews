from __future__ import annotations

import json
import runpy
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILD_SCRIPT = ROOT / "scripts" / "build-editorial-content-0049.py"
MANIFEST = ROOT / "backups" / "content-editorial-0049.json"


def main() -> None:
    module = runpy.run_path(str(BUILD_SCRIPT))
    compact = module["compact"]
    identity = module["identity"]
    valid_text = module["valid_text"]
    fetch_current_rows = module["fetch_current_rows"]

    replacements = json.loads(MANIFEST.read_text(encoding="utf-8"))
    current_rows = fetch_current_rows()
    by_id = {int(row["id"]): dict(row) for row in current_rows}

    old_count = 0
    new_count = 0
    mismatches: list[int] = []
    for replacement in replacements:
        row = by_id.get(int(replacement["id"]))
        if not row or row["language"] != replacement["language"] or row["mode"] != replacement["mode"]:
            mismatches.append(int(replacement["id"]))
            continue
        if compact(str(row["text"])) == compact(str(replacement["old_text"])):
            old_count += 1
        elif compact(str(row["text"])) == compact(str(replacement["text"])):
            new_count += 1
        else:
            mismatches.append(int(replacement["id"]))
    if mismatches:
        raise RuntimeError(f"Current database has {len(mismatches)} unexpected target rows: {mismatches[:20]}")

    simulated = {row_id: dict(row) for row_id, row in by_id.items()}
    for replacement in replacements:
        simulated[int(replacement["id"])]["text"] = replacement["text"]

    identities = [
        identity(str(row["language"]), str(row["mode"]), str(row["text"]))
        for row in simulated.values()
    ]
    duplicates = [item for item, count in Counter(identities).items() if count > 1]
    if duplicates:
        raise RuntimeError(f"Simulated database contains duplicate entries: {duplicates[:10]}")

    invalid_targets = [
        int(row["id"])
        for row in replacements
        if not valid_text(str(row["language"]), str(row["text"]))
    ]
    if invalid_targets:
        raise RuntimeError(f"Replacement text contains disallowed characters: {invalid_targets[:20]}")

    before_counts = Counter((str(row["language"]), str(row["mode"])) for row in current_rows)
    after_counts = Counter((str(row["language"]), str(row["mode"])) for row in simulated.values())
    if before_counts != after_counts:
        raise RuntimeError("Language or mode counts changed during simulation")

    report = {
        "database_rows": len(current_rows),
        "target_rows": len(replacements),
        "currently_at_0048": old_count,
        "already_at_0049": new_count,
        "unexpected_targets": 0,
        "post_apply_unique_rows": len(set(identities)),
        "post_apply_duplicate_rows": 0,
        "post_apply_invalid_targets": 0,
        "counts_unchanged": True,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
