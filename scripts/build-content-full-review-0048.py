"""Build a fully reviewed replacement for every generated sentence from migration 0045."""

from __future__ import annotations

import json
import re
import runpy
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_SCRIPT = ROOT / "scripts" / "build-content-refresh-0045.py"
QUALITY_SCRIPT = ROOT / "scripts" / "build-content-quality-0047.py"
MANIFEST_0045 = ROOT / "backups" / "content-refresh-0045.json"
MANIFEST_0047 = ROOT / "backups" / "content-quality-0047.json"
MANIFEST_0048 = ROOT / "backups" / "content-full-review-0048.json"
REPORT_PATH = ROOT / "backups" / "content-full-review-0048-report.json"
MIGRATION_PATH = ROOT / "supabase" / "migrations" / "0048_full_sentence_review.sql"


KOR_LEADS = {
    "motivation": ["실제로", "때로는", "결국", "무엇보다"],
    "practical": ["실제로", "대체로", "가능하면", "무엇보다"],
    "work": ["실제로", "대체로", "결국", "무엇보다"],
    "humor": ["이상하게도", "가끔은", "어쩐지", "생각해 보면"],
    "cinematic": ["그 순간", "마침내", "끝내", "바로 그때"],
    "science": ["실제로", "흥미롭게도", "연구에 따르면", "자세히 살펴보면"],
    "learning": ["실제로", "대체로", "무엇보다", "곰곰이 생각해 보면"],
    "relationship": ["실제로", "때로는", "결국", "무엇보다"],
}


ENG_LEADS = {
    "motivation": ["In practice", "Sometimes", "Ultimately", "Most importantly"],
    "practical": ["In practice", "Usually", "Generally", "Most importantly"],
    "work": ["In practice", "Usually", "Ultimately", "Most importantly"],
    "humor": ["Strangely", "Sometimes", "Oddly enough", "Looking back"],
    "cinematic": ["At that moment", "In the end", "Finally", "At the turning point"],
    "science": ["In fact", "Interestingly", "Remarkably", "On closer inspection"],
    "learning": ["In practice", "Usually", "Most importantly", "On reflection"],
    "relationship": ["In practice", "Sometimes", "Ultimately", "Most importantly"],
}


KOR_BRIDGES = {
    "motivation": [
        "두 생각 모두 완벽한 순간을 기다리기보다 계속 움직이는 태도를 강조한다.",
        "앞으로 나아가는 힘은 거창한 확신보다 반복할 수 있는 선택에서 나온다.",
        "변화의 속도는 달라도 다시 시도하는 태도는 언제나 다음 가능성을 만든다.",
        "결과가 바로 보이지 않을 때일수록 작은 행동의 의미는 더 커진다.",
    ],
    "practical": [
        "두 방법은 막연한 부담을 지금 실행할 수 있는 행동으로 바꾸어 준다.",
        "생활을 단순하게 만드는 원칙은 의외로 작고 구체적인 데서 시작된다.",
        "좋은 습관은 의지를 시험하기보다 불필요한 선택을 줄이는 방향으로 작동한다.",
        "해야 할 일을 눈에 보이게 정리하면 마음의 부담도 함께 줄어든다.",
    ],
    "work": [
        "두 원칙은 모두 기준과 다음 행동을 투명하게 공유해야 한다는 점으로 이어진다.",
        "협업의 속도는 서두르는 사람보다 혼선을 줄이는 과정에서 만들어진다.",
        "작은 문제와 판단 근거를 일찍 나누는 태도가 결과의 안정성을 높인다.",
        "좋은 팀은 평가에 머물지 않고 다음 시도를 더 분명하게 만든다.",
    ],
    "humor": [
        "이런 장면들은 계획과 현실 사이의 작은 차이를 웃으며 받아들이게 한다.",
        "뜻대로 풀리지 않는 순간도 지나고 보면 하루를 기억하게 하는 이야기가 된다.",
        "거창한 결심이 사소한 유혹 앞에서 흔들리는 모습은 누구에게나 익숙하다.",
        "평범한 실수는 시간이 조금 지나면 가장 편하게 꺼낼 수 있는 농담이 된다.",
    ],
    "cinematic": [
        "두 장면을 잇는 것은 두려움 속에서도 지키고 싶은 것을 선택하는 마음이다.",
        "이야기는 막다른 곳에서 멈추지 않고 인물이 내린 다음 선택으로 이어진다.",
        "모든 길이 사라진 듯한 순간에도 작은 결심 하나가 장면의 방향을 바꾼다.",
        "끝처럼 보이는 순간은 오히려 인물이 무엇을 믿는지 가장 분명하게 보여 준다.",
    ],
    "science": [
        "서로 다른 현상이지만 두 사례 모두 관찰을 통해 보이지 않던 원리를 드러낸다.",
        "연구 분야는 달라도 측정할 수 있는 증거가 현상을 이해하는 출발점이 된다.",
        "두 사례는 익숙하게 지나치던 현상도 질문에 따라 새롭게 보일 수 있음을 보여 준다.",
        "대상과 규모는 다르지만 세심한 관찰이 복잡한 과정을 설명한다는 점은 같다.",
    ],
    "learning": [
        "두 방법은 지식을 수동적으로 읽는 데서 그치지 않고 직접 확인하게 만든다.",
        "배움의 빈틈을 발견하고 다시 떠올리는 과정이 기억을 더 단단하게 만든다.",
        "정확한 질문과 반복 가능한 복습은 새로운 내용을 오래 남게 하는 도구다.",
        "이해한 내용을 설명하고 점검할 때 공부는 비로소 자신의 언어가 된다.",
    ],
    "relationship": [
        "두 태도 모두 상대를 바꾸려 하기보다 마음을 정확히 듣는 데서 출발한다.",
        "관계를 오래 지키는 힘은 큰 약속보다 늦지 않은 표현과 꾸준한 행동에 가깝다.",
        "고마움과 서운함을 솔직하게 나누면 익숙함이 무심함으로 변하는 일을 줄일 수 있다.",
        "진심은 화려한 말보다 상대의 시간과 감정을 존중하는 태도에서 잘 드러난다.",
    ],
}


ENG_BRIDGES = {
    "motivation": [
        "Both ideas value steady movement more than waiting for a perfect moment.",
        "Forward motion often grows from repeatable choices rather than dramatic confidence.",
        "Progress may change speed, but another honest attempt always creates a new possibility.",
        "A small action matters most when the final result is not visible yet.",
    ],
    "practical": [
        "Both methods turn vague pressure into an action that can be completed now.",
        "A simpler life usually begins with a rule that is small and specific.",
        "A useful habit reduces unnecessary choices instead of constantly testing discipline.",
        "Making the next task visible can reduce the weight carried by the mind.",
    ],
    "work": [
        "Both principles depend on making standards and next actions visible to everyone involved.",
        "The speed of collaboration grows from removing confusion rather than creating urgency.",
        "Sharing small problems and reasons early makes the final result more dependable.",
        "A strong team moves beyond judgment and makes the next attempt easier to understand.",
    ],
    "humor": [
        "Scenes like these make the small distance between plans and reality easier to enjoy.",
        "A harmless failure often becomes the story that makes an ordinary day memorable.",
        "The struggle between a serious plan and a tiny temptation is familiar to almost everyone.",
        "Given enough time, an everyday mistake can become the easiest joke to share.",
    ],
    "cinematic": [
        "The two moments are connected by the choice to protect something even while fear remains.",
        "A story continues beyond a dead end through the next decision made by its characters.",
        "When every road seems gone, one deliberate step can still change the direction of the scene.",
        "A moment that looks like an ending often reveals what a character truly believes.",
    ],
    "science": [
        "Although the subjects differ, both examples reveal a hidden process through observation.",
        "The fields may differ, but measurable evidence provides a starting point for understanding each event.",
        "Both examples show that an ordinary event can look different after we ask a precise question.",
        "The subject and scale may change, but careful observation can still explain a complex process.",
    ],
    "learning": [
        "Both methods move learning beyond passive reading and require active checking.",
        "Finding a gap and recalling the idea again can make the path of memory stronger.",
        "Precise questions and repeatable review help new knowledge remain available.",
        "A lesson becomes part of our own thinking when we explain and test it.",
    ],
    "relationship": [
        "Both attitudes begin with listening accurately instead of trying to reshape another person.",
        "A lasting relationship depends more on timely expression and steady action than on grand promises.",
        "Sharing gratitude and disappointment early prevents familiarity from becoming neglect.",
        "Sincerity becomes clearest when we respect another individual and the time they share with us.",
    ],
}


KOR_CALM_LINKS = [
    "그 장면을 바라보며 마음에 남은 생각을 천천히 정리해 보았다.",
    "잠시 걸음을 멈추자 평소 지나치던 감정이 조금씩 선명해졌다.",
    "익숙한 풍경을 오래 바라보는 동안 마음의 속도도 자연스럽게 느려졌다.",
    "주변이 조용해지자 미뤄 두었던 생각을 차분히 돌아볼 수 있었다.",
]


ENG_CALM_LINKS = [
    "The scene gave me enough quiet to arrange the thoughts that had been waiting.",
    "After I stopped for a moment, an overlooked feeling gradually became clear.",
    "Watching the familiar view slowed the pace of my thoughts without effort.",
    "As the surroundings became quiet, I could finally consider what I had postponed.",
]


KOR_CALM_REFLECTIONS = [
    "평범한 하루에도 마음을 환기하는 작은 장면은 숨어 있다.",
    "서두르지 않을 때 비로소 보이는 풍경이 있다는 것을 깨달았다.",
    "잠깐의 고요는 복잡했던 생각에 새로운 자리를 만들어 주었다.",
    "익숙한 공간도 천천히 바라보면 전과 다른 표정을 보여 준다.",
    "사소한 변화 하나가 하루의 분위기를 부드럽게 바꾸기도 한다.",
    "마음의 속도를 늦추자 지금 곁에 있는 것들이 더 선명하게 보였다.",
    "짧은 휴식은 멈춤이 아니라 다음 순간을 받아들일 여유가 되었다.",
    "오래 기억되는 순간은 대단한 사건보다 조용한 장면에 가까울 때가 많다.",
]


KOR_CALM_CLOSINGS = [
    "나는 그 장면을 기억해 두었다가 지친 날에 다시 떠올리기로 했다.",
    "돌아오는 길에는 아까보다 한결 가벼운 마음으로 주변을 바라볼 수 있었다.",
    "모든 답을 찾지는 못했지만 오늘을 천천히 마무리할 힘은 충분했다.",
    "그날 이후 평범한 풍경을 예전보다 조금 더 오래 바라보게 되었다.",
    "창문을 닫은 뒤에도 그때의 차분한 공기는 한동안 마음에 남아 있었다.",
    "나는 충분히 쉬어 가는 일도 앞으로 나아가는 방법이라고 생각하게 되었다.",
    "다시 걷기 시작하자 멈추어 있던 생각도 제자리를 찾아 흘러갔다.",
    "내일도 완벽하지는 않겠지만 오늘보다 여유롭게 시작할 수 있을 것 같았다.",
]


ENG_CALM_REFLECTIONS = [
    "Even an ordinary day can hide a small scene that refreshes the mind.",
    "I realized that some details become visible only after we stop rushing.",
    "A brief silence gave my crowded thoughts a different place to rest.",
    "A familiar place can show a new expression when we give it enough attention.",
    "One small change can gently alter the feeling of an entire day.",
    "As my thoughts slowed, the things already beside me became easier to notice.",
    "A short rest did not feel like stopping but like making room for the next moment.",
    "The moments that last are often quiet scenes rather than dramatic events.",
]


ENG_CALM_CLOSINGS = [
    "I kept the scene in my memory so I could return to it on a difficult day.",
    "On the way back, I could look at the same surroundings with a lighter mind.",
    "I did not find every answer, but I had enough calm to finish the day.",
    "After that day, I began to spend a little longer with ordinary views.",
    "The quiet air of that moment stayed with me even after I closed the window.",
    "I came to see that enough rest can also be a way of moving forward.",
    "When I started walking again, the thoughts that had stopped began to move as well.",
    "Tomorrow would not be perfect, but I felt ready to begin it with more patience.",
]


def compact(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def identity(language: str, mode: str, text: str) -> tuple[str, str, str]:
    return language, mode, compact(text).casefold()


def lower_first(text: str) -> str:
    return text[:1].lower() + text[1:]


def valid_text(language: str, text: str) -> bool:
    if language == "kor":
        return all(0xAC00 <= ord(char) <= 0xD7A3 or char in " ,.?!" for char in text)
    return all(char.isascii() and (char.isalpha() or char in " ,.?!") for char in text)


def clean_seed(language: str, text: str) -> str:
    replacements = {
        "문이 닫혔다고 끝난 것은 아니야 우리는 다른 길을 찾으면 돼.":
            "문이 닫혔다고 끝난 것은 아니야, 우리는 다른 길을 찾으면 돼.",
        "정답은 없어도 선택은 해야 해 그리고 나는 우리를 선택할 거야.":
            "정답은 없어도 선택은 해야 하고 나는 우리를 선택할 거야.",
        "마지막 기회라는 말은 믿지 마 다음 장면은 우리가 만드는 거니까.":
            "마지막 기회라는 말은 믿지 마, 다음 장면은 우리가 만드는 거니까.",
        "누가 먼저였는지는 중요하지 않아 끝까지 남는 사람이 필요해.":
            "누가 먼저였는지는 중요하지 않아, 끝까지 남는 사람이 필요해.",
        "돌아갈 수 없다면 앞으로 가자 적어도 길은 우리가 고를 수 있어.":
            "돌아갈 수 없다면 앞으로 가자, 적어도 길은 우리가 고를 수 있어.",
        "Do not trust the words final chance because we can still write another scene.":
            "Do not believe anyone who calls this the final chance, because we can still write another scene.",
    }
    return replacements.get(text, text)


def contextual_short(language: str, style: str, lead: str, seed: str) -> str:
    separator = ", " if language == "eng" else " "
    return f"{lead}{separator}{lower_first(seed) if language == 'eng' else seed}"


def interleave(buckets: dict[str, list[dict[str, str]]]) -> list[dict[str, str]]:
    output: list[dict[str, str]] = []
    names = list(buckets)
    cursor = 0
    while any(buckets.values()):
        name = names[cursor % len(names)]
        cursor += 1
        if buckets[name]:
            output.append(buckets[name].pop(0))
    return output


def build_short_candidates(language: str, source: dict[str, object]) -> list[dict[str, str]]:
    raw_styles = source["KOR_STYLE_SEEDS" if language == "kor" else "ENG_STYLE_SEEDS"]
    styles = {style: [clean_seed(language, seed) for seed in seeds] for style, seeds in raw_styles.items()}
    leads = KOR_LEADS if language == "kor" else ENG_LEADS
    subjects = source["KOR_SHORT_SUBJECTS" if language == "kor" else "ENG_SHORT_SUBJECTS"]
    endings = source["KOR_SHORT_ENDINGS" if language == "kor" else "ENG_SHORT_ENDINGS"]
    scenes = source["KOR_SCENES" if language == "kor" else "ENG_SCENES"]
    reflections = source["KOR_REFLECTIONS" if language == "kor" else "ENG_REFLECTIONS"]
    closings = source["KOR_CLOSINGS" if language == "kor" else "ENG_CLOSINGS"]

    buckets: dict[str, list[dict[str, str]]] = {"calm": [], "everyday": [], "reflection": []}
    safe_endings = [0, 1, 2, 3, 4, 8, 9, 16] if language == "kor" else [0, 1, 2, 3, 5, 7, 8, 16]
    for round_index, ending_index in enumerate(safe_endings):
        for subject_index, subject in enumerate(subjects):
            ending = endings[(ending_index + subject_index + round_index) % len(endings)]
            buckets["calm"].append({"style": "calm", "text": f"{subject} {ending}."})
    buckets["everyday"] = [{"style": "everyday", "text": text} for text in scenes]
    buckets["reflection"] = [{"style": "reflection", "text": text} for text in reflections]

    for style, seeds in styles.items():
        values = [{"style": style, "text": seed} for seed in seeds]
        for lead in leads[style]:
            values.extend({"style": style, "text": contextual_short(language, style, lead, seed)} for seed in seeds)
        buckets[style] = values
    buckets["motivation"].extend({"style": "motivation", "text": text} for text in closings)
    return interleave(buckets)


def build_long_candidates(language: str, source: dict[str, object]) -> list[dict[str, str]]:
    raw_styles = source["KOR_STYLE_SEEDS" if language == "kor" else "ENG_STYLE_SEEDS"]
    styles = {style: [clean_seed(language, seed) for seed in seeds] for style, seeds in raw_styles.items()}
    bridges = KOR_BRIDGES if language == "kor" else ENG_BRIDGES
    buckets: dict[str, list[dict[str, str]]] = {}
    for style, seeds in styles.items():
        values: list[dict[str, str]] = []
        index = 0
        for offset in range(1, len(seeds)):
            for first_index, first in enumerate(seeds):
                second = seeds[(first_index + offset) % len(seeds)]
                bridge = bridges[style][index % len(bridges[style])]
                values.append({"style": style, "text": f"{first} {bridge} {second}"})
                index += 1
        buckets[style] = values

    scenes = source["KOR_SCENES" if language == "kor" else "ENG_SCENES"]
    reflections = KOR_CALM_REFLECTIONS if language == "kor" else ENG_CALM_REFLECTIONS
    closings = KOR_CALM_CLOSINGS if language == "kor" else ENG_CALM_CLOSINGS
    links = KOR_CALM_LINKS if language == "kor" else ENG_CALM_LINKS
    calm: list[dict[str, str]] = []
    for link_index, link in enumerate(links):
        for scene_index, scene in enumerate(scenes):
            reflection = reflections[(scene_index * 7 + link_index * 3) % len(reflections)]
            closing = closings[(scene_index * 11 + link_index * 5) % len(closings)]
            calm.append({"style": "calm", "text": f"{scene} {link} {reflection} {closing}"})
    buckets["calm"] = calm
    return interleave(buckets)


def choose(
    candidates: list[dict[str, str]],
    count: int,
    language: str,
    mode: str,
    occupied: set[tuple[str, str, str]],
) -> list[dict[str, str]]:
    output: list[dict[str, str]] = []
    visible_prefixes: Counter[str] = Counter()
    for candidate in candidates:
        text = compact(candidate["text"])
        if language == "kor":
            length_ok = 20 <= len(text) <= 90 if mode == "short" else 95 <= len(text) <= 330
            prefix = text[:24].casefold()
        else:
            length_ok = 35 <= len(text) <= 155 if mode == "short" else 175 <= len(text) <= 430
            prefix = " ".join(text.casefold().split()[:8])
        prefix_limit = 2 if mode == "short" else 5
        item_identity = identity(language, mode, text)
        if not length_ok or not valid_text(language, text) or item_identity in occupied:
            continue
        if visible_prefixes[prefix] >= prefix_limit:
            continue
        occupied.add(item_identity)
        visible_prefixes[prefix] += 1
        output.append({**candidate, "text": text})
        if len(output) == count:
            return output
    raise RuntimeError(f"Not enough reviewed {language}/{mode} candidates: {len(output)}/{count}")


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    source = runpy.run_path(str(SOURCE_SCRIPT))
    runpy.run_path(str(QUALITY_SCRIPT))  # Compile and load the preceding migration generator as part of the chain check.
    rows_0045 = json.loads(MANIFEST_0045.read_text(encoding="utf-8"))
    rows_0047 = {int(row["id"]): row for row in json.loads(MANIFEST_0047.read_text(encoding="utf-8"))}
    target_ids = {int(row["id"]) for row in rows_0045}

    current_rows = source["fetch_rows"]()
    occupied = {
        identity(str(row["language"]), str(row["mode"]), str(row["text"]))
        for row in current_rows if int(row["id"]) not in target_ids
    }

    counts = Counter((str(row["language"]), str(row["mode"])) for row in rows_0045)
    generated: dict[tuple[str, str], list[dict[str, str]]] = {}
    for language in ("kor", "eng"):
        for mode in ("short", "long"):
            candidates = build_short_candidates(language, source) if mode == "short" else build_long_candidates(language, source)
            generated[(language, mode)] = choose(candidates, counts[(language, mode)], language, mode, occupied)

    indexes: Counter[tuple[str, str]] = Counter()
    output: list[dict[str, object]] = []
    for row in rows_0045:
        pair = (str(row["language"]), str(row["mode"]))
        generated_row = generated[pair][indexes[pair]]
        indexes[pair] += 1
        intermediate = rows_0047.get(int(row["id"]))
        output.append({
            "id": int(row["id"]),
            "language": pair[0],
            "mode": pair[1],
            "old_text_0045": str(row["text"]),
            "old_text_0047": str(intermediate["text"]) if intermediate else str(row["text"]),
            "text": generated_row["text"],
            "style": generated_row["style"],
        })

    identities = [identity(str(row["language"]), str(row["mode"]), str(row["text"])) for row in output]
    if len(identities) != len(set(identities)):
        raise RuntimeError("Reviewed content contains duplicate entries")
    if any(not valid_text(str(row["language"]), str(row["text"])) for row in output):
        raise RuntimeError("Reviewed content contains a disallowed character")

    MANIFEST_0048.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "reviewed": len(output),
        "counts": {f"{language}/{mode}": count for (language, mode), count in sorted(indexes.items())},
        "styles": dict(sorted(Counter(str(row["style"]) for row in output).items())),
        "unique": len(set(identities)),
        "invalid": 0,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "-- Fully replace all 1,720 generated short and long entries from 0045 after a context review.",
        "-- Accepts the 0045 state, the 0047 intermediate state, or an already-applied 0048 state.",
        "begin;",
        "",
        "create temporary table typenews_content_review_0048 (",
        "  id bigint primary key,",
        "  language text not null,",
        "  mode text not null,",
        "  old_text_0045 text not null,",
        "  old_text_0047 text not null,",
        "  new_text text not null",
        ") on commit drop;",
        "",
        "insert into typenews_content_review_0048 (id, language, mode, old_text_0045, old_text_0047, new_text)",
        "values",
    ]
    for index, row in enumerate(output):
        suffix = "," if index < len(output) - 1 else ";"
        lines.append(
            f"    ({row['id']}, {sql_literal(str(row['language']))}, {sql_literal(str(row['mode']))}, "
            f"{sql_literal(str(row['old_text_0045']))}, {sql_literal(str(row['old_text_0047']))}, "
            f"{sql_literal(str(row['text']))}){suffix}"
        )
    lines.extend([
        "",
        "do $review_check$",
        "declare",
        "  expected_count integer;",
        "  matched_count integer;",
        "begin",
        "  select count(*) into expected_count from typenews_content_review_0048;",
        "  select count(*) into matched_count",
        "  from public.sentences sentence",
        "  join typenews_content_review_0048 review on review.id = sentence.id",
        "  where sentence.language = review.language",
        "    and sentence.mode = review.mode",
        "    and sentence.text in (review.old_text_0045, review.old_text_0047, review.new_text);",
        "  if matched_count <> expected_count then",
        "    raise exception '0048 expected % matching rows but found %', expected_count, matched_count;",
        "  end if;",
        "end",
        "$review_check$;",
        "",
        "update public.sentences sentence",
        "set text = case when sentence.language = 'kor' then '전체검수' || sentence.id::text else 'full review ' || sentence.id::text end",
        "from typenews_content_review_0048 review",
        "where sentence.id = review.id",
        "  and sentence.text in (review.old_text_0045, review.old_text_0047);",
        "",
        "update public.sentences sentence",
        "set text = review.new_text",
        "from typenews_content_review_0048 review",
        "where sentence.id = review.id",
        "  and sentence.text = case when sentence.language = 'kor' then '전체검수' || sentence.id::text else 'full review ' || sentence.id::text end;",
        "",
        "commit;",
        "",
    ])
    MIGRATION_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
