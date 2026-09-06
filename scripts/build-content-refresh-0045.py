"""Replace literary and hard-to-type sentences with modern original prose."""

from __future__ import annotations

import json
import random
import re
import urllib.request
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_0044 = ROOT / "backups" / "content-expansion-0044.json"
MANIFEST_0045 = ROOT / "backups" / "content-refresh-0045.json"
MIGRATION_PATH = ROOT / "supabase" / "migrations" / "0045_refresh_typing_library.sql"
RNG = random.Random(20260802)

KOR_SHORT_SUBJECTS = [
    "늦은 오후의 햇살은", "창가에 머문 빗소리는", "천천히 번지는 노을은",
    "골목을 스치는 저녁 바람은", "새벽에 깨어난 도시는", "오래된 사진 한 장은",
    "우연히 들은 익숙한 노래는", "따뜻한 차 한 잔은", "한적한 산책길은",
    "구름 사이로 나온 달빛은", "비가 그친 뒤의 공기는", "작은 화분의 새잎은",
    "책갈피에 남은 짧은 메모는", "퇴근길에 마주친 하늘은", "조용한 주말 아침은",
    "여름밤의 풀벌레 소리는", "첫눈이 내린 골목은", "바다에서 불어온 바람은",
    "낯익은 향기가 밴 옷은", "오래 기다린 답장은", "불을 낮춘 방 안은",
    "커튼 사이의 아침빛은", "비어 있는 옆자리는", "천천히 식어 가는 커피는",
    "멀리서 들리는 웃음은", "한밤중의 작은 불빛은", "낙엽이 쌓인 길은",
    "다정하게 건넨 인사는", "문득 떠오른 이름은", "오늘의 고요한 틈은",
    "서랍 속 오래된 편지는", "잔잔한 음악의 마지막 음은",
]

KOR_SHORT_ENDINGS = [
    "지친 마음에 작은 온기를 남긴다", "평범한 하루를 조금 특별하게 만든다",
    "잊고 있던 마음을 조용히 깨운다", "복잡했던 생각을 잠시 쉬게 한다",
    "지나간 계절의 기억을 데려온다", "오늘을 천천히 바라보게 만든다",
    "말하지 못한 감정을 가만히 안아 준다", "마음 한쪽에 잔잔한 여운을 남긴다",
    "서두르던 걸음을 잠시 멈추게 한다", "사소한 행복이 가까이 있음을 알려 준다",
    "괜찮아질 내일을 조용히 기대하게 한다", "익숙한 풍경을 새롭게 바라보게 한다",
    "혼자였던 시간을 포근하게 채워 준다", "오래된 그리움을 부드럽게 흔든다",
    "지금 이 순간에 마음을 머물게 한다", "작은 용기를 다시 꺼내 들게 한다",
    "바쁜 하루에 느린 숨을 선물한다", "잊었던 미소를 천천히 되찾게 한다",
    "멀어진 마음을 다시 돌아보게 한다", "아무 말 없이도 깊은 위로가 된다",
    "내일의 나에게 다정한 약속을 건넨다", "흐릿했던 기억을 선명하게 비춘다",
    "무거운 마음을 한결 가볍게 만든다", "조용한 설렘을 마음속에 피워 낸다",
    "지나온 시간을 따뜻하게 이해하게 한다", "오늘도 잘 버텼다고 말해 주는 듯하다",
    "평범한 순간의 소중함을 다시 알려 준다", "마음 깊은 곳에 맑은 숨을 불어넣는다",
]

KOR_SCENES = [
    "해가 기울 무렵 창문을 열자 선선한 바람이 방 안으로 천천히 들어왔다.",
    "비가 그친 골목에는 젖은 나무 냄새와 부드러운 저녁빛이 함께 머물렀다.",
    "조용한 카페 창가에 앉아 지나가는 사람들의 느린 표정을 바라보았다.",
    "퇴근길 버스 창문 너머로 붉은 노을이 길게 번지며 하루를 배웅했다.",
    "주말 아침에 눈을 뜨니 커튼 사이로 맑은 햇살이 가만히 스며들었다.",
    "오래 걷던 산책길 끝에서 이름 모를 꽃 한 송이가 바람에 흔들리고 있었다.",
    "늦은 밤 책장을 덮자 방 안에는 시계 소리와 잔잔한 음악만 남았다.",
    "첫눈이 내린 거리는 익숙한 풍경을 새하얀 장면으로 천천히 바꾸어 놓았다.",
    "바닷가에 앉아 밀려왔다 멀어지는 파도의 리듬을 오래 바라보았다.",
    "따뜻한 차를 우려 놓고 창밖의 빗방울이 흘러내리는 모습을 지켜보았다.",
    "서랍을 정리하다 발견한 사진 속에서 오래전의 내가 환하게 웃고 있었다.",
    "새벽 공기가 차가워 창문을 닫으려다 희미하게 밝아 오는 하늘을 보았다.",
    "낙엽이 수북한 길을 걸을 때마다 발끝에서 바스락거리는 소리가 났다.",
    "오랜만에 찾은 동네에는 달라진 간판과 그대로인 골목이 나란히 있었다.",
    "작은 화분 끝에 돋아난 새잎이 아침 햇빛을 받아 투명하게 빛나고 있었다.",
    "저녁 식사를 마친 뒤 불을 낮추니 집 안의 시간이 조금 느리게 흐르는 듯했다.",
    "우연히 재생된 옛 노래가 잊고 있던 어느 계절의 공기를 데려왔다.",
    "한강을 따라 걷는 동안 멀리 켜진 불빛들이 물 위에서 조용히 흔들렸다.",
    "약속보다 일찍 도착한 나는 빈 의자에 앉아 따뜻한 커피를 천천히 마셨다.",
    "비어 있던 우편함에서 반가운 편지 한 통을 발견하고 한참을 바라보았다.",
]

KOR_REFLECTIONS = [
    "마음이 복잡할수록 답을 서두르기보다 지금의 감정을 온전히 바라볼 필요가 있다.",
    "우리는 큰 사건보다 사소한 장면 하나를 더 오래 기억하며 살아가기도 한다.",
    "지나간 시간을 바꿀 수는 없어도 그 시간을 바라보는 마음은 달라질 수 있다.",
    "누군가의 다정한 한마디는 생각보다 오래 남아 힘든 날의 중심을 잡아 준다.",
    "매일 같은 길을 걷더라도 마음의 속도를 늦추면 전에는 없던 풍경이 보인다.",
    "모든 관계에는 말보다 침묵으로 서로를 이해해야 하는 순간이 찾아온다.",
    "조금 늦어도 괜찮다는 믿음은 멈추지 않고 나아갈 수 있는 여유를 만들어 준다.",
    "좋았던 기억은 붙잡을 때보다 편안히 놓아줄 때 더 따뜻한 모습으로 남는다.",
    "평범한 하루를 견디게 하는 힘은 멀리 있는 목표보다 가까운 애정에서 온다.",
    "마음에 쌓인 피로는 아무것도 하지 않는 고요한 시간 속에서 천천히 풀린다.",
    "완벽하지 않은 모습까지 받아들일 때 비로소 나다운 방향이 선명해진다.",
    "계절이 변하듯 사람의 마음도 머물고 떠나며 새로운 자리를 만들어 간다.",
    "기다림은 답이 없는 시간이 아니라 마음이 스스로를 정리하는 과정일 수 있다.",
    "가까운 사람일수록 익숙함 뒤에 숨은 고마움을 자주 표현해야 한다.",
    "오늘의 작은 선택이 당장은 보이지 않아도 내일의 분위기를 바꾸어 놓는다.",
    "한 번의 실패가 나를 설명하지 않으며 다시 시작하는 마음이 더 오래 남는다.",
    "슬픔을 억지로 지우기보다 충분히 지나가게 두는 것이 진짜 회복에 가깝다.",
    "혼자 보내는 시간은 외로움이 아니라 내 목소리를 다시 듣는 여백이 된다.",
    "오래된 꿈은 잊힌 것이 아니라 다시 꺼낼 알맞은 순간을 기다리고 있을지 모른다.",
    "행복은 대단한 장면보다 좋아하는 사람과 나눈 짧은 웃음 속에 자주 숨어 있다.",
]

KOR_CLOSINGS = [
    "그래서 오늘만큼은 서두르지 않고 내 마음의 속도에 맞추어 걷기로 했다.",
    "나는 그 고요를 오래 기억해 두었다가 지친 날에 다시 꺼내 보기로 했다.",
    "작은 변화라도 믿어 보기로 하자 마음 한편에 가벼운 설렘이 피어났다.",
    "돌아오는 길에는 아까보다 부드러운 표정으로 익숙한 거리를 바라볼 수 있었다.",
    "내일도 완벽하지 않겠지만 오늘보다 조금 다정한 사람이 되고 싶어졌다.",
    "그 순간 모든 답을 찾지 못해도 괜찮다는 생각이 조용히 마음에 내려앉았다.",
    "한참을 머물다 일어서는 발걸음은 이상할 만큼 가볍고 단단해져 있었다.",
    "지나온 날들을 탓하는 대신 지금의 나를 천천히 안아 주기로 마음먹었다.",
    "익숙한 하루 안에도 아직 발견하지 못한 아름다움이 많다는 것을 알게 되었다.",
    "창문을 닫은 뒤에도 그날의 맑은 공기는 오래도록 마음속에 남아 있었다.",
    "말로 설명하기 어려운 감정은 그대로 두어도 충분히 아름다울 수 있었다.",
    "오늘의 작은 위로가 내일을 시작할 힘이 되어 줄 것이라고 믿어 보기로 했다.",
    "나는 늦게 도착한 마음도 진심이라면 충분히 소중하다고 생각하게 되었다.",
    "어둠이 깊어질수록 작은 불빛 하나가 더 선명해진다는 사실을 기억했다.",
    "다시 걷기 시작하자 멈춰 있던 생각들도 제자리를 찾아 천천히 흘러갔다.",
    "그날 이후 나는 평범한 순간을 예전보다 조금 더 오래 바라보게 되었다.",
    "마음이 흔들릴 때마다 이 조용한 장면으로 돌아올 수 있을 것 같았다.",
    "아직 오지 않은 날들을 걱정하기보다 지금 곁에 있는 온기를 믿기로 했다.",
    "끝이라고 생각했던 자리에서도 새로운 시작은 조용히 자라고 있었다.",
    "나는 충분히 쉬어 가는 일도 앞으로 나아가는 방법임을 받아들이기로 했다.",
]

ENG_SHORT_SUBJECTS = [
    "Soft morning light", "The sound of summer rain", "A familiar song",
    "The quiet evening breeze", "A handwritten note", "The first winter snow",
    "Warm light by the window", "A slow walk home", "The scent of fresh coffee",
    "A clear sky after rain", "The moon above the rooftops", "A small act of kindness",
    "The final page of a book", "A peaceful weekend morning", "The glow of sunset",
    "A flower beside the road", "The hush of an empty room", "A long awaited message",
    "The rhythm of distant waves", "A gentle voice", "An old photograph",
    "The first green leaf", "A quiet moment alone", "The warmth of home",
    "A friendly smile", "The color of autumn trees", "A calm night sky",
    "The promise of spring", "A cool breeze at dawn", "The memory of laughter",
    "A path covered in leaves", "The last note of the melody", "A bright kitchen window",
    "The scent of wet earth", "A peaceful train ride", "The light across the river",
]

ENG_SHORT_ENDINGS = [
    "brings a little warmth to a tired heart", "makes an ordinary day feel quietly special",
    "returns a forgotten memory with gentle clarity", "gives crowded thoughts a place to rest",
    "turns a brief pause into a lasting memory", "reminds us that comfort can be simple",
    "leaves a soft trace long after it fades", "makes the familiar world feel new again",
    "invites the heart to move at a kinder pace", "holds more meaning than words can explain",
    "carries hope into the quieter parts of the day", "makes room for a small and honest smile",
    "helps a restless mind become still", "brings distant feelings a little closer",
    "offers the courage to begin once more", "turns solitude into a peaceful kind of company",
    "reminds us to notice what usually passes by", "settles gently into the heart",
    "makes tomorrow feel a little less uncertain", "keeps a tender moment from disappearing",
    "shows that healing often arrives without noise", "gives the present moment a softer shape",
    "brings calm to the end of a busy day", "makes time seem slower for a while",
    "awakens a quiet sense of gratitude", "helps the heart release what it no longer needs",
    "becomes a gentle promise for the days ahead", "reveals beauty in the most ordinary places",
]

ENG_SCENES = [
    "Evening sunlight crossed the room and rested softly on the books beside the window.",
    "After the rain, the street carried the scent of wet trees and the glow of quiet lamps.",
    "I sat by the cafe window and watched the city move at a slower pace than usual.",
    "On the ride home, a red sunset followed the bus between the rows of tall buildings.",
    "The weekend began with clear light slipping through the curtains into a silent room.",
    "At the end of the walking path, a small flower moved gently in the evening breeze.",
    "When the music ended, only the clock and the soft hum of the room remained.",
    "The first snow changed the familiar street into a scene that felt calm and new.",
    "I stayed beside the sea and listened as each wave arrived and slowly pulled away.",
    "A cup of warm tea cooled beside me while rain drew long lines across the window.",
    "Inside an old drawer, I found a photograph of myself smiling without any hesitation.",
    "I opened the window at dawn and watched the pale sky gather color above the roofs.",
    "Dry leaves made a quiet sound beneath every step along the nearly empty path.",
    "The neighborhood had changed, yet one narrow alley still held the shape of old days.",
    "A new leaf at the edge of the plant looked almost transparent in the morning sun.",
    "After dinner, I lowered the lights and felt the hours begin to move more gently.",
    "An old song began without warning and returned the air of a season I had forgotten.",
    "Along the river, distant lights trembled on the water as the city settled into night.",
    "I arrived early and waited with a warm cup while the empty chair faced the window.",
    "A letter in the quiet mailbox made the ordinary afternoon feel suddenly meaningful.",
]

ENG_REFLECTIONS = [
    "When the mind feels crowded, it helps to observe each feeling before searching for an answer.",
    "We often remember a small and ordinary scene longer than the important events around it.",
    "The past cannot be changed, but the way we carry it can become gentler with time.",
    "A sincere sentence can remain in the heart and steady us through an unexpectedly hard day.",
    "Even a familiar road reveals something new when we allow ourselves to walk without hurry.",
    "Every close relationship eventually asks us to understand what silence is trying to say.",
    "Believing that a slower pace is acceptable gives us enough room to continue without fear.",
    "A good memory often becomes warmer when we stop holding it too tightly and let it rest.",
    "The strength to face an ordinary day usually comes from affection that is already nearby.",
    "A tired heart begins to recover when it is given a quiet hour with nothing to prove.",
    "Accepting our unfinished parts can make the direction of our lives feel more honest.",
    "Like the seasons, feelings arrive and leave while making space for something new.",
    "Waiting is not always empty time because the heart may be learning how to understand itself.",
    "The people closest to us still need to hear the gratitude that familiarity can hide.",
    "A small choice made today can quietly change the atmosphere of many days to come.",
    "One failure never explains a whole life, while the courage to begin again can shape it.",
    "Real healing can start when sadness is allowed to pass through instead of being pushed away.",
    "Time spent alone can become a clear space where our own voice is finally easy to hear.",
    "An old dream may not be gone and might simply be waiting for a kinder moment to return.",
    "Happiness often hides in a brief laugh shared with someone who makes the world feel safe.",
]

ENG_CLOSINGS = [
    "For once, I decided to stop rushing and let the day move at the pace of my own heart.",
    "I kept that quiet scene in my memory so I could return to it whenever the days felt heavy.",
    "Trusting even a small change brought a calm sense of possibility back into the evening.",
    "On the way home, I could look at the familiar streets with a softer and more patient gaze.",
    "Tomorrow may not be perfect, but I hope to meet it with a little more kindness than today.",
    "Not having every answer suddenly felt acceptable, and the thought settled gently within me.",
    "When I finally stood to leave, my steps felt lighter and steadier than they had before.",
    "Instead of blaming the days behind me, I chose to treat the person I am with greater care.",
    "I realized that an ordinary day still holds more beauty than I usually take time to notice.",
    "Even after the window closed, the clear feeling of that moment remained in the room.",
    "Some feelings do not need a perfect explanation in order to be honest and beautiful.",
    "I chose to believe that this small comfort would become enough strength to start tomorrow.",
    "A heart that arrives late can still be precious when it arrives with sincerity.",
    "I remembered that even the smallest light becomes clear when the night grows deeper.",
    "As I began walking again, the thoughts that had stopped slowly returned to their places.",
    "From that day on, I learned to stay a little longer with the ordinary moments around me.",
    "Whenever my heart feels uncertain, I think I can return to the calm of this scene.",
    "Rather than fear the days ahead, I decided to trust the warmth that was already near.",
    "A new beginning had been growing quietly in the same place that once seemed like an ending.",
    "I finally accepted that taking enough rest can also be a meaningful way to move forward.",
]

KOR_STYLE_SEEDS = {
    "motivation": [
        "완벽한 준비보다 오늘 시작한 작은 행동이 더 멀리 간다.",
        "속도가 느려도 방향을 잃지 않으면 결국 원하는 곳에 닿는다.",
        "실패한 횟수보다 다시 시도한 횟수가 사람을 더 정확히 설명한다.",
        "두려움이 사라지기를 기다리지 말고 두려움과 함께 한 걸음 내딛자.",
        "어제보다 나아진 한 가지를 찾으면 오늘은 충분히 의미가 있다.",
        "목표가 멀게 느껴질수록 지금 끝낼 수 있는 일에 집중하자.",
        "기회는 준비된 순간보다 움직이기 시작한 순간에 더 자주 보인다.",
        "잠시 쉬는 것은 포기가 아니라 더 오래 가기 위한 선택이다.",
        "아직 서툴다는 사실은 앞으로 달라질 여지가 많다는 뜻이다.",
        "스스로를 믿는 연습도 다른 능력처럼 매일 조금씩 좋아진다.",
    ],
    "practical": [
        "해야 할 일이 많다면 가장 작은 일 하나부터 끝내 보자.",
        "중요한 결정은 피곤한 밤보다 맑은 아침에 내리는 편이 낫다.",
        "기억해야 할 생각은 머릿속에 두지 말고 바로 적어 두자.",
        "문제가 복잡할수록 사실과 추측을 먼저 나누어 보는 것이 좋다.",
        "십 분 안에 끝낼 수 있는 일은 미루지 않는 편이 마음도 가볍다.",
        "대화가 꼬였을 때는 반박보다 상대의 말을 다시 확인해 보자.",
        "새로운 습관은 거창한 계획보다 반복할 수 있는 크기로 시작하자.",
        "집중이 흐트러지면 화면을 닫고 해야 할 일 하나만 남겨 보자.",
        "좋은 기록은 결과뿐 아니라 그때의 판단 이유까지 남긴다.",
        "일정을 잡을 때는 예상 시간보다 조금 넉넉한 여백을 두자.",
    ],
    "work": [
        "좋은 회의는 말이 많은 회의가 아니라 다음 행동이 분명한 회의다.",
        "업무의 우선순위는 급한 목소리보다 실제 영향으로 판단해야 한다.",
        "막힌 일을 오래 붙들기보다 질문을 정확히 만드는 편이 빠를 때가 있다.",
        "동료에게 일찍 알린 작은 문제는 늦게 발견한 큰 문제가 되지 않는다.",
        "완료의 기준을 먼저 정하면 불필요한 수정이 크게 줄어든다.",
        "자료를 공유할 때는 결론과 근거와 다음 순서를 함께 적는 것이 좋다.",
        "반복되는 실수는 사람보다 과정에서 원인을 찾을 때 더 잘 고쳐진다.",
        "집중할 시간과 답장할 시간을 나누면 둘 다 더 선명해진다.",
        "좋은 피드백은 평가보다 다음 시도를 구체적으로 보여 준다.",
        "어려운 업무일수록 중간 결과를 자주 확인하는 편이 안전하다.",
    ],
    "humor": [
        "알람을 세 번 미룬 사람도 커피 앞에서는 제법 진지해진다.",
        "냉장고 문을 열고 목적을 잊었다면 잠깐의 모험은 성공한 셈이다.",
        "한 주의 첫날은 잘못이 없지만 사람들은 대체로 그날을 의심한다.",
        "정리하려고 꺼낸 물건이 더 많아졌다면 계획은 잠시 성장 중이다.",
        "운동을 결심한 날에는 운동복이 평소보다 유난히 멋져 보인다.",
        "회의가 길어질수록 모두가 시계를 보지 않는 기술만 늘어난다.",
        "간식은 배가 고플 때보다 일이 어려울 때 더 설득력 있게 다가온다.",
        "비밀번호를 바꾼 직후 옛 비밀번호가 가장 또렷하게 기억난다.",
        "청소를 시작하면 잃어버린 물건과 잊고 있던 추억이 함께 나온다.",
        "일찍 자겠다는 다짐은 밤이 깊을수록 더 철학적인 문장이 된다.",
    ],
    "cinematic": [
        "문이 닫혔다고 끝난 것은 아니야 우리는 다른 길을 찾으면 돼.",
        "오늘 도망치면 장면은 멈추지만 다시 걸으면 이야기가 이어져.",
        "정답은 없어도 선택은 해야 해 그리고 나는 우리를 선택할 거야.",
        "불빛이 하나 남아 있다면 아직 돌아갈 길도 남아 있는 거야.",
        "우리가 잃은 것은 시간이 아니라 서로에게 말할 용기였어.",
        "마지막 기회라는 말은 믿지 마 다음 장면은 우리가 만드는 거니까.",
        "누가 먼저였는지는 중요하지 않아 끝까지 남는 사람이 필요해.",
        "지금 손을 놓으면 편해지겠지만 나는 편한 결말을 원하지 않아.",
        "세상이 조용해진 뒤에도 네 목소리만은 분명하게 들렸어.",
        "돌아갈 수 없다면 앞으로 가자 적어도 길은 우리가 고를 수 있어.",
    ],
    "science": [
        "우리가 보는 별빛은 먼 우주가 오래전에 보낸 소식이다.",
        "문어의 심장은 세 개이며 그중 두 개는 아가미로 피를 보낸다.",
        "나무는 뿌리 주변의 균류와 영양분을 주고받으며 함께 살아간다.",
        "번개가 보인 뒤 천둥이 늦게 들리는 것은 빛이 소리보다 빠르기 때문이다.",
        "사막의 밤이 추운 이유는 열을 붙잡아 둘 수분이 적기 때문이다.",
        "달은 지구에서 조금씩 멀어지며 하루의 길이에도 영향을 준다.",
        "기억은 꺼내 볼 때마다 그대로 재생되지 않고 조금씩 다시 만들어진다.",
        "벌은 춤의 방향과 속도로 먹이가 있는 위치를 동료에게 알린다.",
        "깊은 바다의 생물은 스스로 빛을 만들어 신호를 보내기도 한다.",
        "구름은 가벼워 보여도 큰 구름 하나에는 엄청난 양의 물이 들어 있다.",
    ],
    "learning": [
        "모르는 것을 정확히 말할 수 있을 때 배움은 더 빠르게 시작된다.",
        "한 번에 오래 공부하기보다 짧게 나누어 반복하는 편이 기억에 잘 남는다.",
        "어려운 개념은 다른 사람에게 설명해 보면 빈틈이 분명하게 보인다.",
        "틀린 답을 기록하면 다음에 같은 생각의 길로 빠지는 일을 줄일 수 있다.",
        "새로운 언어는 완벽한 문장보다 자주 쓰는 짧은 표현에서 가까워진다.",
        "질문을 부끄러워하지 않는 사람이 결국 더 깊은 답을 발견한다.",
        "배운 내용을 하루 뒤에 다시 떠올리면 기억의 연결이 단단해진다.",
        "익숙한 방법이 막힐 때 다른 관점은 새로운 출발점이 된다.",
        "잘 읽는 사람은 중요한 문장뿐 아니라 이해되지 않는 부분도 표시한다.",
        "실력을 비교할 대상은 타인보다 어제의 나인 편이 오래 도움이 된다.",
    ],
    "relationship": [
        "가까운 사이일수록 고맙다는 말은 마음속에만 두지 않는 것이 좋다.",
        "상대의 하루를 묻고 대답을 기다리는 일도 충분히 깊은 배려다.",
        "미안하다는 말에는 변명보다 다음에 달라질 행동이 함께 있어야 한다.",
        "서로 다른 의견은 관계의 끝이 아니라 이해의 시작이 될 수 있다.",
        "힘든 사람에게 필요한 것은 해결책보다 곁에 남아 주는 시간일 때가 있다.",
        "오래된 우정은 자주 만나지 못해도 다시 이어지는 길을 기억한다.",
        "진심은 거창한 표현보다 약속한 시간을 지키는 태도에서 보인다.",
        "좋아하는 마음은 상대를 바꾸기보다 있는 모습으로 바라볼 때 깊어진다.",
        "대화의 온도는 무슨 말을 했는지보다 어떻게 들었는지에 남는다.",
        "서운함을 쌓아 두기보다 작을 때 솔직하게 나누는 편이 관계를 지킨다.",
    ],
}

ENG_STYLE_SEEDS = {
    "motivation": [
        "A small action today can travel farther than a perfect plan tomorrow.",
        "Moving slowly is still progress when the direction remains clear.",
        "A person is shaped less by failure than by the decision to try again.",
        "Courage begins when you take one step before the fear disappears.",
        "Finding one improvement makes an ordinary day worth remembering.",
        "When the goal feels distant, finish the next task within reach.",
        "Opportunities become easier to notice after you begin to move.",
        "Rest can be a wise part of progress rather than a sign of surrender.",
        "Being a beginner means there is still plenty of room to grow.",
        "Confidence improves through practice just like any other skill.",
    ],
    "practical": [
        "When the list feels endless, complete the smallest useful task first.",
        "Important decisions are often clearer in the morning than late at night.",
        "Write down an important thought before asking memory to protect it.",
        "A complex problem becomes easier when facts and guesses are separated.",
        "Finishing a quick task now can remove hours of unnecessary worry.",
        "When a conversation stalls, confirm what the other person meant.",
        "Start a new habit at a size that can survive a difficult day.",
        "If focus disappears, close the extra screens and keep one task visible.",
        "A useful record includes both the result and the reason behind it.",
        "Leave a little empty time around plans because real days rarely stay exact.",
    ],
    "work": [
        "A useful meeting ends with clear actions instead of impressive speeches.",
        "Priority should follow real impact rather than the loudest request.",
        "A precise question can solve a blocked task faster than silent effort.",
        "An early warning from a teammate can prevent a much larger problem.",
        "Defining what finished means can remove many rounds of needless revision.",
        "Share the conclusion, the evidence, and the next step in the same note.",
        "Repeated mistakes often reveal a weak process rather than a careless person.",
        "Separate time for focused work from time for messages and replies.",
        "Good feedback shows the next attempt instead of merely judging the last one.",
        "Check difficult work in small stages before errors become expensive.",
    ],
    "humor": [
        "After three alarms, even a sleepy person becomes serious near fresh coffee.",
        "Opening the refrigerator without a plan still counts as a short expedition.",
        "The first day of the week has done nothing wrong, yet everyone continues to question it.",
        "A room often becomes messier during the most ambitious stage of cleaning.",
        "New exercise clothes can look surprisingly athletic before any exercise begins.",
        "Long meetings quietly teach everyone how to check the clock without moving.",
        "A snack becomes most persuasive when the task on screen becomes difficult.",
        "The old password becomes unforgettable immediately after a password change.",
        "Cleaning a drawer reveals missing objects and forgotten plans in equal numbers.",
        "The promise to sleep early grows more philosophical as midnight approaches.",
    ],
    "cinematic": [
        "A closed door is not the end because we can still choose another road.",
        "If we run now the scene will stop, but one more step can change the story.",
        "There may be no right answer, but I am still choosing the people beside me.",
        "As long as one light remains, there is still a path that can lead us home.",
        "We did not lose time as much as we lost the courage to speak honestly.",
        "Do not trust the words final chance because we can still write another scene.",
        "It matters less who arrived first than who is willing to remain at the end.",
        "Letting go would be easier, but I did not come here for an easy ending.",
        "When the whole city became quiet, your voice was the one sound I could find.",
        "If the road behind us is gone, we can at least choose the road ahead.",
    ],
    "science": [
        "The starlight we see tonight began its journey far back in cosmic history.",
        "An octopus has three hearts, and two of them move blood through the gills.",
        "Trees exchange nutrients with fungi living in the soil around their roots.",
        "Thunder arrives after lightning because light travels much faster than sound.",
        "Desert nights cool quickly because the dry air holds very little heat.",
        "The moon moves slightly farther from Earth each year and changes our days.",
        "A memory is partly rebuilt each time the mind brings it back into awareness.",
        "Bees use the direction and speed of a dance to describe a food source.",
        "Many deep sea animals create their own light to communicate or hide.",
        "A large cloud can contain an enormous amount of water despite its gentle shape.",
    ],
    "learning": [
        "Learning begins faster when you can describe exactly what you do not know.",
        "Short sessions repeated over time often build stronger memories than one long session.",
        "Explaining a difficult idea to someone else quickly reveals the missing pieces.",
        "Recording a wrong answer can prevent the same path of thought next time.",
        "A new language becomes familiar through useful phrases before perfect sentences.",
        "People who are willing to ask questions often discover the deeper answer.",
        "Trying to recall a lesson one day later strengthens the path back to it.",
        "A different point of view can reopen a problem when the familiar method fails.",
        "Careful readers mark both the important lines and the parts they do not understand.",
        "Comparing your work with yesterday is usually more useful than comparing it with others.",
    ],
    "relationship": [
        "Gratitude should be spoken aloud even in the relationships that feel most familiar.",
        "Asking how another person feels matters most when you wait patiently for the answer.",
        "A real apology includes a different action instead of a longer explanation.",
        "Different opinions can begin a deeper understanding rather than end a friendship.",
        "A struggling person may need steady company more than immediate advice.",
        "An old friendship remembers the path back even after a long time apart.",
        "Sincerity often appears in the simple habit of keeping a promised time.",
        "Affection grows deeper when it sees a person clearly without trying to reshape them.",
        "The warmth of a conversation depends on how carefully each person listens.",
        "Sharing a small disappointment early can protect a relationship from larger distance.",
    ],
}

KOR_CONTEXTS = [
    "월요일 아침에", "비가 그친 오후에", "계획이 어긋난 날에", "긴 회의가 끝난 뒤에",
    "집으로 돌아가는 길에", "새로운 일을 앞두고", "잠깐 숨을 고르며", "예상 밖의 문제가 생기면",
    "혼자 결정하기 어렵다면", "마감이 가까워질수록", "익숙한 방법이 막히면", "조용한 주말 저녁에",
    "누군가의 도움이 필요할 때", "작은 성공을 만났을 때", "실수가 마음에 남는다면",
    "다시 시작하고 싶은 날에", "답을 찾기 어려운 순간에", "시간이 부족하게 느껴지면",
    "평소와 다른 길을 걷다가", "하루를 마무리하기 전에",
]

ENG_CONTEXTS = [
    "On a quiet Monday morning", "After the rain has passed", "When a careful plan changes",
    "After a long meeting ends", "On the slow journey home", "Before beginning unfamiliar work",
    "While taking a brief pause", "When an unexpected problem appears", "When a choice feels difficult",
    "As a deadline moves closer", "When the familiar method fails", "On a peaceful weekend evening",
    "When help becomes necessary", "After a small success", "When a mistake remains on your mind",
    "On a day meant for starting again", "When the answer remains unclear", "When time begins to feel scarce",
    "While walking along a different road", "Before bringing the day to a close",
]

KOR_CATEGORY_CONTEXTS = {
    "science": [
        "자연을 자세히 관찰하면", "과학의 시선으로 세상을 보면", "알려진 사실을 천천히 살펴보면",
        "보이지 않는 원리를 생각하면", "익숙한 현상을 다시 바라보면", "작은 단서에서 질문을 시작하면",
        "세상이 움직이는 방식을 보면", "오랜 연구의 결과를 살펴보면", "주변의 변화를 주의 깊게 보면",
        "당연하게 여긴 사실을 다시 보면",
    ],
    "relationship": [
        "가까운 사람과 대화할 때", "마음이 서로 엇갈린 순간에는", "오랜 친구를 다시 만났을 때",
        "미안한 마음을 전해야 한다면", "누군가 힘든 하루를 보냈다면", "고마움을 표현하고 싶을 때",
        "의견이 쉽게 좁혀지지 않으면", "익숙함이 무심함으로 바뀌기 전에", "서운한 마음이 생겼다면",
        "좋아하는 사람을 바라볼 때",
    ],
    "humor": [
        "잠이 덜 깬 아침에는", "정리를 시작하고 나면", "회의가 예상보다 길어지면", "운동을 새로 결심하면",
        "간식이 자꾸 생각날 때", "비밀번호를 막 바꾸고 나면", "냉장고 앞에 멈춰 서면",
        "월요일 아침이 찾아오면", "일찍 자겠다고 다짐한 밤에는", "잃어버린 물건을 찾다 보면",
    ],
    "cinematic": [
        "길이 완전히 막힌 순간에도", "모두가 포기하라고 말해도", "마지막 불빛만 남았을 때",
        "돌아갈 길이 사라졌다면", "중요한 선택을 앞두고", "도망칠 기회가 생겼을 때",
        "도시가 갑자기 조용해지면", "끝이라고 믿었던 장면에서", "서로의 손을 놓치기 전에",
        "정답 없는 질문 앞에서도",
    ],
}

ENG_CATEGORY_CONTEXTS = {
    "science": [
        "When nature is observed closely", "When science offers another view", "When a familiar fact is examined again",
        "When we consider an unseen process", "When an ordinary event raises a question", "When a small clue begins an inquiry",
        "When we study how the world moves", "When years of research are considered", "When change is watched carefully",
        "When an accepted fact is questioned again",
    ],
    "relationship": [
        "During a conversation with someone close", "When two people misunderstand each other", "When old friends meet again",
        "When an apology needs to be offered", "When someone has endured a difficult day", "When gratitude needs a voice",
        "When different opinions remain", "Before familiarity becomes carelessness", "When disappointment begins to grow",
        "When we care deeply about someone",
    ],
    "humor": [
        "On a morning that begins too early", "After ambitious cleaning begins", "When a meeting refuses to end",
        "After making a new exercise plan", "When a snack becomes strangely persuasive", "Immediately after changing a password",
        "While standing in front of the refrigerator", "When Monday morning returns", "On a night meant for sleeping early",
        "While searching for one missing object",
    ],
    "cinematic": [
        "When every road appears closed", "Even when everyone says to surrender", "When only one light remains",
        "When the road behind us disappears", "Before an important choice", "When escape becomes possible",
        "When the whole city becomes quiet", "Inside the scene that seemed final", "Before we lose sight of each other",
        "When no answer can be certain",
    ],
}


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (ROOT / "frontend" / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def fetch_rows() -> list[dict[str, object]]:
    env = load_env()
    base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    rows: list[dict[str, object]] = []
    for offset in range(0, 10000, 1000):
        url = f"{base}/rest/v1/sentences?select=id,language,mode,text,is_meme,enabled&order=id&offset={offset}&limit=1000"
        request = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
        with urllib.request.urlopen(request, timeout=45) as response:
            page = json.loads(response.read())
        rows.extend(page)
        if len(page) < 1000:
            break
    return rows


def valid_text(row: dict[str, object]) -> bool:
    text = str(row["text"])
    language = str(row["language"])
    mode = str(row["mode"])
    if language == "kor":
        valid_char = lambda char: 0xAC00 <= ord(char) <= 0xD7A3 or char in " ,.?!"
        valid_word_char = lambda char: 0xAC00 <= ord(char) <= 0xD7A3
    else:
        valid_char = lambda char: char.isascii() and (char.isalpha() or char in " ,.?!")
        valid_word_char = lambda char: char.isascii() and char.isalpha()
    return all(valid_word_char(char) for char in text) if mode == "word" else all(valid_char(char) for char in text)


def normalized(language: str, mode: str, text: str) -> tuple[str, str, str]:
    return language, mode, re.sub(r"\s+", " ", text.strip()).casefold()


def expanded_calm_subjects(language: str) -> list[str]:
    if language == "kor":
        adjectives = ["고요한", "맑은", "느린", "따뜻한", "선선한", "부드러운", "낯선", "익숙한", "작은", "희미한", "반가운", "차분한"]
        nouns = [
            "아침 햇살은", "저녁 바람은", "창가의 빗소리는", "오래된 사진은", "골목의 불빛은",
            "주말의 산책은", "바다의 파도는", "책장의 메모는", "커피 향기는", "새벽 공기는",
            "첫눈 내린 거리는", "나무의 새잎은", "기차의 진동은", "부엌의 온기는", "강물의 반짝임은",
        ]
        moments = [
            "비가 그친 뒤", "회의가 끝난 뒤", "집으로 돌아오는 길에", "잠에서 막 깨어나", "오랜 약속을 마치고",
            "새로운 길을 걷다가", "책장을 천천히 넘기다가", "차를 한 잔 마시며", "불을 낮춘 다음",
            "낯선 동네를 지나다가", "바람 소리에 멈춰서", "해가 기울 무렵", "구름이 걷힌 순간",
            "음악이 끝난 뒤", "한참을 기다리다가",
        ]
        sights = [
            "창가에서 본 햇살은", "골목에서 만난 바람은", "길모퉁이의 작은 꽃은", "유리창의 빗방울은",
            "멀리 켜진 불빛은", "책상 위 짧은 메모는", "하늘에 남은 노을은", "물 위에 번진 달빛은",
            "빈 의자 옆의 온기는", "우편함 속 편지는", "화분 끝의 새잎은", "거리의 느린 그림자는",
            "문틈으로 든 바람은", "정류장의 잔잔한 음악은", "지붕 위 첫눈은",
        ]
        subjects = [f"{moment} {sight}" for moment in moments for sight in sights]
        return [*KOR_SHORT_SUBJECTS, *subjects]

    adjectives = ["Quiet", "Clear", "Gentle", "Warm", "Cool", "Soft", "Unfamiliar", "Familiar", "Small", "Faint", "Welcome", "Peaceful"]
    nouns = [
        "morning light", "evening air", "rain beside the window", "old photograph", "light along the street",
        "weekend walk", "rhythm of the sea", "note inside a book", "scent of coffee", "air before sunrise",
        "street after the first snow", "new leaf on the plant", "motion of the train", "warmth of the kitchen",
        "reflection across the river",
    ]
    moments = [
        "After the rain", "When the meeting ends", "On the journey home", "At the edge of morning",
        "After an old promise", "Along a different road", "While turning a page", "Over a cup of tea",
        "After lowering the lights", "Inside an unfamiliar town", "When the wind becomes audible",
        "Near the end of day", "When the clouds begin to clear", "After the final note", "During a patient wait",
    ]
    sights = [
        "light across the window", "air in the narrow street", "flower beside the road", "rain on the glass",
        "light from distant lamps", "note on the desk", "color left in the sky", "moonlight on the water",
        "warmth beside an empty chair", "letter in the mailbox", "leaf at the edge of a plant",
        "shadow moving across the wall", "breeze beneath the door", "music near the station", "snow above the roofs",
    ]
    subjects = [f"{moment}, the {sight}" for moment in moments for sight in sights]
    return [*ENG_SHORT_SUBJECTS, *subjects]


def build_calm_sentences(language: str) -> list[str]:
    subjects = expanded_calm_subjects(language)
    endings = KOR_SHORT_ENDINGS if language == "kor" else ENG_SHORT_ENDINGS
    if language == "kor":
        return [f"{subject} {ending}." for subject in subjects for ending in endings]
    return [f"{subject} {ending}." for subject in subjects for ending in endings]


def build_clause_pool(language: str) -> list[dict[str, str]]:
    scenes = KOR_SCENES if language == "kor" else ENG_SCENES
    reflections = KOR_REFLECTIONS if language == "kor" else ENG_REFLECTIONS
    closings = KOR_CLOSINGS if language == "kor" else ENG_CLOSINGS
    style_seeds = KOR_STYLE_SEEDS if language == "kor" else ENG_STYLE_SEEDS
    default_contexts = KOR_CONTEXTS if language == "kor" else ENG_CONTEXTS
    category_contexts = KOR_CATEGORY_CONTEXTS if language == "kor" else ENG_CATEGORY_CONTEXTS
    pool = [{"category": "calm", "text": text} for text in build_calm_sentences(language)]
    pool.extend({"category": "everyday", "text": text} for text in scenes)
    pool.extend({"category": "reflection", "text": text} for text in reflections)
    pool.extend({"category": "motivation", "text": text} for text in closings)

    for category, seeds in style_seeds.items():
        contexts = category_contexts.get(category, default_contexts)
        pool.extend({"category": category, "text": seed} for seed in seeds)
        for context in contexts:
            for seed in seeds:
                continuation = seed if language == "kor" else seed[0].lower() + seed[1:]
                pool.append({"category": category, "text": f"{context}, {continuation}"})
        for first_index, first in enumerate(seeds):
            for second_index, second in enumerate(seeds):
                if first == second:
                    continue
                first_clause = first[:-1]
                if language == "kor":
                    paired = f"{first_clause}, 그리고 {second}"
                else:
                    continuation = second[0].lower() + second[1:]
                    paired = f"{first_clause}, and {continuation}"
                pool.append({"category": category, "text": paired, "paired": "true"})
                for context_index, context in enumerate(contexts):
                    variant = (first_index + second_index + context_index) % 4
                    if language == "kor":
                        if variant == 0:
                            contextual_pair = f"{context}, {first_clause}, 그리고 {second}"
                        elif variant == 1:
                            contextual_pair = f"{context}, {first} {second}"
                        elif variant == 2:
                            contextual_pair = f"{first} {context}, {second}"
                        else:
                            contextual_pair = f"{context}, {first_clause}. 동시에 {second}"
                    else:
                        first_continuation = first[0].lower() + first[1:]
                        second_continuation = second[0].lower() + second[1:]
                        if variant == 0:
                            contextual_pair = f"{context}, {first_clause[0].lower() + first_clause[1:]}, and {second_continuation}"
                        elif variant == 1:
                            contextual_pair = f"{context}, {first_continuation} {second}"
                        elif variant == 2:
                            contextual_pair = f"{first} {context}, {second_continuation}"
                        else:
                            contextual_pair = f"{context}, {first_continuation} At the same time, {second_continuation}"
                    pool.append({
                        "category": category,
                        "text": contextual_pair,
                        "paired": "true",
                    })

    unique: dict[str, dict[str, str]] = {}
    for item in pool:
        unique.setdefault(re.sub(r"\s+", " ", item["text"].strip()).casefold(), item)
    result = list(unique.values())
    RNG.shuffle(result)
    return result


def prefix_key(language: str, text: str) -> str:
    normalized_text = re.sub(r"\s+", " ", text.strip()).casefold()
    if language == "kor":
        return normalized_text[:18]
    return " ".join(normalized_text.split()[:6])


def core_key(language: str, text: str) -> str:
    if language == "kor":
        contexts = [*KOR_CONTEXTS, *(value for values in KOR_CATEGORY_CONTEXTS.values() for value in values)]
    else:
        contexts = [*ENG_CONTEXTS, *(value for values in ENG_CATEGORY_CONTEXTS.values() for value in values)]
    normalized_text = re.sub(r"\s+", " ", text.strip()).casefold()
    for context in contexts:
        prefix = f"{context}, ".casefold()
        if normalized_text.startswith(prefix):
            return normalized_text[len(prefix):]
    return normalized_text


def select_short_sentences(
    language: str,
    count: int,
    pool: list[dict[str, str]],
    occupied: set[tuple[str, str, str]],
    used_clauses: set[str],
    core_usage: Counter[str],
) -> tuple[list[str], list[str]]:
    categories = sorted({item["category"] for item in pool})
    buckets = {category: [item for item in pool if item["category"] == category] for category in categories}
    for values in buckets.values():
        RNG.shuffle(values)
    prefixes: Counter[str] = Counter()
    selected: list[str] = []
    styles: list[str] = []
    cursor = 0
    while len(selected) < count:
        category = categories[cursor % len(categories)]
        cursor += 1
        found = None
        while buckets[category]:
            item = buckets[category].pop()
            text = item["text"]
            length = len(text)
            if item.get("paired") == "true":
                continue
            if not ((language == "kor" and 12 <= length <= 75) or (language == "eng" and 18 <= length <= 140)):
                continue
            clause_key = re.sub(r"\s+", " ", text.strip()).casefold()
            core = core_key(language, text)
            prefix = prefix_key(language, text)
            if clause_key in used_clauses or prefixes[prefix] >= 2 or core_usage[core] >= 3:
                continue
            if normalized(language, "short", text) in occupied:
                continue
            found = item
            break
        if found is None:
            if cursor > count * len(categories) * 4:
                raise RuntimeError(f"Not enough diverse {language}/short candidates: {len(selected)}/{count}")
            continue
        text = found["text"]
        occupied.add(normalized(language, "short", text))
        used_clauses.add(re.sub(r"\s+", " ", text.strip()).casefold())
        core_usage[core_key(language, text)] += 1
        prefixes[prefix_key(language, text)] += 1
        selected.append(text)
        styles.append(category)
    return selected, styles


def select_long_sentences(
    language: str,
    count: int,
    pool: list[dict[str, str]],
    occupied: set[tuple[str, str, str]],
    used_clauses: set[str],
    core_usage: Counter[str],
) -> tuple[list[str], list[str]]:
    categories = sorted({item["category"] for item in pool})
    buckets = {category: [item for item in pool if item["category"] == category] for category in categories}
    for values in buckets.values():
        RNG.shuffle(values)
    prefixes: set[str] = set()
    selected: list[str] = []
    styles: list[str] = []
    cursor = 0
    while len(selected) < count:
        category = categories[cursor % len(categories)]
        cursor += 1
        direct = None
        deferred: list[dict[str, str]] = []
        while buckets[category]:
            item = buckets[category].pop()
            text = item["text"]
            length = len(text)
            long_enough = (85 <= length <= 300) if language == "kor" else (148 <= length <= 390)
            core = core_key(language, text)
            if (
                item.get("paired") == "true"
                and long_enough
                and core_usage[core] == 0
                and prefix_key(language, text) not in prefixes
                and normalized(language, "long", text) not in occupied
            ):
                direct = item
                break
            deferred.append(item)
        buckets[category][:0] = deferred
        if direct is not None:
            text = direct["text"]
            occupied.add(normalized(language, "long", text))
            prefixes.add(prefix_key(language, text))
            used_clauses.add(re.sub(r"\s+", " ", text.strip()).casefold())
            core_usage[core_key(language, text)] += 1
            selected.append(text)
            styles.append(category)
            continue

        chosen: list[dict[str, str]] = []
        deferred = []
        while buckets[category] and len(chosen) < 3:
            item = buckets[category].pop()
            text = item["text"]
            clause_key = re.sub(r"\s+", " ", text.strip()).casefold()
            core = core_key(language, text)
            if clause_key in used_clauses or core_usage[core] >= 4:
                continue
            if len(text) > (86 if language == "kor" else 132):
                deferred.append(item)
                continue
            if not chosen and prefix_key(language, text) in prefixes:
                deferred.append(item)
                continue
            chosen.append(item)
        buckets[category][:0] = deferred
        if len(chosen) < 3:
            buckets[category].extend(chosen)
            RNG.shuffle(buckets[category])
            if cursor > count * len(categories) * 5:
                raise RuntimeError(f"Not enough diverse {language}/long clauses: {len(selected)}/{count}")
            continue
        text = " ".join(item["text"] for item in chosen)
        length = len(text)
        valid_length = (85 <= length <= 300) if language == "kor" else (148 <= length <= 390)
        if not valid_length or normalized(language, "long", text) in occupied:
            buckets[category].extend(chosen)
            RNG.shuffle(buckets[category])
            continue
        occupied.add(normalized(language, "long", text))
        prefixes.add(prefix_key(language, text))
        for item in chosen:
            used_clauses.add(re.sub(r"\s+", " ", item["text"].strip()).casefold())
            core_usage[core_key(language, item["text"])] += 1
        selected.append(text)
        styles.append(category)
    return selected, styles


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    rows = fetch_rows()
    old_manifest = json.loads(MANIFEST_0044.read_text(encoding="utf-8"))
    previous_refresh = (
        json.loads(MANIFEST_0045.read_text(encoding="utf-8"))
        if MANIFEST_0045.exists()
        else []
    )
    previous_ids = {int(row["id"]) for row in previous_refresh}
    migration_old_text = {int(row["id"]): str(row["old_text"]) for row in previous_refresh}
    literature = {
        normalized(str(row["language"]), str(row["mode"]), str(row["text"]))
        for row in old_manifest
        if row["mode"] != "word"
    }
    replacements = [
        row for row in rows
        if int(row["id"]) in previous_ids
        or normalized(str(row["language"]), str(row["mode"]), str(row["text"])) in literature
        or not valid_text(row)
    ]
    replaced_ids = {int(row["id"]) for row in replacements}
    occupied = {
        normalized(str(row["language"]), str(row["mode"]), str(row["text"]))
        for row in rows if int(row["id"]) not in replaced_ids
    }

    generated: dict[tuple[str, str], list[str]] = {}
    generated_styles: dict[tuple[str, str], list[str]] = {}
    for language in ("kor", "eng"):
        pool = build_clause_pool(language)
        used_clauses: set[str] = set()
        core_usage: Counter[str] = Counter()
        short_count = sum(1 for row in replacements if row["language"] == language and row["mode"] == "short")
        long_count = sum(1 for row in replacements if row["language"] == language and row["mode"] == "long")
        shorts, short_styles = select_short_sentences(language, short_count, pool, occupied, used_clauses, core_usage)
        longs, long_styles = select_long_sentences(language, long_count, pool, occupied, used_clauses, core_usage)
        generated[(language, "short")] = shorts
        generated[(language, "long")] = longs
        generated_styles[(language, "short")] = short_styles
        generated_styles[(language, "long")] = long_styles

    output: list[dict[str, object]] = []
    indexes: Counter[tuple[str, str]] = Counter()
    for row in replacements:
        key = (str(row["language"]), str(row["mode"]))
        index = indexes[key]
        indexes[key] += 1
        output.append({
            **row,
            "old_text": migration_old_text.get(int(row["id"]), str(row["text"])),
            "text": generated[key][index],
            "style": generated_styles[key][index],
        })

    if any(not valid_text(row) for row in output):
        raise RuntimeError("Generated text contains a disallowed character")
    new_keys = [normalized(str(row["language"]), str(row["mode"]), str(row["text"])) for row in output]
    if len(new_keys) != len(set(new_keys)):
        raise RuntimeError("Generated text contains duplicates")

    MANIFEST_0045.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_0045.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "-- Replace public-domain excerpts and hard-to-type characters with original modern prose.",
        "-- Matches the old text so sentence ids and score-verification references remain stable.",
        "begin;",
        "",
        "create temporary table typenews_content_refresh_0045 (",
        "  language text not null,",
        "  mode text not null,",
        "  old_text text not null,",
        "  new_text text not null",
        ") on commit drop;",
        "",
        "insert into typenews_content_refresh_0045 (language, mode, old_text, new_text)",
        "values",
    ]
    for index, row in enumerate(output):
        suffix = "," if index < len(output) - 1 else ";"
        lines.append(
            f"    ({sql_literal(str(row['language']))}, {sql_literal(str(row['mode']))}, "
            f"{sql_literal(str(row['old_text']))}, {sql_literal(str(row['text']))}){suffix}"
        )
    lines.extend([
        "update public.sentences as sentence",
        "set text = case",
        "  when sentence.language = 'kor' then '임시문장' || sentence.id::text",
        "  else 'temporary sentence ' || sentence.id::text",
        "end",
        "from typenews_content_refresh_0045 as replacement",
        "where sentence.language = replacement.language",
        "  and sentence.mode = replacement.mode",
        "  and sentence.text = replacement.old_text;",
        "",
        "update public.sentences as sentence",
        "set text = replacement.new_text",
        "from typenews_content_refresh_0045 as replacement",
        "where sentence.language = replacement.language",
        "  and sentence.mode = replacement.mode",
        "  and sentence.text = case",
        "    when sentence.language = 'kor' then '임시문장' || sentence.id::text",
        "    else 'temporary sentence ' || sentence.id::text",
        "  end;",
        "",
        "commit;",
        "",
    ])
    MIGRATION_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(json.dumps({
        "replacements": len(output),
        "counts": {f"{language}/{mode}": count for (language, mode), count in sorted(indexes.items())},
        "migration": str(MIGRATION_PATH),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
