"""Exports every Firestore document to local JSONL files.

Usage:
    python scripts\backup_firestore.py --service-account C:\secure\service-account.json
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import DocumentReference, GeoPoint


def json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return {"_type": "bytes", "base64": base64.b64encode(value).decode("ascii")}
    if isinstance(value, DocumentReference):
        return {"_type": "document_reference", "path": value.path}
    if isinstance(value, GeoPoint):
        return {"_type": "geo_point", "latitude": value.latitude, "longitude": value.longitude}
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def firebase_uid_for(path: str) -> str | None:
    segments = path.split("/")
    if len(segments) >= 2 and segments[0] in {"users", "suspiciousRecords"}:
        return segments[1]
    return None


class RotatingJsonlWriter:
    def __init__(self, output_dir: Path, collection_id: str, max_lines: int):
        self.output_dir = output_dir
        self.collection_id = collection_id
        self.max_lines = max_lines
        self.file = None
        self.file_index = 0
        self.lines_in_file = 0
        self.files: list[str] = []

    @property
    def name(self) -> str:
        return self.file.name if self.file else self.collection_id

    def write(self, line: str) -> None:
        if self.file is None or self.lines_in_file >= self.max_lines:
            self._open_next_file()
        self.file.write(line)
        self.lines_in_file += 1

    def close(self) -> None:
        if self.file:
            self.file.close()

    def _open_next_file(self) -> None:
        self.close()
        self.file_index += 1
        output_file = self.output_dir / f"{self.collection_id}-{self.file_index:04d}.jsonl"
        self.file = output_file.open("w", encoding="utf-8", newline="\n")
        self.lines_in_file = 0
        self.files.append(output_file.name)


def export_document(document, writer, counts: Counter) -> None:
    document_path = document.reference.path
    record = {
        "path": document_path,
        "document_id": document.id,
        "parent_path": document_path.rsplit("/", 1)[0],
        "firebase_uid": firebase_uid_for(document_path),
        "data": document.to_dict(),
    }
    writer.write(json.dumps(record, ensure_ascii=False, default=json_default) + "\n")
    counts["documents"] += 1
    if counts["documents"] % 100 == 0:
        print(f"{writer.name}: {counts['documents']}개 문서 백업", flush=True)

    for subcollection in document.reference.collections():
        for child in list(subcollection.stream()):
            export_document(child, writer, counts)


def export_collection(collection, output_dir: Path, max_lines: int) -> dict:
    counts: Counter = Counter()
    documents = list(collection.stream())
    writer = RotatingJsonlWriter(output_dir, collection.id, max_lines)
    try:
        for document in documents:
            export_document(document, writer, counts)
    finally:
        writer.close()
    return {"documents": counts["documents"], "files": writer.files}


def main() -> None:
    parser = argparse.ArgumentParser(description="Export all Firestore documents as JSONL.")
    parser.add_argument(
        "--service-account",
        default=os.environ.get("FIREBASE_SERVICE_ACCOUNT"),
        help="Path to a Firebase service-account JSON file. Defaults to FIREBASE_SERVICE_ACCOUNT.",
    )
    parser.add_argument("--project-id", default="typenews-dbe9c")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("backups") / f"firebase-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}",
    )
    parser.add_argument("--max-lines", type=int, default=1000)
    args = parser.parse_args()

    if not args.service_account:
        parser.error("--service-account 또는 FIREBASE_SERVICE_ACCOUNT가 필요합니다.")
    if args.max_lines < 1:
        parser.error("--max-lines는 1 이상이어야 합니다.")

    credential_path = Path(args.service_account).expanduser().resolve()
    if not credential_path.is_file():
        parser.error(f"서비스 계정 키를 찾을 수 없습니다: {credential_path}")

    firebase_admin.initialize_app(
        credentials.Certificate(str(credential_path)),
        {"projectId": args.project_id},
    )
    database = firestore.client()
    firestore_dir = args.output_dir / "firestore"
    firestore_dir.mkdir(parents=True, exist_ok=False)

    collection_counts = {}
    for collection in database.collections():
        print(f"{collection.id} 컬렉션 백업 시작", flush=True)
        collection_counts[collection.id] = export_collection(
            collection, firestore_dir, args.max_lines
        )

    manifest = {
        "project_id": args.project_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "format": "jsonl",
        "collections": collection_counts,
        "max_lines_per_file": args.max_lines,
        "total_documents": sum(item["documents"] for item in collection_counts.values()),
        "notes": [
            "Firestore document fields are preserved under data.",
            "firebase_uid is derived from users/{uid} and suspiciousRecords/{uid} paths.",
            "pastRankings ranking uid values are exported without correction.",
        ],
    }
    (args.output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Firestore 백업 완료: {args.output_dir.resolve()}")
    print(f"문서 수: {manifest['total_documents']}")


if __name__ == "__main__":
    main()
