from __future__ import annotations

import json
import re
import runpy
import unicodedata
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_SCRIPT = ROOT / "scripts" / "build-content-refresh-0045.py"
SOURCE_MANIFEST = ROOT / "backups" / "content-full-review-0048.json"
CORPUS_DIR = ROOT / "content" / "editorial" / "0049"
OUTPUT_MANIFEST = ROOT / "backups" / "content-editorial-0049.json"
REPORT_PATH = ROOT / "backups" / "content-editorial-0049-report.json"
MIGRATION_PATH = ROOT / "supabase" / "migrations" / "0049_editorial_sentence_review.sql"

CORPUS_FILES = {
    ("kor", "short"): CORPUS_DIR / "kor-short.txt",
    ("kor", "long"): CORPUS_DIR / "kor-long.txt",
    ("eng", "short"): CORPUS_DIR / "eng-short.txt",
    ("eng", "long"): CORPUS_DIR / "eng-long.txt",
}

EXPECTED_COUNTS = {
    ("kor", "short"): 318,
    ("kor", "long"): 329,
    ("eng", "short"): 649,
    ("eng", "long"): 424,
}

FORBIDDEN_BRIDGES = (
    "두 생각 모두",
    "두 방법은",
    "두 원칙은",
    "두 태도 모두",
    "두 장면을 잇는",
    "서로 다른 현상이지만 두 사례",
    "두 사례는",
    "대상과 규모는 다르지만",
    "Both ideas",
    "Both methods",
    "Both principles",
    "Both attitudes",
    "The two moments are connected",
    "Although the subjects differ, both examples",
    "Both examples show",
    "The subject and scale may change",
)


def compact(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text)).strip()


def identity(language: str, mode: str, text: str) -> tuple[str, str, str]:
    return language, mode, compact(text).casefold()


def split_sentences(text: str) -> list[str]:
    return [part.strip() for part in re.findall(r"[^.?!]+[.?!]", text) if part.strip()]


def valid_text(language: str, text: str) -> bool:
    if language == "kor":
        return all(0xAC00 <= ord(char) <= 0xD7A3 or char in " ,.?!" for char in text)
    return all(char.isascii() and (char.isalpha() or char in " ,.?!") for char in text)


def read_corpus(path: Path) -> list[str]:
    lines = [compact(line) for line in path.read_text(encoding="utf-8").splitlines()]
    return [line for line in lines if line and not line.startswith("#")]


def validate_entry(language: str, mode: str, text: str) -> list[str]:
    errors: list[str] = []
    sentences = split_sentences(text)
    if not valid_text(language, text):
        errors.append("contains a disallowed character")
    if not text.endswith((".", "?", "!")):
        errors.append("has no terminal punctuation")
    if "  " in text or ".." in text or ",," in text:
        errors.append("contains malformed spacing or punctuation")
    if any(bridge.casefold() in text.casefold() for bridge in FORBIDDEN_BRIDGES):
        errors.append("contains a retired mass production bridge")
    if mode == "short":
        if len(sentences) != 1:
            errors.append(f"must contain exactly one sentence, found {len(sentences)}")
        minimum, maximum = (18, 92) if language == "kor" else (45, 180)
    else:
        if not 3 <= len(sentences) <= 5:
            errors.append(f"must contain three to five sentences, found {len(sentences)}")
        minimum, maximum = (90, 360) if language == "kor" else (190, 520)
        normalized_sentences = [compact(sentence).casefold() for sentence in sentences]
        if len(normalized_sentences) != len(set(normalized_sentences)):
            errors.append("repeats a sentence inside the paragraph")
    if not minimum <= len(text) <= maximum:
        errors.append(f"length {len(text)} is outside {minimum} to {maximum}")
    return errors


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def fetch_current_rows() -> list[dict[str, object]]:
    source = runpy.run_path(str(SOURCE_SCRIPT))
    return source["fetch_rows"]()


def main() -> None:
    reviewed_rows = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    source_counts = Counter((str(row["language"]), str(row["mode"])) for row in reviewed_rows)
    if source_counts != Counter(EXPECTED_COUNTS):
        raise RuntimeError(f"0048 source counts changed: {dict(source_counts)}")

    corpora: dict[tuple[str, str], list[str]] = {}
    for key, path in CORPUS_FILES.items():
        entries = read_corpus(path)
        if len(entries) != EXPECTED_COUNTS[key]:
            raise RuntimeError(f"{path.name} expected {EXPECTED_COUNTS[key]} entries but found {len(entries)}")
        corpora[key] = entries

    cursors: Counter[tuple[str, str]] = Counter()
    output: list[dict[str, object]] = []
    validation_errors: list[str] = []
    for row in reviewed_rows:
        key = str(row["language"]), str(row["mode"])
        text = corpora[key][cursors[key]]
        cursors[key] += 1
        errors = validate_entry(*key, text)
        if errors:
            validation_errors.append(f"id {row['id']}: {', '.join(errors)}")
        output.append(
            {
                "id": int(row["id"]),
                "language": key[0],
                "mode": key[1],
                "old_text": str(row["text"]),
                "text": text,
                "style": str(row.get("style", "editorial")),
            }
        )
    if validation_errors:
        raise RuntimeError("Editorial validation failed:\n" + "\n".join(validation_errors[:30]))

    identities = [identity(str(row["language"]), str(row["mode"]), str(row["text"])) for row in output]
    if len(identities) != len(set(identities)):
        duplicates = [item for item, count in Counter(identities).items() if count > 1]
        raise RuntimeError(f"Editorial corpus has duplicate entries: {duplicates[:5]}")

    all_sentences: list[tuple[str, str]] = []
    for row in output:
        for sentence in split_sentences(str(row["text"])):
            all_sentences.append((str(row["language"]), compact(sentence).casefold()))
    repeated_sentences = [item for item, count in Counter(all_sentences).items() if count > 1]
    if repeated_sentences:
        raise RuntimeError(f"Editorial corpus reuses complete sentences: {repeated_sentences[:5]}")

    target_ids = {int(row["id"]) for row in output}
    current_rows = fetch_current_rows()
    occupied = {
        identity(str(row["language"]), str(row["mode"]), str(row["text"]))
        for row in current_rows
        if int(row["id"]) not in target_ids
    }
    collisions = [item for item in identities if item in occupied]
    if collisions:
        raise RuntimeError(f"Editorial corpus collides with existing content: {collisions[:5]}")

    starts = Counter()
    for row in output:
        text = str(row["text"])
        if row["language"] == "kor":
            prefix = text[:10]
        else:
            prefix = " ".join(text.casefold().split()[:4])
        starts[(str(row["language"]), str(row["mode"]), prefix)] += 1
    repeated_starts = {"|".join(key): count for key, count in starts.items() if count > 2}
    if repeated_starts:
        raise RuntimeError(f"Editorial corpus repeats opening phrases: {list(repeated_starts.items())[:10]}")

    OUTPUT_MANIFEST.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "reviewed": len(output),
        "counts": {"|".join(key): value for key, value in sorted(source_counts.items())},
        "changed": sum(str(row["old_text"]) != str(row["text"]) for row in output),
        "unique_entries": len(set(identities)),
        "unique_sentences": len(set(all_sentences)),
        "invalid_entries": 0,
        "repeated_openings_over_two": 0,
        "retired_bridge_matches": 0,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "-- Apply the item by item editorial review of every generated Korean and English short and long entry.",
        "begin;",
        "",
        "create temporary table typenews_editorial_0049 (",
        "  id bigint primary key,",
        "  language text not null,",
        "  mode text not null,",
        "  old_text text not null,",
        "  new_text text not null",
        ") on commit drop;",
        "",
        "insert into typenews_editorial_0049 (id, language, mode, old_text, new_text)",
        "values",
    ]
    for index, row in enumerate(output):
        suffix = "," if index < len(output) - 1 else ";"
        lines.append(
            f"    ({row['id']}, {sql_literal(str(row['language']))}, {sql_literal(str(row['mode']))}, "
            f"{sql_literal(str(row['old_text']))}, {sql_literal(str(row['text']))}){suffix}"
        )
    lines.extend(
        [
            "",
            "do $editorial_check$",
            "declare",
            "  expected_count integer;",
            "  matched_count integer;",
            "begin",
            "  select count(*) into expected_count from typenews_editorial_0049;",
            "  select count(*) into matched_count",
            "  from public.sentences sentence",
            "  join typenews_editorial_0049 replacement on replacement.id = sentence.id",
            "  where sentence.language = replacement.language",
            "    and sentence.mode = replacement.mode",
            "    and sentence.text in (replacement.old_text, replacement.new_text);",
            "  if matched_count <> expected_count then",
            "    raise exception '0049 expected % matching rows but found %', expected_count, matched_count;",
            "  end if;",
            "end",
            "$editorial_check$;",
            "",
            "update public.sentences sentence",
            "set text = 'typenews editorial repair ' || sentence.id::text",
            "from typenews_editorial_0049 replacement",
            "where sentence.id = replacement.id",
            "  and sentence.text = replacement.old_text",
            "  and replacement.old_text <> replacement.new_text;",
            "",
            "update public.sentences sentence",
            "set text = replacement.new_text",
            "from typenews_editorial_0049 replacement",
            "where sentence.id = replacement.id",
            "  and sentence.text = 'typenews editorial repair ' || sentence.id::text;",
            "",
            "commit;",
            "",
        ]
    )
    MIGRATION_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
