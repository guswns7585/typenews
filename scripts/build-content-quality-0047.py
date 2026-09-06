"""Replace context-mismatched 0045 content with topic-coherent original prose."""

from __future__ import annotations

import json
import re
import runpy
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_SCRIPT = ROOT / "scripts" / "build-content-refresh-0045.py"
SOURCE_MANIFEST = ROOT / "backups" / "content-refresh-0045.json"
OUTPUT_MANIFEST = ROOT / "backups" / "content-quality-0047.json"
REPORT_PATH = ROOT / "backups" / "content-quality-0047-report.json"
MIGRATION_PATH = ROOT / "supabase" / "migrations" / "0047_repair_sentence_context.sql"
KOR_INTROS = {
    "motivation": [
        "변화는 거창한 결심보다 반복할 수 있는 행동에서 시작된다.",
        "목표를 향해 가는 동안에는 속도보다 방향을 지키는 힘이 중요하다.",
        "뜻대로 되지 않는 날에도 다시 움직일 이유는 남아 있다.",
        "성장은 눈에 띄는 순간보다 포기하지 않은 시간 속에서 쌓인다.",
    ],
    "practical": [
        "복잡한 하루는 해야 할 일을 작고 분명하게 나눌 때 정리되기 시작한다.",
        "좋은 생활 방식은 의지보다 다시 반복할 수 있는 구조에 가깝다.",
        "마음의 부담을 줄이려면 막연한 걱정을 구체적인 행동으로 바꾸어야 한다.",
        "사소한 정리 습관 하나가 하루 전체의 흐름을 예상보다 크게 바꾸기도 한다.",
    ],
    "work": [
        "함께 일할수록 결과만큼 과정과 판단을 투명하게 공유하는 태도가 중요하다.",
        "업무의 속도는 서두르는 데서가 아니라 기준과 다음 행동을 분명히 하는 데서 나온다.",
        "문제가 커지기 전에 작은 이상을 알리는 문화가 팀을 더 안전하게 만든다.",
        "좋은 협업은 각자의 역할과 완료 조건을 같은 언어로 이해하는 데서 시작된다.",
    ],
    "humor": [
        "평범한 하루에는 계획대로 되지 않아서 오히려 웃게 되는 순간이 많다.",
        "사람의 결심은 단단하지만 알람과 냉장고와 간식도 만만한 상대는 아니다.",
        "생활 속 작은 실수는 지나고 보면 가장 오래 이야기되는 장면이 되곤 한다.",
        "부지런해지려던 계획이 엉뚱한 방향으로 자라는 날도 가끔은 필요하다.",
    ],
    "cinematic": [
        "막다른 상황에 닿을수록 무엇을 지키고 싶은지는 오히려 선명해진다.",
        "이야기의 끝처럼 보이는 순간에도 인물에게는 다음 선택이 남아 있다.",
        "두려움이 가장 커진 장면에서 한 걸음 내딛는 선택이 흐름을 바꾸기도 한다.",
        "모든 길이 사라진 듯한 밤에도 작은 불빛 하나는 방향이 되어 준다.",
    ],
    "science": [
        "서로 다른 자연 현상을 함께 살펴보면 세상을 이해하는 질문도 넓어진다.",
        "익숙한 풍경 속에도 자세히 들여다봐야 알 수 있는 과학의 원리가 숨어 있다.",
        "자연은 눈에 보이는 모습보다 훨씬 복잡한 연결을 통해 움직인다.",
        "작은 생물의 행동과 먼 우주의 변화는 모두 관찰에서 시작된 질문에 답한다.",
    ],
    "learning": [
        "배움은 많은 내용을 한꺼번에 담는 일보다 이해의 빈틈을 찾아 메우는 과정에 가깝다.",
        "새로운 지식은 읽는 데서 끝나지 않고 설명하고 떠올릴 때 자기 것이 된다.",
        "모르는 부분을 정확히 발견하면 공부의 다음 순서도 자연스럽게 보인다.",
        "꾸준한 복습과 솔직한 질문은 재능보다 오래 믿을 수 있는 학습 도구다.",
    ],
    "relationship": [
        "관계는 큰 약속보다 자주 건네는 관심과 정확히 듣는 태도로 유지된다.",
        "가까운 사이일수록 고마움과 서운함을 늦지 않게 표현하는 일이 중요하다.",
        "서로를 이해한다는 것은 같은 생각을 갖는 일보다 다른 마음을 끝까지 듣는 일에 가깝다.",
        "진심은 화려한 말보다 약속을 지키고 곁을 내어 주는 행동에서 잘 드러난다.",
    ],
}


ENG_INTROS = {
    "motivation": [
        "Lasting change usually begins with an action small enough to repeat.",
        "Progress depends less on speed than on keeping a useful direction.",
        "Even a difficult day can leave one good reason to begin again.",
        "Growth often gathers quietly during the time when giving up would be easier.",
    ],
    "practical": [
        "A complicated day becomes clearer when vague pressure turns into specific actions.",
        "A useful routine depends more on a repeatable structure than on perfect discipline.",
        "Small decisions about time and attention can change the shape of an entire day.",
        "Practical habits work best when they reduce the number of choices we must make.",
    ],
    "work": [
        "Clear standards and visible next steps allow a team to move without needless confusion.",
        "Reliable collaboration depends on sharing judgment as openly as the final result.",
        "A small warning given early can protect a team from a much larger problem later.",
        "Good work becomes easier when everyone understands the role and the definition of done.",
    ],
    "humor": [
        "Ordinary plans often become memorable because they fail in harmless and amusing ways.",
        "Human determination is impressive, but alarms, snacks, and refrigerators remain worthy rivals.",
        "A minor mistake can become the funniest story once enough time has passed.",
        "Some productive plans take an unexpected route before they reach anything useful.",
    ],
    "cinematic": [
        "A character often discovers what matters most when every easy path disappears.",
        "A scene that looks like an ending can still leave room for one decisive choice.",
        "The direction of a story can change when someone moves before the fear is gone.",
        "Even when the road disappears, one remaining light can still become a direction.",
    ],
    "science": [
        "Different natural events become more meaningful when we examine the connections between them.",
        "Familiar landscapes contain scientific processes that careful observation can reveal.",
        "Nature depends on networks and exchanges that are often invisible at first glance.",
        "Questions about tiny animals and distant space both begin with patient observation.",
    ],
    "learning": [
        "Learning is less about collecting facts than about finding and repairing gaps in understanding.",
        "New knowledge becomes useful when we explain it, recall it, and test it in another setting.",
        "Once the unclear part is named precisely, the next step in studying becomes easier to see.",
        "Regular review and honest questions are more dependable than a single burst of effort.",
    ],
    "relationship": [
        "Relationships are sustained by regular attention and the patience to listen accurately.",
        "Gratitude and disappointment are both easier to handle when they are expressed before they grow.",
        "Understanding another person does not require agreement, but it does require careful listening.",
        "Sincerity is often clearer in a kept promise than in an impressive declaration.",
    ],
}


KOR_CALM_INTROS = [
    "평범한 풍경은 마음의 속도를 바꾸는 작은 계기가 되기도 한다.",
    "조용한 장면을 오래 바라보면 지나치던 감정이 비로소 모습을 드러낸다.",
    "바쁜 하루에도 주변을 천천히 바라볼 수 있는 순간은 찾아온다.",
    "익숙한 공간은 빛과 소리의 작은 변화만으로도 새로운 표정을 보여 준다.",
]


ENG_CALM_INTROS = [
    "An ordinary view can quietly change the pace of the mind.",
    "A quiet scene can reveal feelings that a busy day keeps hidden.",
    "Even a crowded day contains a moment when the surroundings become clear.",
    "Familiar places can feel new when light and sound begin to change.",
]


def compact(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def key(language: str, mode: str, text: str) -> tuple[str, str, str]:
    return language, mode, compact(text).casefold()


def valid_text(language: str, mode: str, text: str) -> bool:
    if language == "kor":
        normal = lambda char: 0xAC00 <= ord(char) <= 0xD7A3 or char in " ,.?!"
        word = lambda char: 0xAC00 <= ord(char) <= 0xD7A3
    else:
        normal = lambda char: char.isascii() and (char.isalpha() or char in " ,.?!")
        word = lambda char: char.isascii() and char.isalpha()
    return all((word if mode == "word" else normal)(char) for char in text)


def is_context_generated_short(row: dict[str, object], style_seeds: dict[str, list[str]]) -> bool:
    if row.get("mode") != "short" or row.get("style") in {"calm", "everyday", "reflection"}:
        return False
    direct = {compact(seed).casefold() for values in style_seeds.values() for seed in values}
    return compact(str(row["text"])).casefold() not in direct


def short_candidates(language: str, source: dict[str, object]) -> list[dict[str, str]]:
    subjects = source["KOR_SHORT_SUBJECTS" if language == "kor" else "ENG_SHORT_SUBJECTS"]
    endings = source["KOR_SHORT_ENDINGS" if language == "kor" else "ENG_SHORT_ENDINGS"]
    scenes = source["KOR_SCENES" if language == "kor" else "ENG_SCENES"]
    reflections = source["KOR_REFLECTIONS" if language == "kor" else "ENG_REFLECTIONS"]
    closings = source["KOR_CLOSINGS" if language == "kor" else "ENG_CLOSINGS"]
    styles = source["KOR_STYLE_SEEDS" if language == "kor" else "ENG_STYLE_SEEDS"]

    candidates: list[dict[str, str]] = []
    # Each subject is already a complete semantic noun phrase. Rotate only predicates
    # that are broad enough to fit every subject instead of crossing moments and sights.
    safe_ending_indexes = [0, 1, 2, 3, 4, 8, 9, 16] if language == "kor" else [0, 1, 2, 3, 5, 7, 8, 16]
    for round_index, ending_index in enumerate(safe_ending_indexes):
        for subject_index, subject in enumerate(subjects):
            ending = endings[(ending_index + subject_index + round_index) % len(endings)]
            candidates.append({"style": "calm", "text": f"{subject} {ending}."})
    for style, values in styles.items():
        candidates.extend({"style": style, "text": text} for text in values)
    candidates.extend({"style": "everyday", "text": text} for text in scenes)
    candidates.extend({"style": "reflection", "text": text} for text in reflections)
    candidates.extend({"style": "motivation", "text": text} for text in closings)
    return candidates


def long_candidates(language: str, source: dict[str, object]) -> list[dict[str, str]]:
    styles = source["KOR_STYLE_SEEDS" if language == "kor" else "ENG_STYLE_SEEDS"]
    intros = KOR_INTROS if language == "kor" else ENG_INTROS
    buckets: dict[str, list[dict[str, str]]] = {}
    for style, seeds in styles.items():
        values: list[dict[str, str]] = []
        index = 0
        for offset in range(1, len(seeds)):
            for first_index, first in enumerate(seeds):
                second = seeds[(first_index + offset) % len(seeds)]
                intro = intros[style][index % len(intros[style])]
                values.append({"style": style, "text": f"{first} {intro} {second}"})
                index += 1
        buckets[style] = values

    # Calm paragraphs use complete sentences rather than spliced clauses.
    scenes = source["KOR_SCENES" if language == "kor" else "ENG_SCENES"]
    reflections = source["KOR_REFLECTIONS" if language == "kor" else "ENG_REFLECTIONS"]
    closings = source["KOR_CLOSINGS" if language == "kor" else "ENG_CLOSINGS"]
    calm: list[dict[str, str]] = []
    calm_intros = KOR_CALM_INTROS if language == "kor" else ENG_CALM_INTROS
    for intro_index, intro in enumerate(calm_intros):
        for index, scene in enumerate(scenes):
            reflection = reflections[(index * 7 + intro_index * 3) % len(reflections)]
            closing = closings[(index * 11 + intro_index * 5) % len(closings)]
            calm.append({"style": "calm", "text": f"{scene} {intro} {reflection} {closing}"})
    buckets["calm"] = calm

    output: list[dict[str, str]] = []
    names = list(buckets)
    cursor = 0
    while any(buckets.values()):
        name = names[cursor % len(names)]
        cursor += 1
        if buckets[name]:
            output.append(buckets[name].pop(0))
    return output


def choose(
    candidates: list[dict[str, str]],
    count: int,
    language: str,
    mode: str,
    occupied: set[tuple[str, str, str]],
) -> list[dict[str, str]]:
    output: list[dict[str, str]] = []
    prefixes: Counter[str] = Counter()
    for candidate in candidates:
        text = compact(candidate["text"])
        length_ok = (12 <= len(text) <= 90) if language == "kor" and mode == "short" else True
        length_ok = length_ok and ((85 <= len(text) <= 320) if language == "kor" and mode == "long" else True)
        length_ok = length_ok and ((18 <= len(text) <= 150) if language == "eng" and mode == "short" else True)
        length_ok = length_ok and ((145 <= len(text) <= 420) if language == "eng" and mode == "long" else True)
        if mode == "long":
            prefix = text[:55].casefold() if language == "kor" else " ".join(text.casefold().split()[:13])
            prefix_limit = 5
        else:
            prefix = text[:18].casefold() if language == "kor" else " ".join(text.casefold().split()[:6])
            prefix_limit = 2
        item_key = key(language, mode, text)
        if not length_ok or not valid_text(language, mode, text) or item_key in occupied:
            continue
        if prefixes[prefix] >= prefix_limit:
            continue
        occupied.add(item_key)
        prefixes[prefix] += 1
        output.append({**candidate, "text": text})
        if len(output) == count:
            return output
    raise RuntimeError(f"Not enough {language}/{mode} candidates: {len(output)}/{count}")


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    source = runpy.run_path(str(SOURCE_SCRIPT))
    previous = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    style_sources = {"kor": source["KOR_STYLE_SEEDS"], "eng": source["ENG_STYLE_SEEDS"]}
    replacements = [
        row for row in previous
        if row["mode"] == "long" or is_context_generated_short(row, style_sources[str(row["language"])])
    ]
    replacement_ids = {int(row["id"]) for row in replacements}

    current_rows = source["fetch_rows"]()
    occupied = {
        key(str(row["language"]), str(row["mode"]), str(row["text"]))
        for row in current_rows if int(row["id"]) not in replacement_ids
    }

    generated: dict[tuple[str, str], list[dict[str, str]]] = {}
    for language in ("kor", "eng"):
        for mode in ("short", "long"):
            needed = sum(1 for row in replacements if row["language"] == language and row["mode"] == mode)
            candidates = short_candidates(language, source) if mode == "short" else long_candidates(language, source)
            generated[(language, mode)] = choose(candidates, needed, language, mode, occupied)

    indexes: Counter[tuple[str, str]] = Counter()
    output: list[dict[str, object]] = []
    for row in replacements:
        pair = (str(row["language"]), str(row["mode"]))
        generated_row = generated[pair][indexes[pair]]
        indexes[pair] += 1
        output.append({
            "id": int(row["id"]),
            "language": pair[0],
            "mode": pair[1],
            "old_text": str(row["text"]),
            "text": generated_row["text"],
            "style": generated_row["style"],
        })

    keys = [key(str(row["language"]), str(row["mode"]), str(row["text"])) for row in output]
    if len(keys) != len(set(keys)):
        raise RuntimeError("Generated text contains duplicates")
    if any(not valid_text(str(row["language"]), str(row["mode"]), str(row["text"])) for row in output):
        raise RuntimeError("Generated text contains disallowed characters")

    OUTPUT_MANIFEST.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "replacements": len(output),
        "counts": {f"{language}/{mode}": count for (language, mode), count in sorted(indexes.items())},
        "styles": dict(sorted(Counter(str(row["style"]) for row in output).items())),
        "unique": len(set(keys)),
        "invalid": 0,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "-- Replace context-mismatched generated prose from 0045 with topic-coherent original text.",
        "-- Matches both id and old text so an unexpected database state aborts instead of changing another row.",
        "begin;",
        "",
        "create temporary table typenews_content_quality_0047 (",
        "  id bigint primary key,",
        "  language text not null,",
        "  mode text not null,",
        "  old_text text not null,",
        "  new_text text not null",
        ") on commit drop;",
        "",
        "insert into typenews_content_quality_0047 (id, language, mode, old_text, new_text)",
        "values",
    ]
    for index, row in enumerate(output):
        suffix = "," if index < len(output) - 1 else ";"
        lines.append(
            f"    ({row['id']}, {sql_literal(str(row['language']))}, {sql_literal(str(row['mode']))}, "
            f"{sql_literal(str(row['old_text']))}, {sql_literal(str(row['text']))}){suffix}"
        )
    lines.extend([
        "",
        "do $quality_check$",
        "declare",
        "  expected_count integer;",
        "  matched_count integer;",
        "begin",
        "  select count(*) into expected_count from typenews_content_quality_0047;",
        "  select count(*) into matched_count",
        "  from public.sentences sentence",
        "  join typenews_content_quality_0047 replacement",
        "    on replacement.id = sentence.id",
        "   and replacement.language = sentence.language",
        "   and replacement.mode = sentence.mode",
        "   and replacement.old_text = sentence.text;",
        "  if matched_count <> expected_count then",
        "    raise exception '0047 expected % matching rows but found %', expected_count, matched_count;",
        "  end if;",
        "end",
        "$quality_check$;",
        "",
        "update public.sentences sentence",
        "set text = case when sentence.language = 'kor' then '문맥교정' || sentence.id::text else 'context repair ' || sentence.id::text end",
        "from typenews_content_quality_0047 replacement",
        "where sentence.id = replacement.id",
        "  and sentence.text = replacement.old_text;",
        "",
        "update public.sentences sentence",
        "set text = replacement.new_text",
        "from typenews_content_quality_0047 replacement",
        "where sentence.id = replacement.id",
        "  and sentence.text = case when sentence.language = 'kor' then '문맥교정' || sentence.id::text else 'context repair ' || sentence.id::text end;",
        "",
        "commit;",
        "",
    ])
    MIGRATION_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
