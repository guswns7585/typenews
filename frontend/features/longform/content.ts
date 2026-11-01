import { MORE_LONGFORM } from "./content-more";
import { CLASSIC_LONGFORM } from "./content-classics";

export type LongformText = {
  id: string;
  title: string;
  language: "kor" | "eng";
  body: string;
};

/** Original essays written for TypeNews. Content revisions invalidate saved progress. */
export const BUILTIN_LONGFORM: LongformText[] = [
  {
    id: "longform:typenews:kor-workbench-v1", language: "kor", title: "책상 위의 작은 작업실",
    body: `토요일 아침에는 알람보다 먼저 눈이 떠졌다. 창밖은 아직 흐렸고 방 안에는 어제 마시다 남은 차의 향이 희미하게 남아 있었다. 나는 책상 한가운데 놓인 키보드를 옆으로 밀고 작은 천을 펼쳤다. 오늘 해야 할 일은 고장 난 물건을 고치는 것이 아니었다. 이미 잘 작동하는 물건을 내 손에 조금 더 잘 맞도록 바꾸는 일이었다.

처음 이 취미를 시작했을 때는 모든 선택에 정답이 있다고 생각했다. 가장 좋은 스위치와 가장 좋은 보강판을 찾아 한 번에 조립하면 다시는 손댈 필요가 없을 줄 알았다. 하지만 같은 부품으로 만든 키보드도 책상과 자세, 손의 힘에 따라 다르게 느껴졌다. 다른 사람이 들려준 멋진 소리가 내 방에서는 낯선 울림이 되기도 했다. 정답을 찾는 일보다 내가 무엇을 좋아하는지 알아가는 일이 먼저라는 사실을 천천히 배웠다.

상자를 열자 작은 부품들이 제자리를 기다리고 있었다. 핀셋과 드라이버를 가까이 두고 나사는 잃어버리지 않도록 접시에 모았다. 부품 하나를 들어 빛에 비추어 보니 평소에는 보이지 않던 흔적이 드러났다. 자주 누른 자리에는 반짝임이 있었고 오래 만지지 않은 모서리에는 먼지가 앉아 있었다. 물건은 사용한 시간을 설명하지 않아도 그 흔적을 조용히 간직하고 있었다.

작업을 서두르면 꼭 같은 곳에서 실수가 났다. 나사를 너무 세게 조이거나 부품의 방향을 확인하지 않은 채 다음 단계로 넘어갔다. 그래서 이번에는 한 단계를 끝낼 때마다 손을 멈추었다. 부품이 제대로 놓였는지 살피고 책상 위의 작은 조각들을 다시 세었다. 잠깐 멈추는 시간이 전체 작업을 느리게 만드는 것 같지만 오히려 다시 뜯는 일을 줄여 주었다.

한 시간쯤 지나자 창으로 햇빛이 들어왔다. 나는 완성된 키보드를 컴퓨터에 연결하고 빈 문서를 열었다. 첫 문장은 무엇을 쓸지 고민하다가 오늘 아침에 본 풍경을 적었다. 소리는 예상보다 작았고 손끝에는 부드러운 저항이 남았다. 몇 줄을 더 쓰자 작업하느라 굳었던 어깨가 풀렸다. 조립을 마쳤다는 사실보다 이 물건으로 다시 글을 쓰게 되었다는 사실이 더 기뻤다.

문장 하나를 적을 때마다 작은 차이가 느껴졌다. 짧게 누르면 가벼운 소리가 났고 힘을 조금 더 주면 책상 아래로 낮은 울림이 번졌다. 나는 같은 단어를 여러 번 쓰며 어느 쪽이 편안한지 살폈다. 타수가 높아지는 것보다 손에 힘이 덜 들어가는 순간이 좋았다. 손끝을 의식하지 않아도 생각이 문장으로 이어질 때 비로소 작업이 끝났다는 느낌이 들었다.

점심 무렵 친구에게 사진을 한 장 보냈다. 친구는 색이 예쁘다고 답했고 나는 보이지 않는 부품에 관해 길게 설명하려다가 웃고 말았다. 좋아하는 물건을 설명할 때는 언제나 말이 많아진다. 하지만 모든 사람이 같은 이유로 그 물건을 좋아할 필요는 없다. 누군가는 색을 보고 누군가는 소리를 들으며 또 누군가는 오래된 기억을 떠올린다. 서로 다른 이유가 모여 하나의 취미를 더 넓게 만든다.

남은 부품을 정리하면서 오늘 바꾼 내용을 작은 공책에 적었다. 다음에 무엇을 바꿀지 정하기 위한 기록이기도 했지만 지금의 만족을 잊지 않기 위한 기록이기도 했다. 시간이 지나면 새로운 부품이 눈에 들어오고 더 좋은 조합이 있다는 이야기를 듣게 될 것이다. 그때에도 오늘의 손끝이 편안했다는 사실까지 사라지는 것은 아니다. 완성은 영원히 손대지 않는 상태가 아니라 잠시 충분하다고 느끼는 순간일지도 모른다.

나는 창문을 열고 책상에 남은 먼지를 닦았다. 공구가 사라진 자리에는 키보드와 공책, 아직 따뜻한 차 한 잔만 남았다. 오후에는 아무것도 바꾸지 않고 글을 써 보기로 했다. 잘 만든 물건의 다음 이야기는 그것을 사용하는 시간에서 시작된다. 커서는 빈 줄에서 조용히 깜빡였고 나는 다음 문장을 천천히 입력했다.`,
  },
  {
    id: "longform:typenews:kor-evening-v1", language: "kor", title: "한 정거장 먼저 내린 날",
    body: `집으로 가는 버스가 익숙한 교차로에 멈췄다. 창에는 저녁빛과 실내등이 겹쳐 비쳤고 사람들은 저마다 다른 화면을 내려다보고 있었다. 나는 다음 정류장을 알리는 안내를 듣고 평소보다 한 정거장 먼저 내렸다. 특별한 이유는 없었다. 하루 종일 의자에 앉아 있었으니 조금 걷고 싶었고 늘 지나치던 골목이 그날따라 궁금했다.

버스가 떠난 뒤에는 주변 소리가 뜻밖에 선명해졌다. 가게 문 위의 종이 울렸고 건널목에서는 작은 신호음이 반복되었다. 멀리서 들려오는 식당의 그릇 소리 사이로 누군가 자전거를 세우는 소리가 섞였다. 화면을 보고 있을 때는 모두 하나의 배경이었던 소리들이 걷기 시작하자 각자의 자리를 찾았다. 나는 이어폰을 주머니에 넣고 천천히 발을 옮겼다.

골목 입구에는 오래된 문구점이 있었다. 유리문 안쪽에 걸린 달력은 이번 달을 가리키고 있었지만 진열대의 색종이와 지우개는 어린 시절과 별로 다르지 않았다. 주인은 계산대 옆에서 작은 상자를 접고 있었다. 나는 공책 한 권을 골라 들었다가 종이가 넘어가는 소리에 귀를 기울였다. 아무것도 적히지 않은 종이는 해야 할 일을 재촉하기보다 무엇이든 시작할 수 있다는 여유를 주었다.

공책을 사서 나오자 바람이 조금 차가워져 있었다. 주머니 속 전화기가 짧게 울렸지만 나는 다음 모퉁이까지 확인하지 않기로 했다. 답장을 몇 분 늦춘다고 달라질 일은 많지 않았다. 반면 그 몇 분 동안 보게 되는 풍경은 지금 이 자리에서만 만날 수 있었다. 길가의 나뭇잎 끝이 흔들리고 있었고 웅덩이에는 간판의 불빛이 길게 누워 있었다.

공원에는 서로 다른 속도로 저녁을 보내는 사람들이 모여 있었다. 운동장을 빠르게 도는 사람 옆으로 천천히 걷는 사람이 지나갔다. 벤치에 앉은 두 사람은 아무 말 없이 같은 방향을 바라보고 있었다. 나는 빈 벤치 끝에 잠시 앉아 신발 끈을 고쳐 묶었다. 조금 전까지 머릿속에서 뒤섞이던 일들이 한 걸음씩 떨어져 제 크기로 돌아오는 것 같았다.

집까지 남은 거리를 지도에서 확인하려다가 그냥 걸어 보기로 했다. 길을 잘못 들더라도 크게 돌아가지는 않을 동네였다. 익숙한 곳에서조차 모든 선택을 가장 빠른 길에 맞출 필요는 없었다. 나는 밝은 큰길 대신 작은 빵집이 있는 길을 골랐다. 문을 열자 따뜻한 공기와 함께 빵 굽는 냄새가 나왔다. 저녁으로 먹을 빵 하나와 내일 아침을 위한 빵 하나를 종이봉투에 담았다.

계산을 기다리는 동안 나는 오늘 있었던 일을 순서대로 떠올렸다. 아침의 조급함과 점심의 짧은 대화, 끝내지 못한 작업이 하나씩 생각났다. 그중에는 잘한 일도 있었고 아쉬운 일도 있었다. 모두 같은 무게로 들고 집에 갈 필요는 없다는 생각이 들었다. 내일 다시 볼 수 있는 일은 내일의 책상 위에 남겨 두어도 괜찮았다. 지금 손에 든 봉투의 온기만큼은 오늘 저녁의 것이었다.

아파트 입구에 도착했을 때 하늘은 거의 어두워져 있었다. 평소보다 늦게 돌아왔지만 시간을 잃었다는 느낌은 들지 않았다. 오히려 출발할 때는 없었던 장면들을 몇 개 더 가지고 온 기분이었다. 엘리베이터의 거울 속에는 종이봉투와 작은 공책을 든 내가 서 있었다. 한 정거장 일찍 내렸을 뿐인데 하루의 마지막 부분이 다른 모양으로 접혀 있었다.

방에 들어와 책상 위에 공책을 놓았다. 첫 장에는 오늘 지나온 길을 짧게 적었다. 문구점의 종소리와 공원의 바람, 빵집에서 기다리던 시간을 떠올리며 문장을 이어 갔다. 기억을 정확히 복원하려고 애쓰지는 않았다. 지금 남아 있는 것부터 기록하면 충분했다. 오늘을 잘 보냈다는 대단한 결론 대신 나는 한 문장을 남겼다. 돌아가는 길을 조금 늦추면 지나치던 풍경도 하루의 일부가 된다.`,
  },
  {
    id: "longform:typenews:eng-workbench-v1", language: "eng", title: "A Small Workshop on the Desk",
    body: `On Saturday morning, I cleared a space in the middle of my desk. A keyboard, a folded cloth, and a small tray of tools were all I needed. Nothing was broken. I simply wanted to understand why an object I used every day could feel so different after one small change.

When I first became interested in keyboards, I thought every question had a single correct answer. There would be a best switch, a best plate, and a perfect way to assemble them. I imagined that finding those parts would end the search. Instead, each experiment taught me something about my own hands, my desk, and the way I liked to work.

I placed the screws in a shallow dish and arranged the parts in the order I removed them. Working slowly made the process easier to remember. Whenever I hurried, I skipped a detail and had to open everything again. A short pause between steps turned out to save more time than a faster pair of hands.

Light moved across the room while I worked. The keys that I used most often had a faint shine. Dust had gathered along an edge that my fingers never touched. These small marks were a record of ordinary days. The keyboard had been present for messages to friends, unfinished drafts, late decisions, and quiet mornings with an empty document.

After putting the case back together, I opened a blank page and typed a description of the room. The sound was softer than I had expected. More importantly, I no longer thought about how hard I was pressing. My hands settled into a rhythm, and the sentences began to arrive without much effort.

I sent a photograph to a friend, who replied that the colors looked good. For a moment, I wanted to explain every hidden part. Then I realized that the visible colors were a perfectly good reason to enjoy the picture. A shared interest does not require identical preferences. One person notices a sound, another a shape, and someone else remembers a keyboard from years ago.

Before putting the tools away, I wrote down what I had changed. The note would help with the next experiment, but it also preserved something easier to forget: this version felt comfortable today. A new part might catch my attention next month. That would not make this morning's satisfaction less real.

By lunchtime, the desk was clear again. I made a fresh cup of tea and decided to spend the afternoon using what I had built. The next chapter of an object begins when the work on it stops for a while. A cursor blinked on the page, and I reached for the first word.`,
  },
  {
    id: "longform:typenews:eng-walk-v1", language: "eng", title: "One Stop Before Home",
    body: `The bus stopped at a familiar intersection just as the evening lights came on. Reflections filled the window, and most of the passengers were looking at their phones. I put mine in my pocket and stepped outside one stop before home. I had no special plan. I only wanted to see the streets I usually passed without noticing.

Once the bus moved away, separate sounds emerged from the background. A bell rang above a shop door. Someone wheeled a bicycle across the pavement. Plates touched each other in a restaurant kitchen. Walking gave these ordinary sounds enough space to become distinct, and I left my headphones in my bag.

At the corner stood a small stationery shop. Its window held notebooks, pencils, and packets of colored paper. I went inside and chose a plain notebook with a flexible cover. Turning the empty pages felt unexpectedly pleasant. They did not insist that I produce something important. They simply left room for a beginning.

Outside, the air had grown cooler. My phone vibrated, but I decided to wait until the next corner before reading the message. Most replies could survive a few extra minutes. The light on the wet pavement would not stay the same for very long. I watched a reflection stretch beneath a shop sign, then break as a person walked through it.

People in the park were moving at different speeds. A runner passed a couple who were walking slowly. Two friends sat on a bench without speaking. I stopped to tie a loose shoelace and found that the unfinished tasks in my head had become quieter. They were still there, but they no longer occupied the entire evening.

I almost opened a map to check the fastest route home. Then I chose a side street that led past a bakery. A warm smell met me at the door. I bought one roll for dinner and another for breakfast, and held the paper bag carefully while I waited for the crossing signal.

The walk had not solved anything dramatic. It had given the day a different ending. I arrived later than usual, carrying a notebook, a warm bag, and several small scenes I would otherwise have missed. None of them was important enough to become news, but together they made the evening feel like something I had actually experienced.

At my desk, I opened the notebook and wrote down a few details. I did not try to reconstruct every moment. The shop bell, the park, and the warm paper bag were enough. Sometimes a good record begins with attention rather than a conclusion. I left the last line unfinished for a moment, listening to the quiet room before adding one more sentence.`,
  },
  ...MORE_LONGFORM,
  ...CLASSIC_LONGFORM,
];
