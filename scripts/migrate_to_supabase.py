"""Import Type News Firebase backup JSON/JSONL files into the Supabase dev schema.

The script never talks to Firebase. It only reads local backup files and writes to
the Supabase project named by SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

Default mode is a dry run. Pass --apply to write rows.
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator


ADMIN_FIREBASE_UID = "9ZOc8fAzPZhZLPbom5g8jSMRdfb2"


def load_env_files(paths: Iterable[Path]) -> None:
    for path in paths:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def json_lines(path: Path) -> Iterator[dict[str, Any]]:
    with path.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number} is not valid JSONL") from error
            if isinstance(value, dict):
                yield value


def json_lines_from_files(directory: Path, patterns: Iterable[str]) -> Iterator[dict[str, Any]]:
    files: list[Path] = []
    for pattern in patterns:
        files.extend(sorted(directory.glob(pattern)))
    seen: set[Path] = set()
    unique_files = [path for path in files if not (path in seen or seen.add(path))]
    if not unique_files:
        return
    for path in unique_files:
        yield from json_lines(path)


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


def parse_source_timestamp(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict) and isinstance(value.get("seconds"), int):
        return datetime.fromtimestamp(value["seconds"], tz=timezone.utc).isoformat()
    return None


def google_sub(user: dict[str, Any]) -> str | None:
    for identity in user.get("providerUserInfo", []):
        if identity.get("providerId") == "google.com":
            return identity.get("rawId")
    return None


def load_auth_users(path: Path | None) -> dict[str, dict[str, Any]]:
    if not path:
        return {}
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    users = payload.get("users")
    if not isinstance(users, list):
        raise ValueError("Firebase Auth export must contain a users array.")
    return {user["localId"]: user for user in users if user.get("localId")}


def user_document_records(firestore_dir: Path) -> Iterator[dict[str, Any]]:
    for record in json_lines_from_files(firestore_dir, ["users-*.jsonl"]):
        path_parts = str(record.get("path", "")).split("/")
        if len(path_parts) == 2 and path_parts[0] == "users":
            yield record


def profile_rows(firestore_dir: Path, auth_users: dict[str, dict[str, Any]]) -> Iterator[dict[str, Any]]:
    for record in user_document_records(firestore_dir):
        firebase_uid = record["path"].split("/")[1]
        source = record.get("data") or {}
        auth_user = auth_users.get(firebase_uid, {})
        display_name = source.get("displayName") or auth_user.get("displayName") or auth_user.get("email")
        yield {
            "firebase_uid": firebase_uid,
            "google_sub": google_sub(auth_user),
            "email": source.get("email") or auth_user.get("email"),
            "display_name": display_name,
            "display_name_lower": source.get("displayNameLower") or (display_name.lower() if isinstance(display_name, str) else None),
            "max_cpm": int(source.get("maxCPM") or 0),
            "total_typing_count": int(source.get("totalTypingCount") or 0),
            "preferences": source.get("preferences") or {},
            "role": "admin" if firebase_uid == ADMIN_FIREBASE_UID else "user",
            "firebase_created_at": parse_epoch_millis(auth_user.get("createdAt")),
            "firebase_last_sign_in_at": parse_epoch_millis(auth_user.get("lastSignedInAt")),
        }


def monthly_stat_rows(firestore_dir: Path, profile_ids: dict[str, str]) -> Iterator[dict[str, Any]]:
    for record in json_lines_from_files(firestore_dir, ["users-*.jsonl"]):
        path_parts = str(record.get("path", "")).split("/")
        if len(path_parts) != 4 or path_parts[0] != "users" or path_parts[2] != "monthlyStats":
            continue
        firebase_uid, month_id = path_parts[1], path_parts[3]
        profile_id = profile_ids.get(firebase_uid)
        if not profile_id:
            continue
        source = record.get("data") or {}
        yield {
            "profile_id": profile_id,
            "month_id": month_id,
            # Firestore의 typingCount는 "완료한 문장 수"였다. 0006에서 점수 기준이
            # 타수로 바뀌면서 컬럼명이 score가 되었다. 과거 달의 기록은 옛 기준
            # 그대로 보존되고, 새 기준은 커트오버 이후 달부터 적용된다.
            "score": int(source.get("typingCount") or 0),
            "nickname": source.get("nickname"),
            "updated_at_source": parse_source_timestamp(source.get("updatedAt")),
        }


def suspicious_record_rows(firestore_dir: Path, suspicious_dir: Path | None, profile_ids: dict[str, str]) -> Iterator[dict[str, Any]]:
    directories = [firestore_dir]
    if suspicious_dir and suspicious_dir != firestore_dir:
        directories.append(suspicious_dir)

    for directory in directories:
        for record in json_lines_from_files(directory, ["suspiciousRecords-*.jsonl", "suspicious-records-*.jsonl"]):
            path = str(record.get("path", ""))
            source = record.get("data") or {}
            path_parts = path.split("/")
            firebase_uid = record.get("firebase_uid")
            if not firebase_uid and len(path_parts) >= 2 and path_parts[0] == "suspiciousRecords":
                firebase_uid = path_parts[1]
            if not firebase_uid:
                continue
            yield {
                "profile_id": profile_ids.get(firebase_uid),
                "firebase_uid": firebase_uid,
                "record_id": record.get("document_id"),
                "source_path": path,
                "recorded_at": parse_source_timestamp(source.get("timestamp")),
                "record_data": source,
            }


def upsert(
    client: Any | None,
    table: str,
    rows: Iterator[dict[str, Any]],
    conflict: str,
    apply: bool,
    report: Counter,
    batch_size: int,
) -> list[dict[str, Any]]:
    returned: list[dict[str, Any]] = []
    for batch in batched(rows, batch_size):
        report[f"{table}_source"] += len(batch)
        if not apply:
            continue
        result = client.table(table).upsert(batch, on_conflict=conflict).execute()  # type: ignore[union-attr]
        returned.extend(result.data or [])
        report[f"{table}_written"] += len(batch)
    return returned


def build_profile_id_map(client: Any | None, apply: bool, profile_result: list[dict[str, Any]], firestore_dir: Path, auth_users: dict[str, dict[str, Any]]) -> dict[str, str]:
    if not apply:
        return {row["firebase_uid"]: f"dry-run-{row['firebase_uid']}" for row in profile_rows(firestore_dir, auth_users)}

    profile_ids = {
        row["firebase_uid"]: row["id"]
        for row in profile_result
        if row.get("firebase_uid") and row.get("id")
    }
    if profile_ids:
        return profile_ids

    result = client.table("profiles").select("id,firebase_uid").execute()  # type: ignore[union-attr]
    return {
        row["firebase_uid"]: row["id"]
        for row in result.data or []
        if row.get("firebase_uid") and row.get("id")
    }


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    load_env_files([
        repo_root / ".env",
        repo_root / ".env.local",
        repo_root / "frontend" / ".env",
        repo_root / "frontend" / ".env.local",
    ])

    parser = argparse.ArgumentParser(description="Migrate local Type News Firebase backups to Supabase.")
    parser.add_argument("--firestore-dir", type=Path, required=True, help="Directory containing users-*.jsonl from backup_firestore.py.")
    parser.add_argument("--auth-export", type=Path, help="Optional Firebase Auth JSON export. Needed to link historical Google sub values.")
    parser.add_argument("--suspicious-dir", type=Path, help="Optional directory containing suspicious-records-*.jsonl.")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--apply", action="store_true", help="Write to Supabase. Omit for dry-run validation.")
    parser.add_argument("--report", type=Path, default=Path("migration-report.json"))
    args = parser.parse_args()

    if args.batch_size < 1 or args.batch_size > 1000:
        parser.error("--batch-size must be between 1 and 1000.")
    if not args.firestore_dir.is_dir():
        parser.error(f"Firestore backup directory not found: {args.firestore_dir}")
    if args.auth_export and not args.auth_export.is_file():
        parser.error(f"Firebase Auth export not found: {args.auth_export}")
    if args.suspicious_dir and not args.suspicious_dir.is_dir():
        parser.error(f"Suspicious backup directory not found: {args.suspicious_dir}")

    auth_users = load_auth_users(args.auth_export)
    report: Counter = Counter(auth_users=len(auth_users))

    client: Any | None = None
    if args.apply:
        try:
            from supabase import create_client
        except ModuleNotFoundError as error:
            parser.error("The supabase Python package is required for --apply. Run: python -m pip install -r scripts\\requirements.txt")
            raise error
        url = os.environ.get("SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not service_key:
            parser.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply. Store them in .env.local or the shell, not Git.")
        client = create_client(url, service_key)

    profile_result = upsert(
        client,
        "profiles",
        profile_rows(args.firestore_dir, auth_users),
        "firebase_uid",
        args.apply,
        report,
        args.batch_size,
    )
    profile_ids = build_profile_id_map(client, args.apply, profile_result, args.firestore_dir, auth_users)
    report["profiles_mapped"] = len(profile_ids)

    upsert(
        client,
        "monthly_stats",
        monthly_stat_rows(args.firestore_dir, profile_ids),
        "profile_id,month_id",
        args.apply,
        report,
        args.batch_size,
    )
    upsert(
        client,
        "suspicious_records",
        suspicious_record_rows(args.firestore_dir, args.suspicious_dir, profile_ids),
        "source_path",
        args.apply,
        report,
        args.batch_size,
    )

    report_data = {
        "applied": args.apply,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "firestore_dir": str(args.firestore_dir),
        "auth_export_used": bool(args.auth_export),
        "suspicious_dir": str(args.suspicious_dir) if args.suspicious_dir else None,
        "counts": dict(report),
    }
    args.report.write_text(json.dumps(report_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report_data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
