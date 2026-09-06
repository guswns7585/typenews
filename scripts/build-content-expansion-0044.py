"""Build the large, reproducible TypeNews sentence expansion migration.

The script reads the current development database to avoid collisions, selects
typing-friendly sentences from public-domain works, and fills word pools from
wordfreq. It only writes local artifacts; database application is a separate
step.
"""

from __future__ import annotations

import json
import os
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from kiwipiepy import Kiwi
from wordfreq import top_n_list


ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PATH = ROOT / "supabase" / "migrations" / "0044_large_typing_library.sql"
SOURCES_PATH = ROOT / "docs" / "CONTENT-SOURCES.md"
CACHE_PATH = ROOT / "backups" / "content-source-cache"
MANIFEST_PATH = ROOT / "backups" / "content-expansion-0044.json"
TARGETS = {"short": 800, "long": 500, "word": 1000}
RNG = random.Random(20260801)
KIWI = Kiwi()


@dataclass(frozen=True)
class Source:
    language: str
    title: str
    author: str
    author_died: int
    url: str
    kind: str


KOREAN_SOURCES = [
    Source("kor", "운수 좋은 날", "현진건", 1943, "https://ko.wikisource.org/wiki/운수_좋은_날", "wikisource"),
    Source("kor", "빈처", "현진건", 1943, "https://ko.wikisource.org/wiki/빈처", "wikisource"),
    Source("kor", "술 권하는 사회", "현진건", 1943, "https://ko.wikisource.org/wiki/술_권하는_사회", "wikisource"),
    Source("kor", "B사감과 러브레터", "현진건", 1943, "https://ko.wikisource.org/wiki/B사감과_러브레터", "wikisource"),
    Source("kor", "동백꽃 (김유정)", "김유정", 1937, "https://ko.wikisource.org/wiki/동백꽃_(김유정)", "wikisource"),
    Source("kor", "봄봄", "김유정", 1937, "https://ko.wikisource.org/wiki/봄봄", "wikisource"),
    Source("kor", "두꺼비 (김유정)", "김유정", 1937, "https://ko.wikisource.org/wiki/두꺼비_(김유정)", "wikisource"),
    Source("kor", "금 따는 콩밭", "김유정", 1937, "https://ko.wikisource.org/wiki/금_따는_콩밭", "wikisource"),
    Source("kor", "날개", "이상", 1937, "https://ko.wikisource.org/wiki/날개", "wikisource"),
    Source("kor", "메밀꽃 필 무렵", "이효석", 1942, "https://ko.wikisource.org/wiki/메밀꽃_필_무렵", "wikisource"),
    Source("kor", "벙어리 삼룡이", "나도향", 1926, "https://ko.wikisource.org/wiki/벙어리_삼룡이", "wikisource"),
    Source("kor", "물레방아 (나도향)", "나도향", 1926, "https://ko.wikisource.org/wiki/물레방아_(나도향)", "wikisource"),
]

ENGLISH_SOURCES = [
    Source("eng", "Pride and Prejudice", "Jane Austen", 1817, "https://www.gutenberg.org/cache/epub/1342/pg1342.txt", "gutenberg"),
    Source("eng", "Anne of Green Gables", "Lucy Maud Montgomery", 1942, "https://www.gutenberg.org/cache/epub/45/pg45.txt", "gutenberg"),
    Source("eng", "The Secret Garden", "Frances Hodgson Burnett", 1924, "https://www.gutenberg.org/cache/epub/113/pg113.txt", "gutenberg"),
    Source("eng", "Alice's Adventures in Wonderland", "Lewis Carroll", 1898, "https://www.gutenberg.org/cache/epub/11/pg11.txt", "gutenberg"),
    Source("eng", "Little Women", "Louisa May Alcott", 1888, "https://www.gutenberg.org/cache/epub/514/pg514.txt", "gutenberg"),
    Source("eng", "Heidi", "Johanna Spyri", 1901, "https://www.gutenberg.org/cache/epub/1448/pg1448.txt", "gutenberg"),
    Source("eng", "The Wonderful Wizard of Oz", "L. Frank Baum", 1919, "https://www.gutenberg.org/cache/epub/55/pg55.txt", "gutenberg"),
    Source("eng", "Peter Pan", "J. M. Barrie", 1937, "https://www.gutenberg.org/cache/epub/16/pg16.txt", "gutenberg"),
    Source("eng", "The Wind in the Willows", "Kenneth Grahame", 1932, "https://www.gutenberg.org/cache/epub/289/pg289.txt", "gutenberg"),
]

ENGLISH_BLOCKLIST = {
    "nigger", "niggers", "negro", "negroes", "injun", "injuns", "savage",
    "savages", "damn", "damned", "hell", "whore", "bastard",
}
KOREAN_BLOCKLIST = {
    "왜놈", "쪽발이", "깜둥이", "병신", "미친", "창녀", "년놈", "계집",
    "이놈", "저놈", "그놈", "놈", "지랄", "독약", "망할",
}
ENGLISH_WORD_STOP = {
    "the", "and", "that", "this", "with", "from", "have", "were", "been",
    "they", "their", "there", "what", "when", "where", "which", "would",
    "could", "should", "into", "about", "your", "ours", "hers", "his", "you",
    "are", "was", "for", "not", "but", "can", "will", "had", "has", "did",
}
KOREAN_WORD_STOP = {
    "그리고", "그러나", "하지만", "그래서", "것이다", "있다", "없다", "합니다",
    "했다", "하는", "있는", "없는", "그는", "그녀", "나는", "우리는", "이것",
    "저것", "그것", "대한", "위한", "통해", "때문", "같은", "정도", "이후",
}


def load_env(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def request_text(url: str, headers: dict[str, str] | None = None) -> str:
    merged = {"User-Agent": "TypeNewsContentBuilder/1.0 (local development)"}
    if headers:
        merged.update(headers)
    request = urllib.request.Request(url, headers=merged)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 4:
                raise
            time.sleep(4 * (attempt + 1))
    raise RuntimeError(f"Unable to fetch {url}")


def fetch_existing() -> list[dict[str, str]]:
    env = load_env(ROOT / "frontend" / ".env.local")
    base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    rows: list[dict[str, str]] = []
    for start in range(0, 10000, 1000):
        url = f"{base}/rest/v1/sentences?select=language,mode,text&order=id&offset={start}&limit=1000"
        payload = json.loads(request_text(url, {"apikey": key, "Authorization": f"Bearer {key}"}))
        rows.extend(payload)
        if len(payload) < 1000:
            break
    return rows


def fetch_source(source: Source) -> str:
    CACHE_PATH.mkdir(parents=True, exist_ok=True)
    cache_name = re.sub(r"[^A-Za-z0-9가-힣_-]+", "-", f"{source.language}-{source.title}").strip("-")
    cache_file = CACHE_PATH / f"{cache_name}.txt"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8")

    if source.kind == "gutenberg":
        text = request_text(source.url)
        start = re.search(r"\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*", text, re.I)
        if start:
            text = text[start.end():]
        end = re.search(r"\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*", text, re.I)
        if end:
            text = text[:end.start()]
        cache_file.write_text(text, encoding="utf-8")
        return text

    title = urllib.parse.unquote(source.url.rsplit("/", 1)[-1]).replace("_", " ")
    params = urllib.parse.urlencode({
        "action": "query",
        "prop": "extracts",
        "explaintext": "1",
        "titles": title,
        "format": "json",
        "formatversion": "2",
        "redirects": "1",
    })
    payload = json.loads(request_text(f"https://ko.wikisource.org/w/api.php?{params}"))
    page = payload["query"]["pages"][0]
    if page.get("missing") or not page.get("extract"):
        return ""
    text = page["extract"]
    cache_file.write_text(text, encoding="utf-8")
    time.sleep(1.5)
    return text


def normalize_text(text: str) -> str:
    text = text.replace("\ufeff", " ").replace("\u200b", " ")
    text = re.sub(r"(?m)^[ \t]*(?:CHAPTER[ \t]+)?[A-Z][A-Z0-9 '\-]{2,80}[ \t]*$", " ", text)
    text = re.sub(r"={2,}[^=]+={2,}", " ", text)
    text = re.sub(r"\[[^\]]{0,120}\]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def split_sentences(text: str, language: str) -> list[str]:
    text = normalize_text(text)
    if language == "eng":
        text = re.sub(
            r"\b(Mr|Mrs|Ms|Dr|St|etc|e\.g|i\.e)\.",
            lambda match: match.group(0).replace(".", "\ue000"),
            text,
            flags=re.I,
        )
    parts = re.split(r"(?<=[.!?])(?:[\"'’”)]*)\s+", text)
    cleaned: list[str] = []
    for part in parts:
        part = part.replace("\ue000", ".")
        value = part.strip(" \t\r\n\"'‘’“”()[]")
        value = re.sub(r"\s+", " ", value)
        if not value or value[-1:] not in ".!?":
            continue
        if any(mark in value for mark in ('"', "‘", "“", "”", "...", "---")):
            continue
        if re.search(r"\b(?:chapter|contents)\b", value, re.I):
            continue
        if language == "kor":
            compact = re.sub(r"\s+", "", value)
            if any(term in compact for term in KOREAN_BLOCKLIST):
                continue
            hangul = len(re.findall(r"[가-힣]", value))
            if hangul < 8 or hangul / max(1, len(value)) < 0.45:
                continue
            if re.search(r"[^가-힣A-Za-z0-9\s.,!?;:'‘’“”()\-—]", value):
                continue
        else:
            words = re.findall(r"[A-Za-z]+", value.lower())
            if len(words) < 4 or ENGLISH_BLOCKLIST.intersection(words):
                continue
            if not re.match(r"^[A-Z]", value):
                continue
            if re.search(r"[^A-Za-z0-9\s.,!?;:'‘’“”()\-—]", value):
                continue
        cleaned.append(value)
    return cleaned


def candidate_mode(text: str, language: str) -> str | None:
    length = len(text)
    if language == "kor":
        if 12 <= length <= 45:
            return "short"
        if 85 <= length <= 160:
            return "long"
    else:
        if 18 <= length <= 95:
            return "short"
        if 148 <= length <= 220:
            return "long"
    return None


def combine_long_passages(sentences: list[str], language: str) -> list[str]:
    minimum, maximum = (85, 160) if language == "kor" else (148, 220)
    passages: list[str] = []
    buffer: list[str] = []
    for sentence in sentences:
        candidate = " ".join([*buffer, sentence])
        if len(candidate) > maximum:
            if len(" ".join(buffer)) >= minimum:
                passages.append(" ".join(buffer))
                buffer = [sentence]
            else:
                buffer = []
            continue
        buffer.append(sentence)
        if len(candidate) >= minimum:
            passages.append(candidate)
            buffer = []
    if len(" ".join(buffer)) >= minimum:
        passages.append(" ".join(buffer))
    return passages


def normalized_key(language: str, mode: str, text: str) -> str:
    normalized = re.sub(r"\s+", " ", text.strip()).casefold()
    return f"{language}|{mode}|{normalized}"


def select_literature(existing_keys: set[str], language: str, needed: dict[str, int]) -> tuple[list[dict[str, str]], list[Source]]:
    sources = KOREAN_SOURCES if language == "kor" else ENGLISH_SOURCES
    buckets: dict[str, list[list[dict[str, str]]]] = {"short": [], "long": []}
    used_sources: list[Source] = []

    for source in sources:
        raw = fetch_source(source)
        if not raw:
            continue
        used_sources.append(source)
        per_source = {"short": [], "long": []}
        sentences: list[str] = []
        passages: list[str] = []
        paragraph_pattern = r"\n{4,}" if source.kind == "gutenberg" else r"\n\s*\n"
        for paragraph in re.split(paragraph_pattern, raw):
            paragraph_sentences = split_sentences(paragraph, language)
            sentences.extend(paragraph_sentences)
            passages.extend(combine_long_passages(paragraph_sentences, language))
        candidates = [*sentences, *passages]
        for text in candidates:
            mode = candidate_mode(text, language)
            if not mode:
                continue
            key = normalized_key(language, mode, text)
            if key in existing_keys:
                continue
            per_source[mode].append({
                "language": language,
                "mode": mode,
                "text": text,
                "source_title": source.title,
                "source_author": source.author,
                "source_url": source.url,
            })
        for mode in ("short", "long"):
            RNG.shuffle(per_source[mode])
            buckets[mode].append(per_source[mode])

    selected: list[dict[str, str]] = []
    for mode in ("short", "long"):
        target = needed[mode]
        lists = buckets[mode]
        cursor = 0
        while len([row for row in selected if row["language"] == language and row["mode"] == mode]) < target:
            progressed = False
            for values in lists:
                if cursor < len(values):
                    row = values[cursor]
                    key = normalized_key(language, mode, row["text"])
                    if key not in existing_keys:
                        existing_keys.add(key)
                        selected.append(row)
                        progressed = True
                        if len([item for item in selected if item["language"] == language and item["mode"] == mode]) >= target:
                            break
            if not progressed:
                break
            cursor += 1
        actual = len([row for row in selected if row["language"] == language and row["mode"] == mode])
        if actual < target:
            raise RuntimeError(f"Not enough {language}/{mode} literature candidates: {actual}/{target}")
    return selected, used_sources


def select_words(existing_keys: set[str], language: str, count: int) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    stop = KOREAN_WORD_STOP if language == "kor" else ENGLISH_WORD_STOP
    for raw in top_n_list(language, 30000):
        word = raw.strip().lower() if language == "eng" else raw.strip()
        if word in stop:
            continue
        if language == "kor":
            if not re.fullmatch(r"[가-힣]{2,5}", word):
                continue
            tokens = [token for token in KIWI.tokenize(word) if token.tag != "SP"]
            if len(tokens) != 1 or tokens[0].tag not in {"NNG", "NNP"}:
                continue
        else:
            if not re.fullmatch(r"[a-z]{3,13}", word):
                continue
        key = normalized_key(language, "word", word)
        if key in existing_keys:
            continue
        existing_keys.add(key)
        result.append({
            "language": language,
            "mode": "word",
            "text": word,
            "source_title": "",
            "source_author": "",
            "source_url": "",
        })
        if len(result) >= count:
            break
    if len(result) < count:
        raise RuntimeError(f"Not enough {language} words: {len(result)}/{count}")
    return result


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def write_migration(rows: list[dict[str, str]]) -> None:
    lines = [
        "-- Bring every language pool to short=800, long=500, word=1000.",
        "-- Literature rows come only from public-domain works by authors who died before 1963.",
        "-- Safe to rerun because sentences_unique_text_idx rejects trimmed duplicates.",
        "",
        "insert into public.sentences (language, mode, text, is_meme, enabled)",
        "values",
    ]
    for index, row in enumerate(rows):
        suffix = "," if index < len(rows) - 1 else ""
        lines.append(
            f"  ({sql_literal(row['language'])}, {sql_literal(row['mode'])}, "
            f"{sql_literal(row['text'])}, false, true){suffix}"
        )
    lines.extend(["on conflict do nothing;", "", "notify pgrst, 'reload schema';", ""])
    MIGRATION_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def write_sources(sources: list[Source], counts: dict[str, int]) -> None:
    unique = {(source.title, source.author): source for source in sources}
    lines = [
        "# TypeNews Content Sources",
        "",
        "The bulk sentence expansion uses original TypeNews sentences, individual common words,",
        "and excerpts from public-domain literary works. Modern film, television, animation,",
        "novel, and song-lyric excerpts are intentionally excluded.",
        "",
        "## Generated Counts",
        "",
    ]
    for key in sorted(counts):
        lines.append(f"- `{key}`: {counts[key]:,}")
    lines.extend(["", "## Public-Domain Works", ""])
    for source in sorted(unique.values(), key=lambda item: (item.language, item.author, item.title)):
        lines.append(
            f"- {source.title} — {source.author} (d. {source.author_died}), "
            f"source: {source.url}"
        )
    lines.extend([
        "",
        "## Rights Notes",
        "",
        "- Korea Copyright Commission guidance states that economic copyright generally lasts",
        "  for the life of the author plus 70 years. The selected authors all died before 1963.",
        "- Project Gutenberg marks the selected English editions as public domain in the United",
        "  States. The authors also died more than 70 years ago, satisfying the Korean term.",
        "- Source headers, editorial notes, and Project Gutenberg license text are not imported.",
        "- Individual vocabulary words are selected by frequency and are not copied as definitions",
        "  or ordered dictionary entries.",
        "",
    ])
    SOURCES_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def main() -> None:
    existing = fetch_existing()
    counts: dict[str, int] = {}
    existing_keys: set[str] = set()
    for row in existing:
        key = f"{row['language']}_{row['mode']}"
        counts[key] = counts.get(key, 0) + 1
        existing_keys.add(normalized_key(row["language"], row["mode"], row["text"]))

    rows: list[dict[str, str]] = []
    used_sources: list[Source] = []
    for language in ("kor", "eng"):
        needed = {
            mode: max(0, TARGETS[mode] - counts.get(f"{language}_{mode}", 0))
            for mode in TARGETS
        }
        literature, sources = select_literature(existing_keys, language, needed)
        rows.extend(literature)
        used_sources.extend(sources)
        rows.extend(select_words(existing_keys, language, needed["word"]))

    expected = sum(
        max(0, TARGETS[mode] - counts.get(f"{language}_{mode}", 0))
        for language in ("kor", "eng")
        for mode in TARGETS
    )
    if len(rows) != expected:
        raise RuntimeError(f"Generated {len(rows)} rows, expected {expected}")

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_migration(rows)
    generated_counts: dict[str, int] = {}
    for row in rows:
        key = f"{row['language']}_{row['mode']}"
        generated_counts[key] = generated_counts.get(key, 0) + 1
    selected_sources = {
        (row["source_title"], row["source_author"])
        for row in rows
        if row["source_title"]
    }
    write_sources(
        [
            source
            for source in used_sources
            if (source.title, source.author) in selected_sources
        ],
        generated_counts,
    )
    print(json.dumps({
        "existing": counts,
        "generated": generated_counts,
        "total_generated": len(rows),
        "migration": str(MIGRATION_PATH),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
