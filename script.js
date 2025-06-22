// ✅ 전역 변수
let sentences = [];
let newsList = [];
let currentSentence = "";
let previousSentence = "";
let count = 0;
let currentLang = "kor";
let startTime = null;
let currentAccuracy = 0;
let results = [];
let lastTypingRecord = {};

// ✅ DOM 요소
const sentenceEl = document.getElementById("sentence");
const inputEl = document.getElementById("input");
const speedEl = document.getElementById("speed");
const accuracyEl = document.getElementById("accuracy");
const countEl = document.getElementById("count");
const newsLinkEl = document.getElementById("news-link");
const thumbnailContainer = document.getElementById("thumbnail-container");
const toggleBtn = document.getElementById("toggle-theme");
const dropdownBtn = document.getElementById("newsDropdownBtn");
const dropdown = dropdownBtn.closest(".dropdown");

// ✅ 자동 높이 조절
function autoResizeInput() {
  inputEl.style.height = "auto";
  inputEl.style.height = inputEl.scrollHeight + "px";
}

// ✅ 텍스트 정제
function decodeHTMLEntities(text) {
  const txt = document.createElement("textarea");
  txt.innerHTML = text;
  return txt.value;
}

function cleanText(text) {
  return decodeHTMLEntities(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\r\n]/g, " ")
    .replace(/[^\p{L}\p{N} .,!?'"“”‘’]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ✅ 문장 로딩
function fetchSentences(lang) {
  fetch(`${lang}.json`)
    .then(res => res.json())
    .then(data => {
      sentences = data;
      newsList = [];
      pickAndRenderNewSentence();
    })
    .catch(err => console.error("문장 로딩 실패:", err));
}

function fetchRSSNews(url) {
  const proxy = 'https://corsproxy.io/?url=';

  fetch(proxy + encodeURIComponent(url))
    .then(res => {
      if (!res.ok) throw new Error("RSS 요청 실패");
      return res.text();
    })
    .then(xml => {
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      let items = [...doc.querySelectorAll("item")].slice(0, 10).filter(item => {
        const title = cleanText(item.querySelector("title")?.textContent || "");
        return !["클로징", "closing"].includes(title.toLowerCase());
      });

      const isKoreanNews = url.includes("sbs.co.kr");

      newsList = items.map(item => {
        const title = cleanText(item.querySelector("title")?.textContent || "");
        const link = item.querySelector("link")?.textContent || "";

        let image = "";
        const thumbnail = item.getElementsByTagName("media:thumbnail")[0];
        const enclosure = item.getElementsByTagName("enclosure")[0];
        if (thumbnail?.getAttribute("url")) image = thumbnail.getAttribute("url");
        else if (enclosure?.getAttribute("url")) image = enclosure.getAttribute("url");

        let summary = "";
        if (isKoreanNews) {
          const content = item.getElementsByTagName("content:encoded")[0]?.textContent || "";
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = content;
          const paragraphs = [...tempDiv.querySelectorAll("p.change")].map(p => cleanText(p.textContent)).filter(p => p.length > 10);
          summary = paragraphs.slice(0, 2).join(" ");
        } else {
          const desc = cleanText(item.querySelector("description")?.textContent || "");
          const sentences = desc.split(/(?<=[.?!])\s+/);
          summary = sentences.find(s => s.length <= 200) || sentences[0].slice(0, 200);
        }

        return { sentence: `${title}\n\n${summary}`, link, image };
      });

      sentences = newsList.map(n => n.sentence);
      pickAndRenderNewSentence();
    })
    .catch(err => {
      console.error("뉴스 로딩 실패:", err);
      alert("뉴스 로딩 중 오류 발생");
    });
}

// ✅ 문장 렌더링
function pickAndRenderNewSentence() {
  if (sentences.length === 0) return;

  let index, sentenceData, attempts = 0;
  do {
    index = Math.floor(Math.random() * sentences.length);
    sentenceData = sentences[index];
    attempts++;
  } while (sentenceData === previousSentence && attempts < 10);

  previousSentence = sentenceData;
  const newsItem = newsList[index] || {};
  const imgUrl = newsItem.image || "";

  if (sentenceData.includes("\n\n")) {
    const [title, body] = sentenceData.split("\n\n");
    currentSentence = body;
    sentenceEl.innerHTML = `
      <div class="news-container" style="display:flex; gap: 16px; align-items: flex-start;">
        <div class="news-text" style="margin-top: -70px;">
          <div class="news-title">${title}</div>
          <div class="news-body">${[...body].map(ch => `<span>${ch}</span>`).join('')}</div>
        </div>
      </div>
    `;
  } else {
    currentSentence = sentenceData;
    sentenceEl.innerHTML = [...currentSentence].map(ch => `<span>${ch}</span>`).join('');
  }

  // 기존 코드
const newsOriginalLink = document.getElementById("news-original-link");
const milestoneTextEl = document.getElementById("milestone-text");

// 링크가 있을 경우에만 링크 보이기
if (newsItem.link) {
  newsOriginalLink.href = newsItem.link;
  newsOriginalLink.style.visibility = "visible";
} else {
  newsOriginalLink.href = "#";
  newsOriginalLink.style.visibility = "hidden";  // ✅ 자리 유지됨
}


// milestoneTextEl은 항상 유지 (display 조작 X)

  if (imgUrl) {
    thumbnailContainer.style.display = "block";
    thumbnailContainer.innerHTML = `<img src="${imgUrl}" alt="뉴스 썸네일" loading="lazy" />`;
  } else {
    thumbnailContainer.style.display = "none";
    thumbnailContainer.innerHTML = "";
  }

  inputEl.value = "";
  startTime = null;
  currentAccuracy = 0;
  speedEl.textContent = currentLang === "kor" ? "0 CPM" : "0 WPM";
  accuracyEl.textContent = "0";
  autoResizeInput();
}

// ✅ 입력 처리
function updateHighlight() {
  const input = inputEl.value;
  const target = currentSentence;
  const spans = sentenceEl.querySelectorAll(".news-body span, #sentence span");

  let correct = 0;
  for (let i = 0; i < spans.length; i++) {
    const typed = input[i];
    const expected = target[i];

    if (typed == null) spans[i].className = "";
    else if (i === input.length - 1 && typed !== expected) spans[i].className = "";
    else if (typed === expected) {
      spans[i].className = "correct";
      correct++;
    } else {
      spans[i].className = "incorrect";
    }
  }

  const total = input.length;
  const minutes = (Date.now() - startTime) / 1000 / 60;
  currentAccuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  accuracyEl.textContent = currentAccuracy;

  if (minutes > 0) {
    const speed = currentLang === "kor"
      ? `${Math.round(total / minutes)} CPM`
      : `${Math.round((total / 5) / minutes)} WPM`;
    speedEl.textContent = speed;
  }
}

function updateProgress() {
  const progressEl = document.getElementById("progress-bar");
  const percent = Math.min((inputEl.value.length / currentSentence.length) * 100, 100);
  progressEl.style.width = `${percent}%`;
}

function saveCurrentResult() {
  const minutes = (Date.now() - startTime) / 1000 / 60;
  const typedLength = inputEl.value.length;
  const speed = currentLang === "kor"
    ? `${Math.round(typedLength / minutes)} CPM`
    : `${Math.round((typedLength / 5) / minutes)} WPM`;

  lastTypingRecord = {
    sentence: currentSentence,
    accuracy: currentAccuracy,
    speed: speed,
  };

  const recordEl = document.getElementById("last-record");
  if (recordEl) {
    recordEl.innerHTML = `
      <div><strong>sentence: </strong> ${lastTypingRecord.sentence}</div>
      <div><strong>accuracy: </strong> ${lastTypingRecord.accuracy}%</div>
      <div><strong>CPM: </strong> ${lastTypingRecord.speed}</div>
    `;
  }
}

// ✅ 이벤트 바인딩
inputEl.addEventListener("input", () => {
  if (!startTime) startTime = Date.now();
  updateHighlight();
  updateProgress();
  autoResizeInput();
});

inputEl.addEventListener("keydown", (e) => {
  const isEnter = e.key === "Enter";
  const isSpace = e.code === "Space";
  const isComplete = inputEl.value.length >= currentSentence.length;

  if ((isEnter || (isSpace && isComplete)) && currentAccuracy >= 80) {
    e.preventDefault();
    saveCurrentResult();
    inputEl.blur();
    setTimeout(() => {
  pickAndRenderNewSentence();
  count++;
  countEl.textContent = count;

  if (count % 100 === 0) {
    const idx = (count / 100) - 1; // 0부터 시작하는 인덱스
    showMilestoneMessage(idx);
  }

  inputEl.focus();
}, 20);

  } else if ((isEnter || isSpace) && currentAccuracy < 80) {
    alert("정확도 80% 이상일 때만 다음 문장으로 넘어갑니다.");
  }

  if (e.key === "Escape") {
    inputEl.value = "";
    updateHighlight();
    autoResizeInput();
  }
});

toggleBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("darkMode", document.body.classList.contains("dark"));
  toggleBtn.textContent = document.body.classList.contains("dark") ? "☀️ 라이트모드" : "🌙 다크모드";
});

document.addEventListener("click", () => inputEl.focus());

// ✅ 언어 & 섹터 선택
const sectorNames = {
  all: "전체",
  politics: "정치",
  economy: "경제",
  society: "사회",
  global: "국제",
  culture: "문화",
  entertainment: "연예",
  sports: "스포츠"
};

document.querySelectorAll(".dropdown-content div").forEach(item => {
  item.addEventListener("click", () => {
    const sector = item.getAttribute("data-sector");
    currentLang = "kor";
    count = 0;
    countEl.textContent = "0";
    document.getElementById("newsDropdownBtn").textContent = `뉴스(${sectorNames[sector] || "전체"}) ▼`;

    const sectorMap = {
      politics: "01",
      economy: "02",
      society: "03",
      global: "07",
      culture: "08",
      entertainment: "14",
      sports: "09"
    };

    const url = sector === "all"
      ? "https://news.sbs.co.kr/news/headlineRssFeed.do"
      : `https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=${sectorMap[sector]}`;

    fetchRSSNews(url);
  });
});

document.getElementById("langKor").addEventListener("click", () => {
  currentLang = "kor";
  count = 0;
  countEl.textContent = "0";
  thumbnailContainer.style.display = "none";
  fetchSentences("kor");
});

document.getElementById("langEng").addEventListener("click", () => {
  currentLang = "eng";
  count = 0;
  countEl.textContent = "0";
  thumbnailContainer.style.display = "none";
  fetchSentences("eng");
});

document.getElementById("langNews").addEventListener("click", () => {
  currentLang = "eng";
  count = 0;
  countEl.textContent = "0";
  fetchRSSNews("http://feeds.bbci.co.uk/news/world/rss.xml");
});

dropdownBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdown.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (!dropdown.contains(e.target)) dropdown.classList.remove("open");
});

// 100개 단위마다 보여줄 메시지 배열
const milestoneMessages = [
  "자연윤활 중 이신가봐요",
  "키캡이 마모되고 있어요",
  "손가락 관절은 괜찮으신가요?",
  "수제 머신흑 완성입니다",
  "키캡이 번들거려요",
  "손가락 관절이 다 닳았겠어요",
  "키보드를 좀 쉬게 해주시는건 어떠신가요",
  "키보드가 죽어가고 있어요",
  "키보드님께서 사망하셨습니다",
  // 필요하면 더 추가 가능
];

// 메시지 엘리먼트
const milestoneTextEl = document.getElementById("milestone-text");

// 메시지 표시 함수

function showMilestoneMessage(idx) {
  if (idx < 0 || idx >= milestoneMessages.length) return;

  milestoneTextEl.textContent = milestoneMessages[idx];
  milestoneTextEl.style.opacity = "1";

  // 3초 후 서서히 사라짐
   setTimeout(() => {
    milestoneTextEl.style.opacity = "0";
  }, 2000);
}

// ✅ 초기 실행
const isDark = localStorage.getItem("darkMode") === "true";
if (isDark) document.body.classList.add("dark");
fetchSentences(currentLang);
