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
let usedNewsIndexes = new Set(); // 사용된 뉴스 인덱스 저장
let isNewsMode = false;


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
    .replace(/<[^>]*>/g, " ")                        // HTML 태그 제거
    .replace(/&[a-z]+;/gi, " ")                      // HTML 엔티티 제거
    .replace(/https?:\/\/\S+/g, " ")                 // URL 제거
    .replace(/[\r\n]/g, " ")                         // 줄바꿈 제거
    .replace(/\([^)]*\)/g, "")                       // 소괄호와 괄호 안 내용 제거 ✅
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫©★※…•◆■▶▷]/g, "") // 특수 문자 제거
    .replace(/[\u3130-\u318F\uAC00-\uD7A3]+/g, (match) => match) // 한글 유지
    .replace(/[一-龯]/g, "")                          // 한자 제거
    .replace(/[^\p{L}\p{N} .,!?'"“”‘’~]/gu, "")        // 특수문자 제외
    .replace(/\s+/g, " ")                            // 여백 정리
    .replace(/^▲.*관련이 없습니다\./gm, "") // '▲...관련이 없습니다.'로 시작하는 줄 제거
    // 숫자 사이의 마침표(.) 제외하고, 문자 뒤에 붙은 문장부호 뒤에만 공백 추가
    .replace(/([^\d\s])([.,!?])(?=\S)/g, "$1$2 ")
     .replace(/위 사진은 기사 내용과 관련이 없습니다\./g, "")  // 이 문장 제거 추가
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
  const rawTitle = item.querySelector("title")?.textContent || "";

  const lowerTitle = rawTitle.toLowerCase();
  if (["클로징", "closing"].includes(lowerTitle.trim())) return false;

  // 공백, 대괄호, 특수문자 제거 후 소문자 변환
  const normalizedTitle = rawTitle
    .replace(/\s+/g, '')           // 공백 제거
    .replace(/[\[\]【】]/g, '')    // 대괄호 및 유사 문자 제거
    .toLowerCase();

  if (normalizedTitle.includes("뉴스직격")) return false;

  return true;
});


      const isKoreanNews = url.includes("sbs.co.kr");
      usedNewsIndexes.clear(); // 이전에 본 뉴스 기록 초기화

      newsList = items.map(item => {
        const title = cleanText(item.querySelector("title")?.textContent || "");
        const link = item.querySelector("link")?.textContent || "";

        // 썸네일 추출
        let image = "";
        const thumbnail = item.getElementsByTagName("media:thumbnail")[0];
        const enclosure = item.getElementsByTagName("enclosure")[0];
        if (thumbnail?.getAttribute("url")) image = thumbnail.getAttribute("url");
        else if (enclosure?.getAttribute("url")) image = enclosure.getAttribute("url");

        // 내용 정제 및 분할
        let summary = "";
        if (isKoreanNews) {
          const content = item.getElementsByTagName("content:encoded")[0]?.textContent || "";
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = content;

          const paragraphs = [...tempDiv.querySelectorAll("p.change")]
            .map(p => cleanText(p.textContent))
            .flatMap(p => splitIntoShortSentences(p))
            .filter(p => p.length > 10);

          summary = paragraphs.slice(0, 2).join(" ");
        } else {
          const desc = cleanText(item.querySelector("description")?.textContent || "");
          const shortSentences = splitIntoShortSentences(desc);
          summary = shortSentences.slice(0, 2).join(" ");
        }

        return {
          sentence: `${title}\n\n${summary}`,
          link,
          image
        };
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

  // 모든 뉴스 문장을 사용했다면 종료 메시지 출력
  if (usedNewsIndexes.size === sentences.length) {
    sentenceEl.innerHTML = `<div class="completed-message">현재 제공 가능한 뉴스 문장을 모두 완료하셨습니다. 📰</div>`;
    thumbnailContainer.style.display = "none";
    inputEl.value = "";
    inputEl.disabled = true;
    newsLinkEl.style.visibility = "hidden";
    return;
  }

  let index, sentenceData, attempts = 0;
  do {
    index = Math.floor(Math.random() * sentences.length);
    sentenceData = sentences[index];
    attempts++;
  } while ((sentenceData === previousSentence || usedNewsIndexes.has(index)) && attempts < 50);

  usedNewsIndexes.add(index);  // 선택한 인덱스 기록
  previousSentence = sentenceData;
  const newsItem = newsList[index] || {};
  const imgUrl = newsItem.image || "";

  // 이하 기존 렌더링 로직 그대로 유지
  if (sentenceData.includes("\n\n")) {
    const [title, body] = sentenceData.split("\n\n");
    currentSentence = body;
    isNewsMode = true; // 뉴스일 경우 true
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
    isNewsMode = false; // 일반 문장일 경우 false
    sentenceEl.innerHTML = [...currentSentence].map(ch => `<span>${ch}</span>`).join('');
  }

  const newsOriginalLink = document.getElementById("news-original-link");

  if (newsItem.link) {
    newsOriginalLink.href = newsItem.link;
    newsOriginalLink.style.visibility = "visible";
  } else {
    newsOriginalLink.href = "#";
    newsOriginalLink.style.visibility = "hidden";
  }

  if (imgUrl) {
    thumbnailContainer.style.display = "block";
    thumbnailContainer.innerHTML = `<img src="${imgUrl}" alt="뉴스 썸네일" loading="lazy" />`;
  } else {
    thumbnailContainer.style.display = "none";
    thumbnailContainer.innerHTML = "";
  }

  inputEl.value = "";
  inputEl.disabled = false;
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
  const expected = currentSentence[i];

  if (typed == null) {
    spans[i].className = "";
    continue;
  }

  const typedChar = isNewsMode ? typed.toLowerCase() : typed;
  const expectedChar = isNewsMode ? expected.toLowerCase() : expected;
  const isCorrect = typedChar === expectedChar;

  if (i === input.length - 1 && !isCorrect) {
    spans[i].className = "";
  } else if (isCorrect) {
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
        const idx = (count / 100) - 1;
        showMilestoneMessage(idx);
      }

      inputEl.focus();
    }, 20);

  } else if ((isEnter || isSpace) && !isComplete) {
    // 입력이 문장 길이만큼 안 됐으면 알림 안 뜸 (무시)
  } else if ((isEnter || isSpace) && isComplete && currentAccuracy < 80) {
    // 입력 완료된 상태에서 정확도가 낮으면 알림 뜸
    // alert("정확도 80% 이상일 때만 다음 문장으로 넘어갑니다.");
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

    if (sector === "all") {
      fetchAllSectorsNews();
    } else {
      const sectorMap = {
        main: "https://news.sbs.co.kr/news/headlineRssFeed.do",
        politics: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01",
        economy: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02",
        society: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03",
        global: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07",
        culture: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08",
        entertainment: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14",
        sports: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09"
      };
      fetchRSSNews(sectorMap[sector] || sectorMap.main);
    }
  });
});

function fetchAllSectorsNews() {
  const sectors = [
    "01", "02", "03", "07", "08", "14", "09"
  ];

  const baseUrl = "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=";
  let allNewsItems = [];

  // 모든 RSS를 비동기로 fetch해서 뉴스 배열 모으기
  Promise.all(
    sectors.map(sec => fetchRSSNewsForSector(baseUrl + sec))
  ).then(results => {
    results.forEach(newsItems => {
      allNewsItems = allNewsItems.concat(newsItems);
    });
    // 섞기 (Fisher–Yates shuffle)
    for (let i = allNewsItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allNewsItems[i], allNewsItems[j]] = [allNewsItems[j], allNewsItems[i]];
    }

    newsList = allNewsItems;
    sentences = newsList.map(n => n.sentence);
    usedNewsIndexes.clear();
    pickAndRenderNewSentence();
  }).catch(err => {
    console.error("전체 섹터 뉴스 로딩 실패", err);
  });
}

// 섹터별 RSS를 받아서 뉴스 아이템 배열 리턴
function fetchRSSNewsForSector(url) {
  const proxy = 'https://corsproxy.io/?url=';
  return fetch(proxy + encodeURIComponent(url))
    .then(res => res.text())
    .then(xml => {
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      let items = [...doc.querySelectorAll("item")].slice(0, 10).filter(item => {
        const title = cleanText(item.querySelector("title")?.textContent || "");
        return !["클로징", "closing"].includes(title.toLowerCase());
      });

      const isKoreanNews = url.includes("sbs.co.kr");

      return items.map(item => {
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

          const paragraphs = [...tempDiv.querySelectorAll("p.change")]
            .map(p => cleanText(p.textContent))
            .flatMap(p => splitIntoShortSentences(p))
            .filter(p => p.length > 10);

          summary = paragraphs.slice(0, 2).join(" ");
        } else {
          const desc = cleanText(item.querySelector("description")?.textContent || "");
          const shortSentences = splitIntoShortSentences(desc);
          summary = shortSentences.slice(0, 2).join(" ");
        }

        return {
          sentence: `${title}\n\n${summary}`,
          link,
          image
        };
      });
    });
}


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
function splitIntoShortSentences(text, maxLen = 150) {
  const sentenceEndRegex = /(?<=[.!?。])\s+/g;
  const roughSentences = text.split(sentenceEndRegex);

  const result = [];

  for (let sentence of roughSentences) {
    sentence = sentence.trim();
    if (sentence.length <= maxLen) {
      if (sentence.length > 10) result.push(sentence);
    } else {
      // 너무 긴 문장은 maxLen 단위로 잘라서 추가
      for (let i = 0; i < sentence.length; i += maxLen) {
        const chunk = sentence.slice(i, i + maxLen).trim();
        if (chunk.length > 10) result.push(chunk);
      }
    }
  }

  return result;
}

document.addEventListener("DOMContentLoaded", () => {
  let clickCount = 0;
  const siteTitle = document.getElementById("site-title");
  const inputEl = document.getElementById("input");
  const meowSound = new Audio("keyboard-click.wav");
  meowSound.volume = 0.3;

  function toggleCatMode() {
    if (document.body.classList.contains("cat-mode")) {
      document.body.classList.remove("cat-mode");
    } else {
      document.body.classList.add("cat-mode");
    }
    meowSound.currentTime = 0;
    meowSound.play();
  }

  siteTitle.addEventListener("click", () => {
    siteTitle.classList.add("clicked");
    setTimeout(() => {
      siteTitle.classList.remove("clicked");
    }, 120);

    clickCount++;
    if (clickCount === 5) {
      toggleCatMode();
      clickCount = 0;
    }
  });

  inputEl.addEventListener("input", () => {
    if (document.body.classList.contains("cat-mode")) {
      meowSound.currentTime = 0;
      meowSound.play();
    }
  });
});




// ✅ 초기 실행
const isDark = localStorage.getItem("darkMode") === "true";
if (isDark) document.body.classList.add("dark");
fetchSentences(currentLang);
