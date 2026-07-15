"""Exports suspiciousRecords/*/records documents to split JSONL files."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

from backup_firestore import RotatingJsonlWriter, json_default


def record_pages(database, page_size: int = 100):
    query = (
        database.collection_group("records")
        .order_by("__name__")
        .limit(page_size)
    )
    cursor = None

    while True:
        page_query = query if cursor is None else query.start_after(cursor)
        documents = list(page_query.stream())
        if not documents:
            return
        yield documents
        if len(documents) < page_size:
            return
        cursor = documents[-1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Export suspicious record documents as JSONL.")
    parser.add_argument("--service-account", required=True)
    parser.add_argument("--project-id", default="typenews-dbe9c")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("backups")
        / f"suspicious-records-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}",
    )
    parser.add_argument("--max-lines", type=int, default=1000)
    args = parser.parse_args()

    if args.max_lines < 1:
        parser.error("--max-lines는 1 이상이어야 합니다.")

    key_path = Path(args.service_account).expanduser().resolve()
    if not key_path.is_file():
        parser.error(f"서비스 계정 키를 찾을 수 없습니다: {key_path}")

    firebase_admin.initialize_app(
        credentials.Certificate(str(key_path)),
        {"projectId": args.project_id},
    )

    args.output_dir.mkdir(parents=True, exist_ok=False)
    writer = RotatingJsonlWriter(args.output_dir, "suspicious-records", args.max_lines)
    exported = 0
    skipped = 0

    try:
        database = firestore.client()
        for documents in record_pages(database):
            for document in documents:
                path_parts = document.reference.path.split("/")
                if len(path_parts) < 4 or path_parts[0] != "suspiciousRecords":
                    skipped += 1
                    continue

                writer.write(
                    json.dumps(
                        {
                            "path": document.reference.path,
                            "document_id": document.id,
                            "parent_path": document.reference.path.rsplit("/", 1)[0],
                            "firebase_uid": path_parts[1],
                            "data": document.to_dict(),
                        },
                        ensure_ascii=False,
                        default=json_default,
                    )
                    + "\n"
                )
                exported += 1
                if exported % 100 == 0:
                    print(f"{writer.name}: {exported}개 문서 백업", flush=True)
    finally:
        writer.close()

    manifest = {
        "project_id": args.project_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "collection_group": "suspiciousRecords/*/records",
        "documents": exported,
        "files": writer.files,
        "skipped_non_suspicious_records": skipped,
        "max_lines_per_file": args.max_lines,
    }
    (args.output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"suspiciousRecords 백업 완료: {args.output_dir.resolve()}")
    print(f"문서 수: {exported}")


if __name__ == "__main__":
    main()
