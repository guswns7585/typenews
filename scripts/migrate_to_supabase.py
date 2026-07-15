"""Imports Firebase JSON/JSONL backups into the Type News Supabase schema."""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from supabase import Client, create_client


ADMIN_FIREBASE_UID = "9ZOc8fAzPZhZLPbom5g8jSMRdfb2"


def load_project_env(path: Path = Path(".env")) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def json_lines(path: Path) -> Iterator[dict[str, Any]]:
    with path.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number} JSON 파싱 실패") from error


def batched(rows: Iterator[dict[str, Any]], size: int) -> Iterator[list[dict[str, Any]]]:
    batch: list[dict[str, Any]] = []
    for row in rows:
        batch.append(row)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch


def parse_epoch_millis(value: Any) -> str | None:
    if not value:
        return None
    try:
        return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def google_sub(user: dict[str, Any]) -> str | None:
    for identity in user.get("providerUserInfo", []):
        if identity.get("providerId") == "google.com":
            return identity.get("rawId")
    return None


def load_auth_users(path: Path) -> dict[str, dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    users = data.get("users")
    if not isinstance(users, list):
        raise ValueError("Firebase Auth export에 users 배열이 없습니다.")
    return {user["localId"]: user for user in users if user.get("localId")}


def profile_rows(users_dir: Path, auth_users: dict[str, dict[str, Any]]) -> Iterator[dict[str, Any]]:
    for record in json_lines_from_files(users_dir, "users-*.jsonl"):
        path_parts = record.get("path", "").split("/")
        if len(path_parts) != 2 or path_parts[0] != "users":
            continue
        firebase_uid = path_parts[1]
        source = record.get("data") or {}
        auth_user = auth_users.get(firebase_uid, {})
        yield {
            "firebase_uid": firebase_uid,
            "google_sub": google_sub(auth_user),
            "email": source.get("email") or auth_user.get("email"),
            "display_name": source.get("displayName"),
            "display_name_lower": source.get("displayNameLower"),
            "max_cpm": source.get("maxCPM"),
            "total_typing_count": source.get("totalTypingCount"),
            "preferences": source.get("preferences") or {},
            "role": "admin" if firebase_uid == ADMIN_FIREBASE_UID else "user",
            "firebase_created_at": parse_epoch_millis(auth_user.get("createdAt")),
            "firebase_last_sign_in_at": parse_epoch_millis(auth_user.get("lastSignedInAt")),
        }


def json_lines_from_files(directory: Path, pattern: str) -> Iterator[dict[str, Any]]:
    files = sorted(directory.glob(pattern))
    if not files:
        raise FileNotFoundError(f"{directory}에서 {pattern} 파일을 찾을 수 없습니다.")
    for path in files:
        yield from json_lines(path)


def source_timestamp(data: dict[str, Any], key: str) -> str | None:
    value = data.get(key)
    return value if isinstance(value, str) else None


def monthly_stat_rows(users_dir: Path, profile_ids: dict[str, str]) -> Iterator[dict[str, Any]]:
    for record in json_lines_from_files(users_dir, "users-*.jsonl"):
        path_parts = record.get("path", "").split("/")
        if len(path_parts) != 4 or path_parts[2] != "monthlyStats":
            continue
        firebase_uid, month_id = path_parts[1], path_parts[3]
        profile_id = profile_ids.get(firebase_uid)
        if not profile_id:
            continue
        source = record.get("data") or {}
        yield {
            "profile_id": profile_id,
            "month_id": month_id,
            "typing_count": source.get("typingCount"),
            "nickname": source.get("nickname"),
            "email": source.get("email"),
            "updated_at_source": source_timestamp(source, "updatedAt"),
            "source_path": record["path"],
            "raw_data": source,
        }


def suspicious_record_rows(directory: Path, profile_ids: dict[str, str]) -> Iterator[dict[str, Any]]:
    for record in json_lines_from_files(directory, "suspicious-records-*.jsonl"):
        source = record.get("data") or {}
        firebase_uid = record.get("firebase_uid")
        if not firebase_uid:
            continue
        yield {
            "profile_id": profile_ids.get(firebase_uid),
            "firebase_uid": firebase_uid,
            "record_id": record["document_id"],
            "source_path": record["path"],
            "recorded_at": source_timestamp(source, "timestamp"),
            "record_data": source,
        }


def upsert(client: Client, table: str, rows: Iterator[dict[str, Any]], conflict: str, dry_run: bool, report: Counter, batch_size: int) -> list[dict[str, Any]]:
    returned: list[dict[str, Any]] = []
    for batch in batched(rows, batch_size):
        report[f"{table}_source"] += len(batch)
        if dry_run:
            continue
        result = client.table(table).upsert(batch, on_conflict=conflict).execute()
        returned.extend(result.data or [])
        report[f"{table}_written"] += len(batch)
    return returned


def main() -> None:
    load_project_env()
    parser = argparse.ArgumentParser(description="Migrate Type News Firebase backups to Supabase.")
    parser.add_argument("--auth-export", type=Path, required=True)
    parser.add_argument("--users-dir", type=Path, required=True)
    parser.add_argument("--suspicious-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", type=Path, default=Path("migration-report.json"))
    args = parser.parse_args()

    if args.batch_size < 1 or args.batch_size > 1000:
        parser.error("--batch-size는 1~1000이어야 합니다.")
    for path in (args.auth_export, args.users_dir, args.suspicious_dir):
        if not path.exists():
            parser.error(f"입력 경로를 찾을 수 없습니다: {path}")

    auth_users = load_auth_users(args.auth_export)
    report: Counter = Counter(auth_users=len(auth_users))
    client: Client | None = None
    if not args.dry_run:
        url = os.environ.get("SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not service_key:
            parser.error("SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.")
        client = create_client(url, service_key)

    profile_result = upsert(
        client,
        "profiles",
        profile_rows(args.users_dir, auth_users),
        "firebase_uid",
        args.dry_run,
        report,
        args.batch_size,
    )
    profile_ids = {
        row["firebase_uid"]: row["id"]
        for row in profile_result
        if row.get("firebase_uid") and row.get("id")
    }
    if args.dry_run:
        profile_ids = {row["firebase_uid"]: "dry-run" for row in profile_rows(args.users_dir, auth_users)}

    upsert(
        client,
        "monthly_stats",
        monthly_stat_rows(args.users_dir, profile_ids),
        "source_path",
        args.dry_run,
        report,
        args.batch_size,
    )
    upsert(
        client,
        "suspicious_records",
        suspicious_record_rows(args.suspicious_dir, profile_ids),
        "source_path",
        args.dry_run,
        report,
        args.batch_size,
    )

    report_data = {
        "dry_run": args.dry_run,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "counts": dict(report),
    }
    args.report.write_text(json.dumps(report_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report_data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
