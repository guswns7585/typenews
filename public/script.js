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
let totalTypingCount = 0;
let maxCPM = 0;          // 사용자 최고 CPM 저장용
let currentMode = "short"; // 기본 단문 모드
let currentEngMode = "short";
let korHistory = [];
let engHistory = [];
let newsHistory = [];

let ignorePunctuation = false;
let ignoreNumbers = false;
let ignoreEnglish = false;
let ignoreSymbols = false;

let isNicknameModalOpen = false;

let completedInCurrentMode = 0; // 현재 모드에서 완료한 문장 수

let isTyping = false;    // 타이핑 중인지 여부
let cpmIntervalId = null;

let unsubscribeTopRankings = null;
let unsubscribeMonthlyRankings = null;
let unsubscribeMyMonthlyScore = null;

let currentUserNickname = "익명";

let isOverlayMode = true;

let sessionStart = Date.now();

let korFile = "kor.json";
let korLongFile = "kor_long.json";


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

const korModeDropdown = document.querySelector(".kor-mode-dropdown-content");

// DOM 요소
const engModeDropdown = document.querySelector(".eng-mode-dropdown-content");


// DOM 요소들
const korModeBtn = document.getElementById("korModeBtn");
const korDropdown = document.querySelector(".kor-mode-dropdown-content");
const engModeBtn = document.getElementById("engModeBtn");
const engDropdown = document.querySelector(".eng-mode-dropdown-content");

const newsDropdown = document.querySelector(".dropdown");
const newsDropdownBtn = document.getElementById("newsDropdownBtn");

// 예시: errorMsg 선언 추가
const errorMsg = document.getElementById('error-message'); // 이걸 최상단 전역 영역에 넣기

const togglePunctuationBtn = document.getElementById("toggle-punctuation");
const toggleNumbersBtn = document.getElementById("toggle-numbers");
const toggleEnglishBtn = document.getElementById("toggle-english");
const toggleSymbolsBtn = document.getElementById("toggle-symbols");

const tabButtons = document.querySelectorAll(".custom-tab-btn");
const tabSections = document.querySelectorAll(".custom-tab-section");

const fontSizeSlider = document.getElementById("fontSizeSlider");
const fontSizeValue = document.getElementById("fontSizeValue");

const streamingToggleBtn = document.getElementById("toggle-streaming");

const newsUrlMap = {
  main: "https://news.sbs.co.kr/news/headlineRssFeed.do",
  politics: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01",
  economy: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02",
  society: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03",
  global: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07",
  culture: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08",
  entertainment: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14",
  sports: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09"
};


const englishNewsUrlMap = {
  all: "http://feeds.bbci.co.uk/news/world/rss.xml"
};

const RSS_PROXY = "https://api-75pgkefxxa-uc.a.run.app/rss?url=";



function updateMemeButtonState() {
    const memeBtn = document.getElementById("toggle-streaming");
    if (!memeBtn) return;

    if (currentLang === "kor" && ["short", "long"].includes(currentMode)) {
        memeBtn.disabled = false;
    } else {
        memeBtn.disabled = true;
    }
}


streamingToggleBtn.addEventListener("click", () => {
    if (!["short", "long"].includes(currentMode) || currentLang !== "kor") return;

    const isStreaming = streamingToggleBtn.classList.toggle("on");
    streamingToggleBtn.textContent = "M";

    if (currentMode === "short") {
        korFile = isStreaming ? "kor_stream.json" : "kor.json";
    } else if (currentMode === "long") {
        korLongFile = isStreaming ? "kor_long_stream.json" : "kor_long.json";
    }
    saveSettings();
    loadKoreanModeData(currentMode);
    
});



// 예: 모드 변경 후 항상 호출
function setMode(newMode, newLang) {
    currentMode = newMode;
    currentLang = newLang;

    updateMemeButtonState();
    updateEnglishExcludeButtonState(); // 영어 제외 버튼도 동일하게
    pickAndRenderNewSentence();
}

let tooltipTimer = null;
const TOOLTIP_DURATION = 2000; // ms (1.5초)

const tooltip = document.createElement("div");
tooltip.className = "global-tooltip";
document.body.appendChild(tooltip);

document.addEventListener("mouseover", e => {
  const target = e.target.closest("[data-tooltip]");
  if (!target) return;

  
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }

  tooltip.textContent = target.dataset.tooltip;
  tooltip.style.opacity = '1';
tooltip.style.visibility = 'visible';
tooltip.style.transform = 'translateY(0)';

 tooltipTimer = setTimeout(() => {
    hideTooltip();
  }, TOOLTIP_DURATION);
});

document.addEventListener("mousemove", e => {
  if (tooltip.style.visibility !== 'visible') return;

  const target = e.target.closest("[data-tooltip]");
  if (!target) return;

  // FAB 버튼이면 툴팁을 좌측에 띄움
  if (target.classList.contains("fab")) {
    tooltip.style.left = e.clientX - tooltip.offsetWidth - 10 + "px"; // 왼쪽으로 10px 여백
    tooltip.style.top = e.clientY + "px";
  } else {
    tooltip.style.left = e.clientX + 10 + "px"; // 기본 오른쪽 띄우기
    tooltip.style.top = e.clientY + 10 + "px";
  }
});


document.addEventListener("mouseout", e => {
  if (e.target.closest("[data-tooltip]")) {
    tooltip.style.opacity = '0';
tooltip.style.visibility = 'hidden';
tooltip.style.transform = 'translateY(6px)';

  }
});

function hideTooltip() {
  tooltip.style.opacity = '0';
  tooltip.style.visibility = 'hidden';
  tooltip.style.transform = 'translateY(6px)';
}


// ✅ 자동 높이 조절
function autoResizeInput() {
  inputEl.style.height = "auto";
  inputEl.style.height = inputEl.scrollHeight + "px";
}



function applyFontSize(size) {
  const bodySize = `${size}px`;
  const titleSize = `${size + 1}px`;

  document.documentElement.style.setProperty('--font-size-body', bodySize);
  document.documentElement.style.setProperty('--font-size-title', titleSize);
  document.documentElement.style.setProperty('--cursor-line-height', 1.5);

  const fontSizeValue = document.getElementById("fontSizeValue");
  if (fontSizeValue) {
    fontSizeValue.textContent = bodySize;
  }

  const sentence = document.getElementById("sentence");
  const isNewsMode = document.body.classList.contains("mode-news");

  if (sentence && !isNewsMode) {
    sentence.style.fontSize = bodySize;
  }

  // 🔹 input의 폰트 사이즈도 변경
  const input = document.getElementById("input");
  if (input) {
    input.style.fontSize = bodySize;
    input.style.lineHeight = '1.5'; // 커서 위치 맞추기
  }
}



fontSizeSlider.addEventListener("input", () => {
  const size = parseInt(fontSizeSlider.value);
  applyFontSize(size);

  // 로컬 저장 (선택)
  localStorage.setItem("userFontSize", size);
});

function initializeFontSizeFromStorage() {
  const storedSize = parseInt(localStorage.getItem("userFontSize") || "19");
  fontSizeSlider.value = storedSize;
  applyFontSize(storedSize);
}




// ✅ 텍스트 정제
function decodeHTMLEntities(text) {
  const txt = document.createElement("textarea");
  txt.innerHTML = text;
  return txt.value;
}

function cleanText(text) {
  // HTML 엔티티 처리 (decodeHTMLEntities 함수는 이미 존재한다고 가정)
  text = decodeHTMLEntities(text);

  // 불필요 문구 및 광고, 저작권, 영상/앱 안내 등 제거를 위한 범용 패턴들
  const unwantedPatterns = [
    /▲[^.!?]*[.!?]?/g,                                   // 특수문자 ▲ 및 그 문장
    /▶?\s*뉴스에는\s*위아래가 없다\s*스브스뉴스/gi,        // 뉴스 브랜드명
    /▶?\s*SBS\s*뉴스\s*앱\s*다운로드/gi,                  // 앱 다운로드 홍보
    /▶?\s*뉴스에\s*지식을\s*담다\s*-\s*스브스프리미엄\s*앱\s*다운로드/gi,
    /ⓒ\s*SBS\s*&\s*SBS\s*i\s*[:：]/gi,                     // 저작권 표시
    /무단복제\s*및\s*재배포\s*금지/gi,
    /이\s*기사의\s*전체\s*내용\s*확인하기/gi,              // 전체 내용 확인 링크 문구
    /▶?\s*영상\s*시청/gi,                                  // 영상 안내
    /▶?\s*프로듀서:/gi,
    /▶?\s*촬영:/gi,
    /▶?\s*편집:/gi,
    /▶?\s*담당\s*인턴:/gi,
    /▶?\s*연출:/gi,
    /위 사진은 기사 내용과 관련이 없습니다\./gi,
    /^▲.*관련이 없습니다\./gm,
    /<iframe[\s\S]*?<\/iframe>/gi,                         // iframe 태그 제거
    /<img[\s\S]*?>/gi,                                     // img 태그 제거
    /&[a-z]+;/gi                                          // HTML 엔티티 제거 (기본 .replace로 처리하므로 중복 가능)
  ];

  unwantedPatterns.forEach(pattern => {
    text = text.replace(pattern, " ");
  });

  // 공백 처리 및 HTML 태그 제거
  text = text
    .replace(/\u00A0/g, " ")                         // non-breaking space → 공백
    .replace(/&nbsp;/gi, " ")                        // &nbsp; → 공백
    .replace(/<[^>]*>/g, " ")                        // HTML 태그 제거 (여전히 혹시 남은 태그)
    .replace(/https?:\/\/\S+/g, " ")                 // URL 제거
    .replace(/[\r\n]/g, " ")                         // 줄바꿈 제거
    .replace(/\([^)]*\)/g, "")                       // 괄호 안 제거
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫©★※…•◆■▶▷]/g, "") // 특수 문자 제거
    .replace(/[一-龯]/g, "")                          // 한자 제거
    .replace(/[^ \p{L}\p{N}!@#$%^&*()_+\-=\[\]{}|;:'",.<>\/?~]/gu, "") // 허용 문자 이외 제거
    .replace(/\s+/g, " ")                            // 여러 공백 정리
    .replace(/([^\d\s])([.,!?])(?=\S)/g, "$1$2 ")   // 문장부호 뒤 공백 추가
    .trim();

  return text;
}



const blockedKeywords = [
  "편상욱의 뉴스브리핑",
  "금지키워드1",
  "금지키워드2",
  // 필요한 만큼 추가 가능
];

function containsBlockedKeyword(text) {
  if (!text) return false;
  const normalizedText = text.toLowerCase().replace(/\s+/g, "");
  return blockedKeywords.some(keyword => normalizedText.includes(keyword.toLowerCase().replace(/\s+/g, "")));
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



async function fetchRSSNews(url) {
  newsHistory = []; // 뉴스 모드 전환 시 초기화
  usedNewsIndexes.clear();

  const RSS_PROXY = "https://api-75pgkefxxa-uc.a.run.app/rss?url=";

  try {
    const res = await fetch(RSS_PROXY + encodeURIComponent(url));
    if (!res.ok) throw new Error("RSS 요청 실패");

    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, "application/xml");

    const items = [...doc.querySelectorAll("item")].slice(0, 10).filter(item => {
      const rawTitle = item.querySelector("title")?.textContent || "";
      const rawDesc = item.querySelector("description")?.textContent || "";
      const rawContent = item.getElementsByTagName("content:encoded")[0]?.textContent || "";

      const lowerTitle = rawTitle.toLowerCase().trim();
      if (["클로징", "closing"].includes(lowerTitle)) return false;

      const combinedText = rawTitle + rawDesc + rawContent;
      return !containsBlockedKeyword(combinedText);
    });

    const isKoreanNews = url.includes("sbs.co.kr");

    newsList = items.map(item => {
      const title = cleanText(item.querySelector("title")?.textContent || "");
      const link = item.querySelector("link")?.textContent || "";

      // 이미지 추출
      let image = "";
      const thumbnail = item.getElementsByTagName("media:thumbnail")[0];
      const enclosure = item.getElementsByTagName("enclosure")[0];
      if (thumbnail?.getAttribute("url")) image = thumbnail.getAttribute("url");
      else if (enclosure?.getAttribute("url")) image = enclosure?.getAttribute("url") || "";

      // 내용 정제 및 요약
      let summary = "";
      if (isKoreanNews) {
        const content = item.getElementsByTagName("content:encoded")[0]?.textContent || "";
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = content;

        let paragraphs = [...tempDiv.querySelectorAll("p.change")];
        if (!paragraphs.length) paragraphs = [...tempDiv.querySelectorAll("p")];

        const filtered = paragraphs
          .map(p => cleanText(p.textContent))
          .flatMap(p => splitIntoShortSentences(p))
          .filter(p => p.length > 10);

        summary = filtered.slice(0, 2).join(" ");
      } else {
        const desc = cleanText(item.querySelector("description")?.textContent || "");
        summary = splitIntoShortSentences(desc).slice(0, 2).join(" ");
      }

      // 본문이 너무 짧으면 description 그대로 사용
      if (!summary || summary.length < 30) {
        const desc = cleanText(item.querySelector("description")?.textContent || "");
        summary = desc;
      }

      return { sentence: `${title}\n\n${summary}`, link, image };
    });

    sentences = newsList.map(n => n.sentence);
    pickAndRenderNewSentence();

  } catch (err) {
    console.error("뉴스 로딩 실패:", err);
    showNewsErrorMessage("뉴스 로딩 중 오류가 발생했습니다.");
  }
}




// ✅ 문장 렌더링
// ✅ 문장 렌더링
function pickAndRenderNewSentence() {
  if (sentences.length === 0) return;

  let index, sentenceData, attempts = 0;

  // === ✅ 뉴스 모드일 경우 ===
  if (isNewsMode) {

    
    // 모든 뉴스 문장을 사용했다면 종료 메시지 출력
    if (usedNewsIndexes.size === sentences.length) {
  sentenceEl.innerHTML = `<div class="completed-message">현재 제공 가능한 뉴스 문장을 모두 완료하셨습니다. 📰</div>`;
  thumbnailContainer.style.display = "none";
  inputEl.value = "";
  inputEl.disabled = true;
      // newsLinkEl.style.visibility = "hidden";
      return;
    }

    do {
      index = Math.floor(Math.random() * sentences.length);
      sentenceData = sentences[index];
      attempts++;
    } while ((sentenceData === previousSentence || usedNewsIndexes.has(index)) && attempts < 50);

    usedNewsIndexes.add(index);
  }

  // === ✅ 일반 모드일 경우 ===
  else {
    // 중복방지용 인덱스 초기화 없으면 생성
    if (!window.usedIndexes) window.usedIndexes = new Set();

    // 모든 문장을 사용했으면 리셋
    if (usedIndexes.size >= sentences.length) {
      usedIndexes.clear();
    }

    do {
      index = Math.floor(Math.random() * sentences.length);
      sentenceData = sentences[index];
      attempts++;
    } while ((sentenceData === previousSentence || usedIndexes.has(index)) && attempts < 50);

    usedIndexes.add(index);
  }

  // === 렌더링 ===
// === 렌더링 ===
  // 뉴스 모드면 newsList에서 뉴스 객체 찾기
  let newsItem = {};
  if (isNewsMode) {
    newsItem = newsList.find(n => n.sentence === sentenceData) || {};
  }


renderCurrentSentence(sentenceData);


  // 입력 초기화
  inputEl.value = "";
  inputEl.disabled = false;
  startTime = null;
  currentAccuracy = 0;
  speedEl.textContent = currentLang === "kor" ? "0 CPM" : "0 WPM";
  accuracyEl.textContent = "0";
  autoResizeInput();
  if (!isNewsMode) {
    renderSentenceThumbnail(currentSentence);
  }

}

function renderSentenceThumbnail(sentence) {
  const thumbContainer = document.getElementById("thumbnail-container");
  // const newsLink = document.getElementById("news-original-link");

  // 단문 모드이므로 뉴스 링크는 숨김
  // newsLink.style.display = "none";

  // 이 문장에 해당하는 이미지 매핑 테이블
  const mappings = [
    {
      match: "야광공룡",  // 특정 단어 or 문장 일부 
      img: "dino.jpg"
    },
  ];

  // 매칭되는 문장 찾기
  const found = mappings.find(m => sentence.includes(m.match));

  if (found) {
    thumbContainer.innerHTML = `<img src="${found.img}" />`;
    thumbContainer.style.display = "block";
  } else {
    thumbContainer.innerHTML = "";
    thumbContainer.style.display = "none";
  }
}



function renderCurrentSentence(sentenceData) {
    previousSentence = sentenceData;

    const progressEl = document.getElementById("progress-bar");
    if (progressEl) progressEl.style.width = "0%";

    const newsItem = newsList.find(n => n.sentence === sentenceData) || {};
    const imgUrl = newsItem.image || "";

    // 문자 하나하나를 <span>으로 감싸는 함수 (wrapCharacter는 이미 구현되어 있다고 가정)
    const wrapCharactersInSpans = (textToWrap) => {
        return [...textToWrap].map(ch => wrapCharacter(ch)).join("");
    };

    let rawSentenceToProcess;
    let normalizedSentenceForHighlight = "";

    if (sentenceData.includes("\n\n")) {
        // 뉴스 모드: 제목과 본문 분리
        const [title, body] = sentenceData.split("\n\n");
        rawSentenceToProcess = body;
        isNewsMode = true;

        // 임시 div에 스팬으로 감싸 넣고 텍스트 정규화 (공백 압축, 무시 문자 제거)
        const tempDivForNormalization = document.createElement("div");
        tempDivForNormalization.innerHTML = [...rawSentenceToProcess].map(ch => wrapCharacter(ch)).join("");
        normalizedSentenceForHighlight = tempDivForNormalization.textContent.replace(/\s+/g, " ").trim();
        currentSentence = normalizedSentenceForHighlight;

        // 문장 렌더링 (뉴스 모드 구조)
        sentenceEl.innerHTML = `
            <div class="news-container" style="">
                <div class="news-text" style="margin-top: -70px; width: 100%;">
                    <div class="news-title" style=" font-weight: bold;">${title}</div>
                    <hr style="border: none; border-top: 1px solid #ccc; margin: -12px 0;" />
                    <div class="news-body">${wrapCharactersInSpans(currentSentence)}</div>
                </div>
            </div>
        `;
    } else {
        // 단문/단어 모드
        rawSentenceToProcess = sentenceData;
        isNewsMode = false;

        const tempDivForNormalization = document.createElement("div");
        tempDivForNormalization.innerHTML = [...rawSentenceToProcess].map(ch => wrapCharacter(ch)).join("");
        normalizedSentenceForHighlight = tempDivForNormalization.textContent.replace(/\s+/g, " ").trim();
        currentSentence = normalizedSentenceForHighlight;

        // 단문 모드 문장 렌더링 (스팬들만)
        sentenceEl.innerHTML = wrapCharactersInSpans(currentSentence);
    }

    // 뉴스 원본 링크와 썸네일 처리 (기존 로직 유지)
    const newsOriginalLink = document.getElementById("news-original-link");
    if (isNewsMode && newsItem.link) {
        newsOriginalLink.href = newsItem.link;
        newsOriginalLink.style.visibility = "visible";
    } else {
        newsOriginalLink.href = "#";
        newsOriginalLink.style.visibility = "hidden";
    }

    thumbnailContainer.style.display = imgUrl ? "block" : "none";
    thumbnailContainer.innerHTML = imgUrl
        ? `<a href="${newsItem.link || '#'}" target="_blank" rel="noopener noreferrer">
             <img src="${imgUrl}" alt="뉴스 썸네일" style="cursor:pointer;" />
           </a>`
        : "";

    // **커서 엘리먼트를 sentenceEl 내부로 이동**
    const existingCursor = document.getElementById("virtual-cursor");
if (isOverlayMode) {
    if (existingCursor) {
        sentenceEl.appendChild(existingCursor);
    } else {
        const newCursor = document.createElement("div");
        newCursor.id = "virtual-cursor";
        sentenceEl.appendChild(newCursor);
    }

    resetVirtualCursor(); // 커서 초기 위치 초기화
} else if (existingCursor) {
    // 입력창 모드에서는 커서를 아예 숨김
    existingCursor.style.display = 'none';
}

    // 입력 초기화
    inputEl.value = "";
    inputEl.disabled = false;
    startTime = null;
    currentAccuracy = 0;
    speedEl.textContent = currentLang === "kor" ? "0 CPM" : "0 WPM";
    accuracyEl.textContent = "0";
    autoResizeInput();

    // resetVirtualCursor(); // 커서 초기 위치 초기화
    
}


inputEl.addEventListener("input", updateHighlight);

// ✅ 입력 처리 및 하이라이트 갱신
// function updateHighlight() {
//     const input = inputEl.value; // 사용자가 현재까지 입력한 내용
//     const target = currentSentence; // `renderCurrentSentence`에서 이미 정규화된 상태 (trim, 공백 압축)
//     const spans = sentenceEl.querySelectorAll(".news-body span, #sentence span");

//     // 1. 타이핑 시작/종료 및 CPM 타이머 관리
//     if (!startTime && input.length > 0) {
//         startTime = Date.now();
//         if (cpmIntervalId) clearInterval(cpmIntervalId);
//         cpmIntervalId = setInterval(() => { updateCPM(); }, 100);
//     } else if (input.length === 0) {
//         startTime = null;
//         clearInterval(cpmIntervalId);
//         cpmIntervalId = null;
//         speedEl.textContent = `0 CPM / 0 WPM`;
//         accuracyEl.textContent = `0%`;
//     }

//     let correctTypedCharsCount = 0; // 사용자가 '맞게' 타이핑한 유효 문자 수 (공백 포함)

//     // 2. 모든 span의 하이라이트 초기화 (매우 중요!)
//     spans.forEach(span => {
//         span.className = "";
//     });

//     let inputIndex = 0;  // 사용자의 입력 인덱스
//     let targetIndex = 0; // 목표 문장 인덱스 및 span 인덱스

//     // 3. 문장 시작 부분의 무시 문자 또는 공백 건너뛰기
//     while (
//         targetIndex < target.length &&
//         (isIgnoredCharacter(target[targetIndex]) || target[targetIndex] === ' ')
//     ) {
//         spans[targetIndex].className = "ignored";
//         targetIndex++;
//     }

//     // 문장 끝 부분의 무시 문자 또는 공백 건너뛰기 (역방향)
//     let endIndex = target.length - 1;
//     while (
//         endIndex >= targetIndex &&
//         (isIgnoredCharacter(target[endIndex]) || target[endIndex] === ' ')
//     ) {
//         spans[endIndex].className = "ignored";
//         endIndex--;
//     }

//     // 4. 핵심 하이라이트 루프 (targetIndex ~ endIndex)
//     while (targetIndex <= endIndex && inputIndex < input.length) {
//         const expected = target[targetIndex];
//         const typed = input[inputIndex];
//         const span = spans[targetIndex];

//         // 무시 문자는 건너뛰기 (inputIndex는 그대로)
//         if (isIgnoredCharacter(expected)) {
//             span.className = "ignored";
//             targetIndex++;
//             continue;
//         }

//         let isCurrentCharCorrect = (typed.toLowerCase() === expected.toLowerCase());

//         // 5. 연속 공백 및 무시 문자 처리 강화
//         if (expected === ' ' && typed === ' ') {
//             let tempTargetIndex = targetIndex + 1;
//             let skippedValidSpaces = 0;

//             while (
//                 tempTargetIndex <= endIndex &&
//                 (target[tempTargetIndex] === ' ' || isIgnoredCharacter(target[tempTargetIndex]))
//             ) {
//                 if (isIgnoredCharacter(target[tempTargetIndex])) {
//                     spans[tempTargetIndex].className = "ignored";
//                 } else if (target[tempTargetIndex] === ' ') {
//                     spans[tempTargetIndex].className = "correct";
//                     skippedValidSpaces++;
//                 }
//                 tempTargetIndex++;
//             }

//             if (skippedValidSpaces > 0) {
//                 isCurrentCharCorrect = true;
//                 correctTypedCharsCount += (1 + skippedValidSpaces);
//                 targetIndex = tempTargetIndex;
//                 inputIndex++;
//             } else {
//                 if (isCurrentCharCorrect) correctTypedCharsCount++;
//                 targetIndex++;
//                 inputIndex++;
//             }
//         } else {
//             if (isCurrentCharCorrect) {
//                 correctTypedCharsCount++;
//             }
//             targetIndex++;
//             inputIndex++;
//         }

//         // 6. 하이라이트 클래스 적용
//         if (inputIndex <= input.length) {
//             if (isCurrentCharCorrect) {
//                 span.className = "correct";
//             } else {
//                 if (inputIndex === input.length && !isCurrentCharCorrect) {
//                     span.className = "";
//                 } else {
//                     span.className = "incorrect";
//                 }
//             }
//         }
//     }

//     // 7. 사용자가 입력하지 않은 나머지 target 부분 처리
//     while (targetIndex <= endIndex) {
//         const expected = target[targetIndex];
//         const span = spans[targetIndex];

//         if (isIgnoredCharacter(expected) || expected === ' ') {
//             span.className = "ignored";
//         } else {
//             span.className = "";
//         }
//         targetIndex++;
//     }

//     // 8. 정확도 계산
//     const normalizedInputLength = input.replace(/\s+/g, ' ').trim().length;
//     currentAccuracy = normalizedInputLength > 0
//         ? Math.round((correctTypedCharsCount / normalizedInputLength) * 100)
//         : 0;

//     accuracyEl.textContent = `${currentAccuracy}%`;

//     autoResizeInput();
// }

let inputToTargetMap = [];

function updateHighlight() {
    const input = inputEl.value;
    const target = currentSentence;
    const spans = sentenceEl.querySelectorAll(".news-body span, #sentence span");

    // 타이핑 시작 타이머 관리
    if (!startTime && input.length > 0) {
        startTime = Date.now();
        if (cpmIntervalId) clearInterval(cpmIntervalId);
        cpmIntervalId = setInterval(updateCPM, 70);
    } else if (input.length === 0) {
        startTime = null;
        if (cpmIntervalId) clearInterval(cpmIntervalId);
        cpmIntervalId = null;
        speedEl.textContent = `0 CPM / 0 WPM`;
        accuracyEl.textContent = `0%`;
    }

    let correctTypedCharsCount = 0;

    // 스팬 초기화
    spans.forEach(span => {
        span.className = "";
        span.textContent = span.dataset.original || span.textContent;
    });

    let inputIndex = 0;
    let targetIndex = 0;
    const endIndex = target.length - 1;

    // 시작 부분 무시 문자/공백 처리
    while (targetIndex <= endIndex && (isIgnoredCharacter(target[targetIndex]) || target[targetIndex] === ' ')) {
        if (spans[targetIndex]) spans[targetIndex].className = "ignored";
        targetIndex++;
    }

    inputToTargetMap = [];

    // 메인 비교 루프
    while (targetIndex <= endIndex && inputIndex < input.length) {
        const expected = target[targetIndex];
        const typed = input[inputIndex];
        const span = spans[targetIndex];

        if (isIgnoredCharacter(expected)) {
            if (span) span.className = "ignored";
            targetIndex++;
            continue;
        }

        const isCorrect = typed?.toLowerCase() === expected?.toLowerCase();
        const isLastTypedChar = inputIndex === input.length - 1;

        // 공백 스킵 처리
        if (expected === ' ' && typed === ' ') {
            let tempTargetIndex = targetIndex + 1;
            while (tempTargetIndex <= endIndex &&
                   (target[tempTargetIndex] === ' ' || isIgnoredCharacter(target[tempTargetIndex]))) {
                const tempSpan = spans[tempTargetIndex];
                if (tempSpan && !isIgnoredCharacter(target[tempTargetIndex])) {
                    tempSpan.className = "correct";
                } else if (tempSpan && isIgnoredCharacter(target[tempTargetIndex])) {
                    tempSpan.className = "ignored";
                }
                tempTargetIndex++;
            }
            if (span) span.className = "correct";
            correctTypedCharsCount++;
            inputToTargetMap[inputIndex] = targetIndex;
            inputIndex++;
            targetIndex = tempTargetIndex;
            continue;
        }

        if (span) {
            if (isCorrect) {
                span.className = "correct";
                if (isOverlayMode) span.textContent = typed;
                correctTypedCharsCount++;
            } else if (!isLastTypedChar) {
                span.className = "incorrect";
                if (isOverlayMode) span.textContent = typed === ' ' ? expected : typed || expected;
            } else {
                span.className = "";
                if (isOverlayMode) span.textContent = typed === ' ' ? expected : typed || expected;
            }
        }

        inputToTargetMap[inputIndex] = targetIndex;
        inputIndex++;
        targetIndex++;
    }

    // 남은 부분 초기화
    while (targetIndex <= endIndex) {
        const expected = target[targetIndex];
        const span = spans[targetIndex];
        if (span) {
            if (isIgnoredCharacter(expected) || expected === ' ') {
                span.className = "ignored";
            } else {
                span.className = "";
            }
            span.textContent = expected;
        }
        targetIndex++;
    }

    // 오버레이 모드 커서
    if (isOverlayMode) {
        updateVirtualCursorPosition();
    } else {
        const cursorEl = document.getElementById('virtual-cursor');
        if (cursorEl) cursorEl.style.display = 'none';
    }

    // 정확도 계산
    currentAccuracy = input.length > 0
        ? Math.round((correctTypedCharsCount / input.length) * 100)
        : 0;
    accuracyEl.textContent = `${currentAccuracy}%`;

    autoResizeInput();
}


// 마지막 타이핑 위치 기준으로 커서 이동
function updateVirtualCursorPosition() {
    const cursorEl = document.getElementById('virtual-cursor');
    if (!isOverlayMode) return;
    if (!cursorEl) return;

    // 입력창 모드일 때는 가상 커서 표시하지 않음
    if (!isOverlayMode) {
        cursorEl.style.display = 'none';
        return;
    } else {
        cursorEl.style.display = 'block';
    }

    const newsBody = sentenceEl.querySelector('.news-body');
    const parentEl = newsBody || sentenceEl;

    const spans = parentEl.querySelectorAll('span');
    if (spans.length === 0) return;

    const inputLength = inputEl.value.length;

    let cursorTargetIndex;

    if (inputLength === 0) {
        cursorTargetIndex = -1;
    } else if (inputLength >= inputToTargetMap.length) {
        cursorTargetIndex = inputToTargetMap[inputToTargetMap.length - 1];
    } else {
        cursorTargetIndex = inputToTargetMap[inputLength - 1];
    }

    let baseSpan = cursorTargetIndex === -1 ? spans[0] : spans[cursorTargetIndex];
    if (!baseSpan) return;

    const rect = baseSpan.getBoundingClientRect();
    const parentRect = parentEl.getBoundingClientRect();

    let left = cursorTargetIndex === -1
        ? rect.left - parentRect.left - 1
        : rect.left - parentRect.left + rect.width;
    const top = rect.top - parentRect.top;

    cursorEl.style.left = `${Math.round(left)}px`;
    cursorEl.style.top = `${Math.round(top)}px`;

    if (cursorEl.parentNode !== parentEl && isOverlayMode) {
        parentEl.appendChild(cursorEl);
    }
}






function resetVirtualCursor() {
    const cursorEl = document.getElementById('virtual-cursor');
    if (!cursorEl) return;

    // 뉴스모드인지 체크해서 기준 부모 설정
    const newsBody = sentenceEl.querySelector('.news-body');
    const parentEl = newsBody || sentenceEl;

    // 기준 부모 안의 span들 수집
    const spans = parentEl.querySelectorAll('span');
    if (spans.length === 0) return;

    // 첫 줄(top 값 가장 작은) span 찾기
    let baseSpan = spans[0];
    let firstLineTop = baseSpan.getBoundingClientRect().top;

    for (let i = 1; i < spans.length; i++) {
        const span = spans[i];
        const top = span.getBoundingClientRect().top;
        if (top < firstLineTop) {
            baseSpan = span;
            firstLineTop = top;
        }
    }

    const rect = baseSpan.getBoundingClientRect();
    const parentRect = parentEl.getBoundingClientRect();

    const left = rect.left - parentRect.left;
    const top = rect.top - parentRect.top;

    cursorEl.style.left = `${Math.round(left)}px`;
    cursorEl.style.top = `${Math.round(top)}px`;

    // 커서 엘리먼트를 부모 요소에 넣어 위치 기준과 DOM구조 맞추기
    if (cursorEl.parentNode !== parentEl) {
        parentEl.appendChild(cursorEl);
    }
}

function applyInputMode(overlayMode, init = false) {
    const input = document.getElementById('input');
    const cursor = document.getElementById('virtual-cursor');
    const btn = document.getElementById('modeToggleBtn');

    isOverlayMode = overlayMode;

    if (isOverlayMode) {
        input.classList.remove('visible-mode');
        input.classList.add('overlay-mode');
        cursor.classList.remove('hidden');
        cursor.style.display = init ? 'none' : 'block'; // 초기 로드면 숨김
        if (!init) updateVirtualCursorPosition();
        btn.textContent = '오버레이'; // 버튼에 "다음에 전환될 모드" 표시
    } else {
        input.classList.remove('overlay-mode');
        input.classList.add('visible-mode');
        cursor.classList.add('hidden');
        cursor.style.display = 'none';
        if (cursor.parentNode !== input.parentNode) {
            input.parentNode.appendChild(cursor);
        }
        btn.textContent = '입력창';
    }

    input.focus();
    localStorage.setItem('typingMode', isOverlayMode ? 'overlay' : 'input');
}

// 모드 토글 버튼
function toggleInputMode() {
    applyInputMode(!isOverlayMode, false);
}

// 페이지 로드 시 저장된 모드 적용
window.addEventListener('DOMContentLoaded', () => {
    const savedMode = localStorage.getItem('typingMode');

    // 1. 모드 먼저 적용
    if (savedMode === 'overlay') {
        applyInputMode(true, true);
    } else if (savedMode === 'input') {
        applyInputMode(false, true);
    } else {
        applyInputMode(true, true);
    }

    // 2. 토글 상태 복원
    loadSettings();

    // 3. 버튼 상태 관련 UI 업데이트 (있다면)
    updateMemeButtonState();
    updateEnglishExcludeButtonState();

    // 4. 마지막으로 렌더링
    renderCurrentSentence(previousSentence);
});

document.getElementById('modeToggleBtn').addEventListener('click', toggleInputMode);

function resetHighlightStyles() {
  const spans = sentenceEl.querySelectorAll(".news-body span, #sentence span");
  spans.forEach(span => {
    span.className = "";
  });
}

// 실시간 CPM 업데이트 함수 (공백 포함 및 WPM 표시)
function getTypingCount(text) {
  let count = 0;
  for (const ch of text) {
    // 한글 범위: U+AC00 ~ U+D7A3
    if (ch >= '\uAC00' && ch <= '\uD7A3') {
      count += 2; // 한글 한 글자 = 2타
    } else {
      count += 1; // 영어, 숫자, 특수문자 = 1타
    }
  }
  return count;
}

function updateCPM() {
  const input = inputEl.value;
  if (!startTime || input.length === 0) {
    speedEl.textContent = `0 CPM / 0 WPM`;
    return;
  }

  const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;
  if (elapsedMinutes <= 0) {
    speedEl.textContent = `0 CPM / 0 WPM`;
    return;
  }

  // 입력 글자 수 계산 (한글 2타, 나머지 1타)
  const typingCount = getTypingCount(input);

  // CPM 계산
  const cpm = Math.round(typingCount / elapsedMinutes);

  // WPM 계산: 1단어 = 5글자 기준
  const wpm = Math.round(cpm / 5);

  speedEl.textContent = `${cpm} CPM / ${wpm} WPM`;
}


// 최종 결과 CPM 계산 함수 (공백 포함 및 WPM 반환)
function calculateCPM(print, pause) {
  if (!print || !print.target || !print.post || print.post.length === 0) 
    return { cpm: 0, wpm: 0 };

  // 1) 입력 글자 배열 합치기
  const rawText = print.post
    .filter(p => p.out && p.out.length > 0)
    .map(p => p.out.join(""))
    .join(""); // 공백 포함

  // 2) 한글/영문 타수 계산
  let totalTypedChars = 0;
  for (const ch of rawText) {
    if (ch >= '\uAC00' && ch <= '\uD7A3') {
      totalTypedChars += 2; // 한글 1글자 = 2타
    } else {
      totalTypedChars += 1; // 영어, 숫자, 특수문자 = 1타
    }
  }

  // 3) 타이핑 시작 시간
  const startTime = print.post[0].startTime || print.target.startTime || 0;

  // 4) 현재 시간
  const now = Date.now();

  // 5) 일시정지 시간 총합
  const pauseTime = pause?.time?.reduce((acc, val) => acc + val, 0) || 0;

  // 6) 경과 시간 (밀리초)
  const elapsed = now - startTime - pauseTime;
  if (elapsed <= 0) return { cpm: 0, wpm: 0 };

  // 7) CPM 계산
  const cpm = (totalTypedChars / elapsed) * 60000;

  // 8) WPM 계산 (1단어 = 5글자)
  const wpm = Math.round(cpm / 5);

  return { cpm: Math.round(cpm), wpm };
}



document.getElementById("toggle-punctuation").addEventListener("change", (e) => {
  ignorePunctuation = e.target.checked;
  renderCurrentSentence(previousSentence); // 다시 렌더링
});

document.getElementById("toggle-numbers").addEventListener("change", (e) => {
  ignoreNumbers = e.target.checked;
  renderCurrentSentence(previousSentence);
});

document.getElementById("toggle-english").addEventListener("change", (e) => {
  ignoreEnglish = e.target.checked;
  renderCurrentSentence(previousSentence);
});

document.getElementById("toggle-symbols").addEventListener("change", (e) => {
  ignoreSymbols = e.target.checked; // ✅ 수정
  renderCurrentSentence(previousSentence);
});


function saveSettings() {
  const settings = {
    ignorePunctuation,
    ignoreNumbers,
    ignoreEnglish,
    ignoreSymbols,
    isStreaming: streamingToggleBtn.classList.contains("on")
  };

  localStorage.setItem("typingSettings", JSON.stringify(settings));
}

function loadSettings() {
  const saved = localStorage.getItem("typingSettings");
  if (!saved) return;

  const settings = JSON.parse(saved);

  // 1. 내부 상태 복원
  ignorePunctuation = !!settings.ignorePunctuation;
  ignoreNumbers = !!settings.ignoreNumbers;
  ignoreEnglish = !!settings.ignoreEnglish;
  ignoreSymbols = !!settings.ignoreSymbols;

  // 2. 버튼 UI 동기화 (존재할 때만)
  if (togglePunctuationBtn)
    togglePunctuationBtn.classList.toggle("active", ignorePunctuation);

  if (toggleNumbersBtn)
    toggleNumbersBtn.classList.toggle("active", ignoreNumbers);

  if (toggleEnglishBtn)
    toggleEnglishBtn.classList.toggle("active", ignoreEnglish);

  if (toggleSymbolsBtn)
    toggleSymbolsBtn.classList.toggle("active", ignoreSymbols);

  // 3. 스트리밍 상태 복원 (핵심 수정)
  const isStreaming = !!settings.isStreaming;

  if (streamingToggleBtn) {
    streamingToggleBtn.classList.toggle("on", isStreaming);
    streamingToggleBtn.textContent = "M";
  }

  // 🔥 실제 데이터 파일도 같이 복원해야 정상 작동
  if (isStreaming) {
    if (currentMode === "short") {
      korFile = "kor_stream.json";
    } else if (currentMode === "long") {
      korLongFile = "kor_long_stream.json";
    }
  } else {
    if (currentMode === "short") {
      korFile = "kor.json";
    } else if (currentMode === "long") {
      korLongFile = "kor_long.json";
    }
  }
}

function wrapCharacter(ch) {
  const isIgnored = isIgnoredCharacter(ch);  // 무시 조건 직접 체크
  return `<span class="${isIgnored ? "ignored" : ""}">${ch}</span>`;
}

function isIgnoredCharacter(char) {
  const isPunctuation = /[.,!?'"“”‘’~]/.test(char);
  const isEnglish = /\p{Script=Latin}/u.test(char);
  const isNumber = /[0-9]/.test(char);
  const isSymbol = /[!@#$%^&*()_\-+={}\[\]|\\:;<>\?/~]/.test(char); 

  return (ignorePunctuation && isPunctuation)
      || (ignoreEnglish && isEnglish)
      || (ignoreNumbers && isNumber)
      || (ignoreSymbols && isSymbol);
}

togglePunctuationBtn.addEventListener("click", () => {
  ignorePunctuation = !ignorePunctuation;
  togglePunctuationBtn.classList.toggle("active", ignorePunctuation);
  saveSettings();
  renderCurrentSentence(previousSentence);
});

toggleNumbersBtn.addEventListener("click", () => {
  ignoreNumbers = !ignoreNumbers;
  toggleNumbersBtn.classList.toggle("active", ignoreNumbers);
  saveSettings();
  renderCurrentSentence(previousSentence);
});

toggleEnglishBtn.addEventListener("click", () => {
  ignoreEnglish = !ignoreEnglish;
  toggleEnglishBtn.classList.toggle("active", ignoreEnglish);
  saveSettings();
  renderCurrentSentence(previousSentence);
});

toggleSymbolsBtn.addEventListener("click", () => {
  ignoreSymbols = !ignoreSymbols;
  toggleSymbolsBtn.classList.toggle("active", ignoreSymbols);
  saveSettings();
  renderCurrentSentence(previousSentence);
});


function updateProgress() {
  const progressEl = document.getElementById("progress-bar");
  const percent = Math.min((inputEl.value.length / currentSentence.length) * 100, 100);
  progressEl.style.width = `${percent}%`;
}

// // 유저별 최근 CPM 배열 (세션 단위)
// const recentCPMs = [];
// let backspaceCount = 0;


// // 백스페이스 카운트
// inputEl.addEventListener("keydown", (e) => {
//   if (e.key === "Backspace") backspaceCount++;
// });

// // 표준편차 계산 함수
// function calculateStdDev(values) {
//   if (!values || values.length === 0) return 0;
//   const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
//   const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
//   return Math.sqrt(variance);
// }

// async function saveCurrentResult() {
//   const minutes = (Date.now() - startTime) / 1000 / 60;
//   const typedLength = getTypingCount(inputEl.value); // 한글 2타 계산 적용

//   const speedValue = Math.round(typedLength / minutes);
//   const speed = currentLang === "kor"
//     ? `${speedValue} CPM`
//     : `${Math.round((typedLength / 5) / minutes)} WPM`;

//   recentCPMs.push(speedValue);
//   if (recentCPMs.length > 20) recentCPMs.shift(); // 최근 20개만 유지

//   const stdDev = calculateStdDev(recentCPMs);

//   lastTypingRecord = {
//     sentence: currentSentence,
//     accuracy: currentAccuracy,
//     speed: speed,
//     stdDev: Math.round(stdDev),
//     backspaceCount
//   };

//   const sessionDuration = Date.now() - sessionStart;

//   // 의심 기준
//   const stdDevSuspicious = stdDev < 50 && currentAccuracy >= 95;
//   const suspicious = (
//     (speedValue > 1200 && currentAccuracy >= 98) ||                     
//     (sessionDuration >= 5 * 60 * 60 * 1000 && currentAccuracy >= 95) || 
//     stdDevSuspicious
//   );

//   if (suspicious) {
//     console.warn("Suspicious typing detected:", lastTypingRecord, { sessionDuration });

//     try {
//       const user = auth.currentUser;
//       const userId = user ? user.uid : "guest";

//       await db.collection("suspiciousRecords")
//         .doc(userId)
//         .collection("records")
//         .add({
//           speed: speedValue,
//           accuracy: currentAccuracy,
//           sentence: currentSentence,
//           backspaceCount,
//           timestamp: new Date(),
//           lang: currentLang,
//           sessionDuration,
//           stdDev
//         });

//       console.log("Suspicious record saved to Firestore.");
//     } catch (err) {
//       console.error("Failed to save suspicious record:", err);
//     }
//   }

//   backspaceCount = 0; // 초기화
// }

// 유저별 최근 CPM 배열 (세션 단위)
const recentCPMs = [];
let backspaceCount = 0;

// 🔹 백스페이스 입력 감지 (은밀히 수집)
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Backspace") backspaceCount++;
});

// 🔹 표준편차 계산 함수
function calculateStdDev(values) {
  if (!values || values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

async function saveCurrentResult() {
  const minutes = (Date.now() - startTime) / 1000 / 60;
  const typedLength = getTypingCount(inputEl.value); // 한글 2타 계산 적용

  // 🔹 속도 계산
  const speedValue = Math.round(typedLength / minutes);
  const speed = currentLang === "kor"
    ? `${speedValue} CPM`
    : `${Math.round((typedLength / 5) / minutes)} WPM`;

  // 🔹 최근 20개 CPM만 유지
  recentCPMs.push(speedValue);
  if (recentCPMs.length > 20) recentCPMs.shift();

  // 🔹 표준편차 계산
  const stdDev = calculateStdDev(recentCPMs);

  // 🔹 최근 기록 (화면 출력용)
  lastTypingRecord = {
    sentence: currentSentence,
    accuracy: currentAccuracy,
    speed: speed,
    stdDev: Math.round(stdDev)
  };

  const recordEl = document.getElementById("last-record");
  if (recordEl) {
    recordEl.innerHTML = `
      <div><strong>sentence: </strong> ${lastTypingRecord.sentence}</div>
      <div><strong>accuracy: </strong> ${lastTypingRecord.accuracy}%</div>
      <div><strong>CPM: </strong> ${lastTypingRecord.speed}</div>
    `;
  }

  console.log("currentSpeedText:", lastTypingRecord.speed);
  tryUpdateMaxCPM(lastTypingRecord.speed);

  // 🔹 세션 지속 시간 계산 (ms)
  const sessionDuration = Date.now() - sessionStart;

  // 🔹 의심 기준
  const stdDevSuspicious = recentCPMs.length >= 5 && stdDev < 50 && currentAccuracy >= 95;
  const suspicious = (
    (speedValue > 1200 && currentAccuracy >= 98) ||                     // 순간적 스파이크
    (sessionDuration >= 5 * 60 * 60 * 1000 && currentAccuracy >= 95) || // 2시간 이상 장시간
    stdDevSuspicious                                                    // 일정한 패턴
  );

  // 🔹 의심 기록 저장
  if (suspicious) {
    console.warn("Suspicious typing detected:", {
      speed: speedValue,
      accuracy: currentAccuracy,
      sentence: currentSentence,
      stdDev,
      sessionDuration,
      backspaceCount
    });

    try {
      const user = auth.currentUser;
      const userId = user ? user.uid : "guest";

      await db.collection("suspiciousRecords")
        .doc(userId)
        .collection("records")
        .add({
          speed: speedValue,
          accuracy: currentAccuracy,
          sentence: currentSentence,
          timestamp: new Date(),
          lang: currentLang,
          sessionDuration,
          stdDev,
          backspaceCount // ✅ 은밀히 저장 (UI에는 표시되지 않음)
        });

      console.log("Suspicious record saved to Firestore (with backspaceCount).");
    } catch (err) {
      console.error("Failed to save suspicious record:", err);
    }
  }

  // 다음 문장으로 넘어갈 때 백스페이스 카운트 초기화
  backspaceCount = 0;
}




// ✅ 이벤트 바인딩
inputEl.addEventListener("input", () => {
  if (!startTime) startTime = Date.now();
  updateHighlight();
  updateProgress();
  autoResizeInput();
});

// DB에서 누적값만 불러와서 인포 패널에 반영하는 함수 (count는 초기화하지 않음)
function refreshTotalTypingCount(uid) {
  db.collection("users").doc(uid).get()
    .then(doc => {
      const totalTypingCount = doc.exists ? doc.data().totalTypingCount || 0 : 0;

      // 인포 패널 누적 문장 수만 업데이트
      const totalSentencesEl = document.getElementById("total-sentences");
      if (totalSentencesEl) totalSentencesEl.textContent = totalTypingCount;

      // 누적 통계 텍스트도 업데이트
      const typingStatsDiv = document.getElementById("typing-stats");
      if (typingStatsDiv) {
        typingStatsDiv.textContent = totalTypingCount === 0
          ? "아직 타이핑 기록이 없습니다."
          : `누적 타이핑 횟수: ${totalTypingCount}회`;
      }
    })
    .catch(err => {
      console.error("누적 타이핑 횟수 새로고침 실패:", err);
    });
}

let isTypingCompleteInProgress = false;  // 중복 방지 플래그
let lastInputValue = ""; // 이전 입력값 저장

// ✅ 공통 함수: 타이핑 완료 처리
function handleTypingComplete() {
  if (isTypingCompleteInProgress) return;
  isTypingCompleteInProgress = true;

  const passedAccuracy = currentAccuracy >= 80;
  const inputEl = document.getElementById("input");

  // =========================
  // 정확도 80% 이상일 때만 점수/카운터/CPM 기록 반영
  // =========================
  if (passedAccuracy) {

    const user = auth.currentUser;

    if (user) {
        saveCurrentResult();
        saveTypingCount(user.uid, 1)
          .then(() => refreshTotalTypingCount(user.uid))
          .catch(console.error);
    }

    count++;
    countEl.textContent = count;

    if (count % 200 === 0) {
        const idx = (count / 200) - 1;
        showMilestoneMessage(idx);
    }

    onTypingComplete(false);

} else {

    onTypingComplete(true);
}


  // =========================
  // 입력 초기화 및 포커스 복구만 수행
  // =========================
  setTimeout(() => {
    inputEl.value = "";
    autoResizeInput();
    updateHighlight();
    resetVirtualCursor();

    if (!document.activeElement || document.activeElement !== inputEl) {
      inputEl.focus({ preventScroll: true });
    }

    isTypingCompleteInProgress = false;
  }, 20);
}



// ✅ 키다운 이벤트 (PC용)
inputEl.addEventListener("keydown", (e) => {
    const isEnter = e.key === "Enter";
    const isSpace = e.code === "Space";

    if (isEnter) e.preventDefault();

    // ✅ 문장 완료 체크 (inputToTargetMap + 무시 문자 스킵)
    let lastMappedIndex = inputToTargetMap.length > 0 
                          ? inputToTargetMap[inputToTargetMap.length - 1] 
                          : -1;

    let tempIndex = lastMappedIndex + 1;
    while (tempIndex < currentSentence.length &&
           (isIgnoredCharacter(currentSentence[tempIndex]) || currentSentence[tempIndex] === ' ')) {
        tempIndex++;
    }

    const isComplete = tempIndex >= currentSentence.length;

    if ((isEnter || isSpace) && isComplete) {
        handleTypingComplete();
    } else if (e.key === "Escape") {
        if (inputEl.value.length === 0) {
            skipCurrentSentence();
            resetVirtualCursor();
        } else {
            inputEl.value = "";
            updateHighlight();
            resetVirtualCursor();
            autoResizeInput();
        }
    }
});


// ✅ 인풋 이벤트 (모바일/태블릿용)
inputEl.addEventListener("input", (e) => {
  const value = e.target.value;

  const normalizedTargetLength = currentSentence
    .split('')
    .filter(c => !isIgnoredCharacter(c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim().length;

  const normalizedInputLength = value
    .replace(/\s+/g, ' ')
    .trim().length;

  const isComplete = normalizedInputLength >= normalizedTargetLength;

  // 🔍 이전 값과 비교해서 스페이스 입력 탐지
  const spaceJustAdded = value.endsWith(" ") && !lastInputValue.endsWith(" ");

  if (spaceJustAdded && isComplete && currentAccuracy >= 80) {
    handleTypingComplete();
  }

  lastInputValue = value;
});







// toggleBtn.addEventListener("click", () => {
//   document.body.classList.toggle("dark");
//   localStorage.setItem("darkMode", document.body.classList.contains("dark"));
//   toggleBtn.textContent = document.body.classList.contains("dark") ? "☀️ 라이트모드" : "🌙 다크모드";
// });

document.addEventListener("click", (e) => {
  if (isNicknameModalOpen) return;

  // 닉네임 모달이 열려있지 않을 때만 input에 포커스
  const inputEl = document.getElementById("input");
  if (inputEl) inputEl.focus();
});

document.addEventListener('DOMContentLoaded', () => {
  if (!isNicknameModalOpen) {
    document.getElementById('input').focus();
  }
});


document.querySelectorAll(".dropdown-content div").forEach(item => {
  item.addEventListener("click", async () => {
    try {
      const sector = item.getAttribute("data-sector");

      // ✅ 모드 전환 함수 호출
      switchMode("news");          // currentMode와 completedInCurrentMode 초기화
      currentLang = "kor";         // 한국어 고정
      currentNewsSector = sector;

      // 타자 카운트 초기화
      count = 0;
      countEl.textContent = "0";

      // 버튼 텍스트 갱신
      const sectorNames = {
        all: "전체",
        main: "메인",
        politics: "정치",
        economy: "경제",
        society: "사회",
        global: "국제",
        culture: "문화",
        entertainment: "연예",
        sports: "스포츠"
      };
      document.getElementById("newsDropdownBtn").textContent = `뉴스(${sectorNames[sector] || "전체"}) ▼`;

      // 섹터별 RSS URL 매핑
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

      // 뉴스 로딩
      if (sector === "all") {
        await fetchAllSectorsNews();
      } else {
        const rssUrl = sectorMap[sector];
        if (!rssUrl) throw new Error(`RSS URL이 존재하지 않습니다: ${sector}`);
        await fetchRSSNews(rssUrl);
      }

      // 유저 선택 저장
      saveUserPreferences();

    } catch (err) {
      console.error("뉴스 로딩 실패:", err);
      showNewsErrorMessage("뉴스를 불러오는 중 오류가 발생했습니다.");
      // fallback: 단문 모드로 전환
      switchMode("short");
      loadKoreanModeData("short");
    }
  });
});



async function fetchAllSectorsNews() {
  const sectors = ["01", "02", "03", "07", "08", "14", "09"];
  const baseUrl = "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=";

  try {
    // 섹터별 fetchRSSNewsForSector 호출
    const results = await Promise.allSettled(
      sectors.map(sec => fetchRSSNewsForSector(baseUrl + sec))
    );

    let allNewsItems = [];
    results.forEach(result => {
      if (result.status === "fulfilled") {
        allNewsItems = allNewsItems.concat(result.value);
      } else {
        console.warn("섹터 뉴스 로딩 실패:", result.reason);
      }
    });

    console.log("전체 합친 뉴스 개수:", allNewsItems.length);

    if (!allNewsItems.length) {
      showNewsErrorMessage("뉴스를 불러오지 못했습니다. 다시 시도해주세요.");
      return;
    }

    // 뉴스 섞기 (Fisher–Yates shuffle)
    for (let i = allNewsItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allNewsItems[i], allNewsItems[j]] = [allNewsItems[j], allNewsItems[i]];
    }

    // 전역 변수 갱신
    newsList = allNewsItems;
    sentences = newsList.map(n => n.sentence);
    usedNewsIndexes.clear();

    // 첫 문장 렌더링
    pickAndRenderNewSentence();

  } catch (err) {
    console.error("전체 섹터 뉴스 로딩 실패:", err);
    showNewsErrorMessage("뉴스 로딩 중 오류가 발생했습니다.");
  }
}


function showNewsErrorMessage(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = 'block';
  typingInput.disabled = true;  // typingInput도 마찬가지로 미리 선언해두었어야 함
}



// 섹터별 RSS를 받아서 뉴스 아이템 배열 리턴
async function fetchRSSNewsForSector(url) {
  const RSS_PROXY = "https://api-75pgkefxxa-uc.a.run.app/rss?url=";

  try {
    const res = await fetch(RSS_PROXY + encodeURIComponent(url));
    if (!res.ok) throw new Error("RSS 요청 실패");

    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, "application/xml");

    // 상위 10개 아이템 필터링
    const items = [...doc.querySelectorAll("item")].slice(0, 10).filter(item => {
      const rawTitle = item.querySelector("title")?.textContent || "";
      const rawDesc = item.querySelector("description")?.textContent || "";
      const rawContent = item.getElementsByTagName("content:encoded")[0]?.textContent || "";

      const lowerTitle = rawTitle.toLowerCase().trim();
      if (["클로징", "closing"].includes(lowerTitle)) return false;

      const combinedText = rawTitle + rawDesc + rawContent;
      if (containsBlockedKeyword(combinedText)) return false;

      return true;
    });

    const isKoreanNews = url.includes("sbs.co.kr");

    return items.map(item => {
      const title = cleanText(item.querySelector("title")?.textContent || "");
      const link = item.querySelector("link")?.textContent || "";

      // 이미지 추출
      let image = "";
      const thumbnail = item.getElementsByTagName("media:thumbnail")[0];
      const enclosure = item.getElementsByTagName("enclosure")[0];
      if (thumbnail?.getAttribute("url")) image = thumbnail.getAttribute("url");
      else if (enclosure?.getAttribute("url")) image = enclosure?.getAttribute("url") || "";

      // 내용 정제 및 요약
      let summary = "";
      if (isKoreanNews) {
        const content = item.getElementsByTagName("content:encoded")[0]?.textContent || "";
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = content;

        let paragraphs = [...tempDiv.querySelectorAll("p.change")];
        if (paragraphs.length === 0) paragraphs = [...tempDiv.querySelectorAll("p")];

        const filteredParagraphs = paragraphs
          .map(p => cleanText(p.textContent))
          .flatMap(p => splitIntoShortSentences(p))
          .filter(p => p.length > 10);

        summary = filteredParagraphs.slice(0, 2).join(" ");
      } else {
        const desc = cleanText(item.querySelector("description")?.textContent || "");
        summary = splitIntoShortSentences(desc).slice(0, 2).join(" ");
      }

      // 본문이 너무 짧으면 description 그대로 사용
      if (!summary || summary.length < 30) {
        const desc = cleanText(item.querySelector("description")?.textContent || "");
        summary = desc;
      }

      return {
        sentence: `${title}\n\n${summary}`,
        link,
        image
      };
    });
  } catch (err) {
    console.error("RSS 뉴스 로딩 실패:", err);
    return [];
  }
}




// Firebase 설정 - 본인 프로젝트 설정값으로 변경하세요
const firebaseConfig = {
  apiKey: "AIzaSyCwre-UUTpiGYKar7VDnHlSZiMNrJvDQ1c",
  authDomain: "typenews-dbe9c.firebaseapp.com",
  projectId: "typenews-dbe9c",
  storageBucket: "typenews-dbe9c.firebasestorage.app",
  messagingSenderId: "708412068978",
  appId: "1:708412068978:web:f644a5b8e957f160bc9eeb",
  measurementId: "G-VRQFLXE3FM"
};

firebase.initializeApp(firebaseConfig);
firebase.analytics(); // ✅ 여기에 넣으면 모든 순서 충돌 우려 없음

// Firebase 초기화
const auth = firebase.auth();
const db = firebase.firestore();

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userInfoDiv = document.getElementById("user-info");
const typingStatsDiv = document.getElementById("typing-stats");

const userNickname = document.getElementById("user-nickname");
const nicknameModal = document.getElementById("nickname-modal");
const modalOverlay = document.getElementById("modal-overlay");
const nicknameInput = document.getElementById("nickname-input");
const nicknameSaveBtn = document.getElementById("nickname-save-btn");



loginBtn.onclick = () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(console.error); // 에러만 처리, 성공 처리는 onAuthStateChanged에서
};

logoutBtn.onclick = async () => {
  try {
    await auth.signOut();
    location.reload(); // ✅ 로그아웃 완료 후 새로고침
  } catch (err) {
    console.error("로그아웃 실패:", err);
  }
};


// 닉네임 모달 표시 함수
function showNicknameModal() {
  modalOverlay.style.display = "block";
  nicknameModal.style.display = "block";
  isNicknameModalOpen = true;

  // 모달 열릴 때 닉네임 입력창에 포커스 줌
  document.getElementById("nickname-input").focus();
}

// 닉네임 모달 숨김 함수
function hideNicknameModal() {
  modalOverlay.style.display = "none";
  nicknameModal.style.display = "none";
  nicknameInput.value = ""; // 입력칸 초기화
  isNicknameModalOpen = false;

  // 모달 닫히면 타이핑 입력창에 다시 포커스 주기
  document.getElementById('input').focus();
}

// 닉네임 모달 취소 버튼 이벤트
document.getElementById('nickname-cancel-btn').addEventListener('click', async () => {
  hideNicknameModal();
  const user = auth.currentUser;
  if (user) {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("자동 로그아웃 실패:", err);
    }
  }
});

nicknameSaveBtn.addEventListener('click', async () => {
  const nickname = nicknameInput.value.trim();

  // 닉네임 길이 체크
  if (!nickname || nickname.length < 2 || nickname.length > 16) {
    alert("닉네임은 2자 이상 16자 이하로 입력해주세요.");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    alert("로그인 상태가 아닙니다.");
    return;
  }

  try {
    // 1. 닉네임 중복 체크 쿼리
    const querySnapshot = await db.collection("users")
     .where("displayNameLower", "==", nickname.toLowerCase()) // ✅ 수정
      .get();

    // 2. 중복된 닉네임이 있으면 저장 중단
    if (!querySnapshot.empty) {
      // 자신이 이미 같은 닉네임을 가지고 있다면 허용
      const isOwnNickname = querySnapshot.docs.some(doc => doc.id === user.uid);
      if (!isOwnNickname) {
        alert("이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.");
        return;
      }
    }

    // 3. 중복 없거나 본인 닉네임이면 저장 처리
    await db.collection("users").doc(user.uid).set({
      displayName: nickname,
       displayNameLower: nickname.toLowerCase(),  // ✅ 추가
      email: user.email
    }, { merge: true });

    currentUserNickname = nickname;

    userNickname.textContent = nickname;
    userNickname.style.display = "inline-block";
    hideNicknameModal();
    location.reload();
  } catch (error) {
    console.error("닉네임 저장 실패:", error);
    alert("닉네임 저장에 실패했습니다. 다시 시도해주세요.");
  }
});

let monthlyRankingInterval = null; // 🔁 전역 변수로 선언 (중복 방지 및 종료를 위해)
const ADMIN_UID = "9ZOc8fAzPZhZLPbom5g8jSMRdfb2";

let isAdminUser = false;

auth.onAuthStateChanged(async user => {
    // UI 요소 가져오기 (필요하다면 함수 밖에서 미리 선언해도 좋습니다)
    const typingStatsDiv = document.getElementById("typing-stats");
    const infoPanel = document.getElementById("info-panel"); // 현재 코드에서 사용되지 않지만 예시를 위해 남겨둠

    if (user) {
        // 사용자 로그인 시
        isAdminUser = user.uid === ADMIN_UID; // 관리자 여부 확인
        loginBtn.style.display = "none";
        logoutBtn.style.display = "inline-block";

        try {
            // 사용자 기본 정보 (닉네임, 이메일) 로드
            const userDoc = await db.collection("users").doc(user.uid).get();
            const userData = userDoc.data();

            if (userData && userData.displayName) {
                currentUserNickname = userData.displayName; // 닉네임 캐싱
                userNickname.textContent = currentUserNickname;
                userNickname.style.display = "inline-block";
                hideNicknameModal(); // 닉네임 모달 숨기기
            } else {
                // 닉네임이 없으면 모달 표시
                userNickname.style.display = "none";
                showNicknameModal();
            }

            // 모든 초기 데이터 로딩 및 실시간 리스너 설정을 병렬로 처리
            await Promise.all([
                // 랭킹 리스너 설정 (onSnapshot 사용으로 setInterval 대체)
                loadTopRankings(),       // 전체 랭킹
                loadMonthlyRankings(),   // 월간 랭킹

                // 사용자 통계 로딩
                loadTypingStats(user.uid),
                loadMaxCPM(user.uid),
                loadUserPreferences(user.uid),

                // ✅ 내 월간 점수 실시간 리스너 설정
                loadMyMonthlyScore(user.uid)
            ]);

            // 기존의 monthlyRankingInterval은 onSnapshot으로 대체되었으므로 제거합니다.
            if (monthlyRankingInterval) {
                 clearInterval(monthlyRankingInterval);
                 monthlyRankingInterval = null;
                 console.log("Monthly ranking interval cleared as onSnapshot is active.");
            }


        } catch (error) {
            console.error("사용자 데이터 로드 중 오류 발생:", error);
            // 오류 발생 시에도 닉네임 모달을 표시하여 사용자에게 닉네임 설정을 유도
            userNickname.style.display = "none";
            showNicknameModal();
        }

    } else {
        // 사용자 로그아웃 시
        isAdminUser = false; // 관리자 권한 해제
        // UI 초기화
        loginBtn.style.display = "inline-block";
        logoutBtn.style.display = "none";
        userNickname.style.display = "none";
        hideNicknameModal();
        currentUserNickname = "익명"; // 캐시된 닉네임 초기화

        // 모든 실시간 리스너 해제 (로그아웃 시 중요!)
        if (unsubscribeTopRankings) {
            unsubscribeTopRankings();
            unsubscribeTopRankings = null;
            console.log("Top rankings listener unsubscribed.");
        }
        if (unsubscribeMonthlyRankings) {
            unsubscribeMonthlyRankings();
            unsubscribeMonthlyRankings = null;
            console.log("Monthly rankings listener unsubscribed.");
        }
        if (unsubscribeMyMonthlyScore) {
            unsubscribeMyMonthlyScore();
            unsubscribeMyMonthlyScore = null;
            console.log("My monthly score listener unsubscribed.");
        }

        // 월간 랭킹 갱신 Interval이 남아있다면 해제 (이전 버전 호환성)
        if (monthlyRankingInterval) {
            clearInterval(monthlyRankingInterval);
            monthlyRankingInterval = null;
            console.log("Monthly ranking interval cleared on logout.");
        }

        // 배경 및 모드 초기화 (예시, 실제 함수가 있어야 작동)
        applyBackground("default");
        loadKoreanModeData("short");
    }
});

function setMode(mode) {
    currentMode = mode;        // "news", "short", "long" 등
    isNewsMode = (mode === "news"); 
}

async function enterNewsMode(sector = "all") {
    try {
        await fetchRSSNewsForSector(sector); // 실패 시 catch로 이동
        setMode("news");
    } catch(err) {
        console.error("뉴스 로딩 실패:", err);
        isNewsMode = false;
        currentMode = "short"; // 기본 단문 모드로 fallback
        alert("뉴스 로딩 실패, 단문 모드로 전환됩니다.");
    }
}



function loadTypingStats(uid) {
  db.collection("users").doc(uid).get()
    .then(doc => {
      totalTypingCount = doc.exists ? doc.data().totalTypingCount || 0 : 0;

      // 세션 카운트는 0으로 초기화 (기존 count 변수는 세션 카운트 용)
      count = 0;
      countEl.textContent = count;

      const typingStatsDiv = document.getElementById("typing-stats");
      if (typingStatsDiv) {
        typingStatsDiv.textContent = totalTypingCount === 0
          ? "아직 타이핑 기록이 없습니다."
          : `누적 타이핑 횟수: ${totalTypingCount}회`;
      }

      const totalSentencesEl = document.getElementById("total-sentences");
      if (totalSentencesEl) totalSentencesEl.textContent = totalTypingCount;
    })
    .catch(err => {
      console.error("타이핑 기록 로딩 실패:", err);
      count = 0;
      countEl.textContent = count;
    });
}



function saveTypingCount(uid, countToAdd) {
  const userRef = db.collection("users").doc(uid);

  const dataToUpdate = {
    totalTypingCount: firebase.firestore.FieldValue.increment(countToAdd)
  };

  // 🔽 여기서 로그 찍기
  console.log("업데이트하려는 값:", dataToUpdate);
  console.log("Object.keys(dataToUpdate):", Object.keys(dataToUpdate));

  return userRef.set(dataToUpdate, { merge: true }); // 기존 데이터 유지 + 누적
}


async function loadMaxCPM(uid) {
  try {
    const doc = await db.collection("users").doc(uid).get();
    if (doc.exists) {
      maxCPM = doc.data().maxCPM || 0;
    } else {
      maxCPM = 0;
      await db.collection("users").doc(uid).set({ maxCPM: 0 }, { merge: true });
    }
    if (maxCPMElement) maxCPMElement.textContent = maxCPM;
  } catch (err) {
    console.error("최고 CPM 불러오기 실패:", err);
    maxCPM = 0;
    if (maxCPMElement) maxCPMElement.textContent = "-";
  }
}

async function tryUpdateMaxCPM(currentSpeedText) {
    console.log("🔍 tryUpdateMaxCPM 호출됨, 입력값:", currentSpeedText);

    const match = currentSpeedText.match(/(\d+)\s*CPM/);
    if (!match) {
        console.warn("CPM 형식이 아님:", currentSpeedText);
        return;
    }

    const currentCPM = parseInt(match[1], 10);

    if (
        typeof currentCPM !== "number" ||
        !Number.isFinite(currentCPM) ||
        currentCPM <= maxCPM ||
        currentCPM > 5000
    ) {
        console.warn("유효하지 않은 CPM 값:", currentCPM);
        return;
    }

    maxCPM = currentCPM;
    if (maxCPMElement) maxCPMElement.textContent = maxCPM;

    const user = auth.currentUser;
    if (!user) {
        console.warn("사용자 없음");
        return;
    }

    try {
        console.log("📤 저장 시도: maxCPM =", maxCPM);
        // 여기에 console.log 추가: Firestore로 보내는 객체 확인
        console.log("Sending to users collection:", { maxCPM: maxCPM });
        await db.collection("users").doc(user.uid).set({ maxCPM }, { merge: true });
        console.log("✅ 최고 CPM 저장 성공");
    } catch (err) {
        console.error("❌ 최고 CPM 저장 실패:", err);
    }
}

function switchMode(newMode) {
    currentMode = newMode;
    isNewsMode = (newMode === "news");
    completedInCurrentMode = 0; // 모드 전환 시 카운터 초기화
}


// ✅ 문장 완료 처리 및 렌더링 (한 곳에서만)
async function onTypingComplete(preventScoreUpdate = false) {

  console.log("🔍 onTypingComplete 호출됨");

  // 문장 히스토리 저장
  getCurrentHistory().push(currentSentence);

  const user = auth.currentUser;

  const shouldUpdateScore =
    user && currentAccuracy >= 80 && !preventScoreUpdate;

  if (shouldUpdateScore) {

    const uid = user.uid;

    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    const statRef = db.collection("users")
      .doc(uid)
      .collection("monthlyStats")
      .doc(yearMonth);

    const nickname = currentUserNickname;

    const isNewsMode = currentMode === "news";
    const isEnglishNews = isNewsMode && currentLang === "eng";
    const isKoreanNews = isNewsMode && currentLang === "kor";
    const isLongMode = isEnglishNews || isKoreanNews || currentMode === "long";
    const isShortMode = currentMode === "short" || currentMode === "word";

    if (isEnglishNews) {

      completedInCurrentMode = (completedInCurrentMode || 0) + 1;

      if (completedInCurrentMode >= 2) {
        await statRef.set({
          typingCount: firebase.firestore.FieldValue.increment(1),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          nickname,
          email: user.email,
          month: yearMonth
        }, { merge: true });

        completedInCurrentMode = 0;
      }

    } else if (isLongMode) {

      await statRef.set({
        typingCount: firebase.firestore.FieldValue.increment(1),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        nickname,
        email: user.email,
        month: yearMonth
      }, { merge: true });

    } else if (isShortMode) {

      completedInCurrentMode = (completedInCurrentMode || 0) + 1;

      if (completedInCurrentMode >= 5) {
        await statRef.set({
          typingCount: firebase.firestore.FieldValue.increment(1),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          nickname,
          email: user.email,
          month: yearMonth
        }, { merge: true });

        completedInCurrentMode = 0;
      }

    }
  }

  // ⭐⭐⭐ 로그인 여부 상관없이 항상 실행
  pickAndRenderNewSentence();
  inputEl.value = "";
  resetVirtualCursor();
  autoResizeInput();
  updateHighlight();
  inputEl.focus({ preventScroll: true });
}




async function loadTopRankings(limit = 10) {
  if (unsubscribeTopRankings) {
    unsubscribeTopRankings(); // 기존 리스너 해제
  }

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  unsubscribeTopRankings = db.collectionGroup("monthlyStats")
    .where("month", "==", yearMonth)
    .orderBy("typingCount", "desc")
    .limit(limit)
    .onSnapshot(snapshot => {
      const rankings = snapshot.docs.map((doc, i) => {
        const data = doc.data();
        return {
          rank: i + 1,
          nickname: data.nickname || "익명",
          count: data.typingCount || 0,
          email: data.email || "",
          uid: doc.ref.parent.parent.id
        };
      });
      renderRanking(rankings, "top-ranking-list");
    }, error => {
      console.error("전체 랭킹 실시간 불러오기 실패:", error);
    });
}


async function loadTopRankings(limit = 10) {
    if (unsubscribeTopRankings) {
        unsubscribeTopRankings(); // 기존 리스너 해제
    }

    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    unsubscribeTopRankings = db.collectionGroup("monthlyStats")
        .where("month", "==", yearMonth)
        .orderBy("typingCount", "desc")
        .limit(limit)
        .onSnapshot(snapshot => {
            const rankings = snapshot.docs.map((doc, i) => {
                const data = doc.data();
                return {
                    rank: i + 1,
                    nickname: data.nickname || "익명",
                    count: data.typingCount || 0,
                    email: data.email || "",
                    uid: doc.ref.parent.parent.id
                };
            });
            renderRanking(rankings, "top-ranking-list");
        }, error => {
            console.error("전체 랭킹 실시간 불러오기 실패:", error);
        });
}


async function loadMonthlyRankings(month = "202507", limit = 70) { // month는 실제 현재 월을 사용해야 합니다.
    if (unsubscribeMonthlyRankings) {
        unsubscribeMonthlyRankings(); // 기존 리스너 해제
    }

    // 실제 월을 동적으로 가져오는 것이 좋습니다.
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    unsubscribeMonthlyRankings = db.collectionGroup("monthlyStats")
        .where("month", "==", currentYearMonth) // ✅ 현재 월로 변경
        .orderBy("typingCount", "desc")
        .limit(limit)
        .onSnapshot(snapshot => {
            const rankings = snapshot.docs.map((doc, i) => {
                const data = doc.data();
                return {
                    rank: i + 1,
                    nickname: data.nickname || "익명",
                    count: data.typingCount || 0,
                    email: data.email || "",
                    uid: doc.ref.parent.parent.id
                };
            });
            renderRanking(rankings, "monthly-ranking-list");
        }, error => {
            console.error("월간 랭킹 실시간 불러오기 실패:", error);
        });
}



function renderRanking(rankings, elementId = "monthly-ranking-list") {
  const rankingList = document.getElementById(elementId);
  if (!rankingList) return;

  rankingList.innerHTML = "";

  // ✅ 50개까지만 자르기
  const limitedRankings = rankings.slice(0, 50);

   if (isAdminUser) {
    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "📥 월간 랭킹 다운로드";
    downloadBtn.style.marginBottom = "10px";
    downloadBtn.onclick = () => downloadMonthlyRanking(limitedRankings);
    rankingList.appendChild(downloadBtn);
  }

  limitedRankings.forEach(user => {
    const li = document.createElement("li");

    let adminInfo = "";
if (isAdminUser) {
  adminInfo = document.createElement("div");
  adminInfo.style.color = "gray";
  adminInfo.style.fontSize = "12px";
  adminInfo.innerHTML = `
    UID: ${user.uid || "N/A"}<br>
    Email: ${user.email || "N/A"}
  `;
  li.appendChild(adminInfo);
}
  const crown = {
  1: "🥇",
  2: "🥈",
  3: "🥉"
};

li.innerHTML = `
  <div class="ranking-item card-style">
    <div class="card-left">
      <span class="rank">${crown[user.rank] || user.rank + "위"}</span>
      <span class="name">${user.nickname}</span>
    </div>
    <div class="card-right">
      <span class="count">${user.count}점</span>
    </div>
  </div>
`;

// 관리자 정보 별도 추가
if (isAdminUser) {
  const adminInfo = document.createElement("div");
  adminInfo.style.color = "gray";
  adminInfo.style.fontSize = "12px";
  adminInfo.style.marginTop = "4px";
  adminInfo.innerHTML = `
    UID: ${user.uid || "N/A"}<br>
    Email: ${user.email || "N/A"}
  `;
  li.appendChild(adminInfo);
}

rankingList.appendChild(li);
  });
}

function downloadMonthlyRanking(rankings) {
  // 70개까지만 제한
  const limitedRankings = rankings.slice(0, 70);

  let text = "월간 랭킹 리스트\n\n";
  limitedRankings.forEach(user => {
    text += `${user.rank}위: ${user.nickname} - ${user.count}점 (UID: ${user.uid || "N/A"}, Email: ${user.email || "N/A"})\n`;
  });

  // 핀볼 룰렛용 복제 리스트 생성
  text += "\n\n핀볼 룰렛용 리스트\n";

  limitedRankings.forEach(user => {
    let count = 1;
    if (user.rank === 1) count = 8;
    else if (user.rank === 2) count = 5;
    else if (user.rank === 3) count = 3;
    else if (user.rank >= 4 && user.rank <= 10) count = 2;
    else if (user.rank >= 11 && user.rank <= 50) count = 1;
    else count = 0; // 51위부터는 룰렛에 안 넣음

    if (count > 0) {
      text += `${user.nickname}*${count},`;
    }
  });

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `monthly_ranking_${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}




async function loadMyMonthlyScore(uid) {
    if (unsubscribeMyMonthlyScore) {
        unsubscribeMyMonthlyScore(); // 기존 리스너 해제
    }

    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const statRef = db.collection("users").doc(uid).collection("monthlyStats").doc(yearMonth);

    unsubscribeMyMonthlyScore = statRef.onSnapshot(doc => {
        const score = doc.exists ? doc.data().typingCount || 0 : 0;
        const scoreEl = document.getElementById("monthly-score");
        if (scoreEl) scoreEl.textContent = score;
    }, err => {
        console.error("이달의 점수 실시간 불러오기 실패:", err);
    });
}

// 한국어 모드
korModeDropdown.querySelectorAll("div").forEach(item => {
  item.addEventListener("click", () => {
    const newMode = item.getAttribute("data-mode"); // ✅ newMode 선언
    switchMode(newMode); // 모드 초기화
    currentLang = "kor";
    korModeBtn.textContent = `한국어(${item.textContent}) ▼`;

    updateMemeButtonState();      // 밈 제외 버튼 상태 갱신
    loadKoreanModeData(newMode);  // 한국어 데이터 로드
    saveUserPreferences();
  });
});




function loadKoreanModeData(mode) {
  if (mode === "word") {
    fetch("kor_words.json")
      .then(res => res.json())
      .then(data => {
        const randomSentences = [];
        for (let i = 0; i < 10; i++) {
          const randomWords = getRandomWords(data, 10);
          randomSentences.push(randomWords.join(" "));
        }
        sentences = randomSentences;
        pickAndRenderNewSentence();
      });
  } else if (mode === "short") {
    fetchSentences("kor");
  } else if (mode === "long") {
    fetch("kor_long.json")
      .then(res => res.json())
      .then(data => {
        sentences = data;
        pickAndRenderNewSentence();
      });
  }
}


function loadEnglishModeData(mode) {
  if (mode === "word") {
    fetch("eng_words.json")
      .then(res => res.json())
      .then(data => {
        const randomSentences = [];
        for (let i = 0; i < 10; i++) {
          const randomWords = getRandomWords(data, 10);
          randomSentences.push(randomWords.join(" "));
        }
        sentences = randomSentences;
        pickAndRenderNewSentence();
      });
  } else if (mode === "short") {
    fetchSentences("eng");
  } else if (mode === "long") {
    fetch("eng_long.json")
      .then(res => res.json())
      .then(data => {
        sentences = data;
        pickAndRenderNewSentence();
      });
  }
}



function getRandomWords(array, count) {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}


// 버튼 클릭 시 드롭다운 토글
korModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();  // 이벤트 버블링 차단
  // 영어 드롭다운 닫기
  engDropdown.classList.remove("show");
newsDropdown.classList.remove("open");
  // 한국어 드롭다운 토글
  korDropdown.classList.toggle("show");
});

engModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();  // 이벤트 버블링 차단
  // 한국어 드롭다운 닫기
  korDropdown.classList.remove("show");
newsDropdown.classList.remove("open");
  // 영어 드롭다운 토글
  engDropdown.classList.toggle("show");
});

// 문서 클릭 시 모든 드롭다운 닫기
document.addEventListener("click", () => {
  korDropdown.classList.remove("show");
  engDropdown.classList.remove("show");
  newsDropdown.classList.remove("open");
});

newsDropdownBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  korDropdown.classList.remove("show");
  engDropdown.classList.remove("show");

  newsDropdown.classList.toggle("open");
});

newsDropdown.addEventListener("click", (e) => e.stopPropagation());



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
  "이미 사망한 키보드입니다.",
  // 필요하면 더 추가 가능
];

// 메시지 엘리먼트
const milestoneTextEl = document.getElementById("milestone-text");

// 메시지 표시 함수

function showMilestoneMessage(idx) {
  if (idx < 0 || idx >= milestoneMessages.length) return;

  milestoneTextEl.textContent = milestoneMessages[idx];
  milestoneTextEl.style.opacity = "1";
  milestoneTextEl.style.transform = "translateY(0)";

  // 3초 후 서서히 사라짐
   setTimeout(() => {
    milestoneTextEl.style.opacity = "0";
    milestoneTextEl.style.transform = "translateY(10px)";
  }, 2000);
}

function splitIntoShortSentences(text, maxLen = 80) {
  const sentenceEndRegex = /(?<=[.!?。])\s+/g;
  const roughSentences = text.split(sentenceEndRegex);

  const result = [];

  for (let sentence of roughSentences) {
    sentence = sentence.trim();
    // 길이가 너무 길면 그냥 무시
    if (sentence.length > 10 && sentence.length <= maxLen) {
      result.push(sentence);
    }
  }

  return result;
}


function applyBackground(preset) {
  // 스타일 초기화
  document.body.classList.remove(
    "bg-default", "bg-sky", "bg-sunset", "bg-insta",
    "bg-forest", "bg-oceon", "bg-twilight", "bg-custom-gradient", "dark-mode"
  );
  document.body.style.background = "";
  document.body.style.animation = "";
  document.body.style.color = "";

  // ✅ 모든 커스텀 스타일 제거 (초반에 한 번만)
  const styleEl = document.getElementById("global-color-style");
  if (styleEl) styleEl.remove();

  // 🎨 커스텀 솔리드
  if (preset === "custom-solid") {
     if (document.body.classList.contains("dark-mode")) return;
    const bgColor = localStorage.getItem("customSolidColor") || "#ffffff";
    const textColor = localStorage.getItem("customTextColor") || "#000000";
    const buttonBgColor = localStorage.getItem("customButtonBgColor") || "#007bff";

    document.body.style.background = bgColor;
    document.body.style.setProperty('--svg-black', buttonBgColor);
    document.body.style.setProperty('--svg-type', textColor);
    applyColors(textColor, buttonBgColor);
    applyProgressBarColor("custom-solid");
    
    return;
  }

  // 🎨 커스텀 그라디언트
  if (preset === "custom-gradient") {
     if (document.body.classList.contains("dark-mode")) return;
    const c1 = localStorage.getItem("gradColor1") || "#ffffff";
    const c2 = localStorage.getItem("gradColor2") || "#cccccc";
    const c3 = localStorage.getItem("gradColor3") || "#999999";
    const textColor = localStorage.getItem("gradientTextColor") || "#000000";
    const buttonBgColor = localStorage.getItem("gradientButtonBgColor") || "#007bff";

    document.body.style.setProperty('--c1', c1);
    document.body.style.setProperty('--c2', c2);
    document.body.style.setProperty('--c3', c3);
    applyColors(textColor, buttonBgColor);
    document.body.classList.add("bg-custom-gradient");
    document.body.style.setProperty('--svg-black', buttonBgColor);
    document.body.style.setProperty('--svg-type', textColor);

    applyProgressBarColor("custom-gradient");
    return;
  }

  // ✅ 그 외 프리셋
applyProgressBarColor(preset);

if (preset === "dark") {
  isDarkMode = true;
  document.body.classList.add("dark-mode");
  document.body.style.color = "#ffffff";

    const existingStyle = document.getElementById("global-color-style");
  if (existingStyle) existingStyle.remove();
  return;
} else {
  isDarkMode = false;
  currentBg = preset;
  document.body.classList.add(`bg-${preset}`);
  document.body.style.color = "";

  // ✅ 프리셋별 기본 SVG 색 설정 (원하는 색으로 맞춰도 됨)
  document.body.style.setProperty('--svg-black', '#0a0a0a');
  document.body.style.setProperty('--svg-type', '#0a0a0a');
}
}



function applyColors(textColor, buttonBgColor) {
   if (document.body.classList.contains("dark-mode")) return;
  // 기존 스타일 제거
  const existingStyle = document.getElementById("global-color-style");
  if (existingStyle) {
    existingStyle.remove();
  }

  // 투명도 0.7 적용
  const buttonBgColorWithAlpha = hexToRgba(buttonBgColor, 0.8);

  // document.body.style.setProperty('--svg-black', textColor);
  
  // 새 스타일 추가
  const style = document.createElement("style");
  style.id = "global-color-style";
  style.innerHTML = `
    body, body * {
      color: ${textColor} !important;
    }
    button {
      background-color: ${buttonBgColorWithAlpha} !important;
    }
      .fab,
       .mode-dropdown-content,
  .dropdown-content,
  .mode-dropdown-content div,
  .dropdown-content div {
    background-color: ${buttonBgColorWithAlpha} !important;
    color: ${textColor} !important;
  }
     #sentence span.correct {
    color: currentColor !important;
    text-shadow: 0.5px 0 2px currentColor !important;
     filter:brightness(0.8);
  }
  #sentence span.incorrect {
    color: rgba(209, 29, 29, 0.8) !important;
    text-shadow: 0.5px 0 3.5px currentColor !important;
    filter:blur(0.6px);
  }
  `;
  document.head.appendChild(style);
}

function hexToRgba(hex, alpha) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map(x => x + x).join('');
  }
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


document.getElementById("custom-text-color").addEventListener("input", (e) => {
  localStorage.setItem("customTextColor", e.target.value);
  applyBackground("custom-solid");
  saveUserPreferences();
});

document.getElementById("gradient-text-color").addEventListener("input", () => {
  const color = document.getElementById("gradient-text-color").value;
  localStorage.setItem("gradientTextColor", color);
  applyBackground("custom-gradient");
  saveUserPreferences();
});

document.getElementById("custom-button-bg-color").addEventListener("input", (e) => {
  localStorage.setItem("customButtonBgColor", e.target.value);
  applyBackground("custom-solid");
  saveUserPreferences();
});

document.getElementById("gradient-button-bg-color").addEventListener("input", (e) => {
  localStorage.setItem("gradientButtonBgColor", e.target.value);
  applyBackground("custom-gradient");
  saveUserPreferences();
});



// ✅ applyProgressBarColor 함수를 전역 스코프로 이동 (applyBackground보다 먼저 선언)
function applyProgressBarColor(bgPreset) {
    let gradient = "linear-gradient(90deg, #aaa, #888, #aaa)"; // fallback

    if (bgPreset === "custom-solid") {
    const color = localStorage.getItem("customSolidColor") || "#ccc";
    gradient = `linear-gradient(90deg, ${color}, ${color}, ${color})`;
  }

  if (bgPreset === "custom-gradient") {
    const c1 = localStorage.getItem("gradColor1") || "#ffffff";
    const c2 = localStorage.getItem("gradColor2") || "#cccccc";
    const c3 = localStorage.getItem("gradColor3") || "#999999";
    gradient = `linear-gradient(90deg, ${c1}, ${c2}, ${c3}, ${c2}, ${c1})`;
  }

    switch (bgPreset) {
        case "sky":
            gradient = "linear-gradient(90deg,rgb(244, 227, 255),rgb(230, 247, 255),rgb(171, 221, 245),rgb(244, 227, 255))";
            break;
        case "sunset":
            gradient = "linear-gradient(90deg, rgb(255, 167, 193),rgb(255, 226, 217), #ffb74d,rgb(255, 167, 193))";
            break;
        case "forest":
            gradient = "linear-gradient(90deg,rgb(189, 216, 190), #a5d6a7, #66bb6a, rgb(189, 216, 190))";
            break;
        case "oceon":
            gradient = "linear-gradient(90deg,rgb(233, 249, 253),rgb(199, 249, 255),rgb(137, 241, 255),rgb(233, 249, 253))";
            break;
        case "insta":
            gradient = "linear-gradient(90deg, #fd1d1d, #833ab4, #fcb045, #fd1d1d)";
            break;
        case "twilight":
            gradient = "linear-gradient(90deg,rgb(221, 223, 231),  #becce6, #cebddf, rgb(221, 223, 231))";
            break;
        case "dark":
            gradient = "linear-gradient(90deg, #444, #fff, #444)";
            break;
        case "default":
            gradient = "linear-gradient(90deg,rgb(240, 240, 240),rgb(235, 235, 235),rgb(179, 179, 179), rgb(240, 240, 240))";
            break;
    }
    document.documentElement.style.setProperty('--progress-bar-gradient', gradient);
}


function getKoreanModeText(mode) {
    const map = {
        "word": "단어",
        "short": "단문",
        "long": "장문"
    };
    return map[mode] || "단문";
}

function getEnglishModeText(mode) {
    const map = {
        "word": "Words",
        "short": "Short",
        "long": "Long"
    };
    return map[mode] || "Short";
}


async function loadUserPreferences(uid) {
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists || !userDoc.data().preferences) {
      console.log("저장된 사용자 설정이 없습니다. 기본값으로 시작합니다.");
      applyBackground("default");
      loadKoreanModeData("short");
      return;
    }

    const preferences = userDoc.data().preferences;

    // ====================== 배경 적용 ======================
    if (preferences.background === "custom-solid") {
      localStorage.setItem("customSolidColor", preferences.customSolidColor || "#ffffff");
      localStorage.setItem("customTextColor", preferences.customTextColor || "#000000");
      localStorage.setItem("customButtonBgColor", preferences.customButtonBgColor || "#007bff");
    }

    if (preferences.background === "custom-gradient") {
      localStorage.setItem("gradColor1", preferences.gradColor1 || "#ffffff");
      localStorage.setItem("gradColor2", preferences.gradColor2 || "#cccccc");
      localStorage.setItem("gradColor3", preferences.gradColor3 || "#999999");
      localStorage.setItem("gradientTextColor", preferences.gradientTextColor || "#000000");
      localStorage.setItem("gradientButtonBgColor", preferences.gradientButtonBgColor || "#007bff");
    }

    applyBackground(preferences.background);

    // ====================== 언어 & 모드 적용 ======================
    if (preferences.languageMode && preferences.typingMode) {
      currentLang = preferences.languageMode;

      const ignoreEnglishBtn = document.getElementById("toggle-english");
      if (currentLang === "kor") {
        korModeBtn.textContent = `한국어(${getKoreanModeText(preferences.typingMode)}) ▼`;
        ignoreEnglishBtn.disabled = false;
      } else {
        engModeBtn.textContent = `English(${getEnglishModeText(preferences.typingMode)}) ▼`;
        ignoreEnglishBtn.disabled = true;
        ignoreEnglishBtn.classList.remove("active");
        ignoreEnglish = false;
      }

      const sectorNameToCode = {
        "전체": "all",
        "메인": "main",
        "정치": "politics",
        "경제": "economy",
        "사회": "society",
        "국제": "global",
        "문화": "culture",
        "연예": "entertainment",
        "스포츠": "sports"
      };

      const newsUrlMap = {
        all: "fetchAllSectorsNews",
        main: "https://news.sbs.co.kr/news/headlineRssFeed.do",
        politics: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01",
        economy: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02",
        society: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03",
        global: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07",
        culture: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08",
        entertainment: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14",
        sports: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09"
      };

      // ====================== 뉴스 모드 처리 ======================
      if (preferences.typingMode === "news") {
        isNewsMode = true;
        currentMode = "news";

        let newsSectorCode = "all";

        if (currentLang === "kor" && preferences.newsSector) {
          newsSectorCode = newsUrlMap[preferences.newsSector]
            ? preferences.newsSector
            : sectorNameToCode[preferences.newsSector] || "all";
        }

        currentNewsSector = newsSectorCode;

        const codeToSectorName = Object.fromEntries(
          Object.entries(sectorNameToCode).map(([k, v]) => [v, k])
        );
        document.getElementById("newsDropdownBtn").textContent = `뉴스(${codeToSectorName[newsSectorCode] || "전체"}) ▼`;

        try {
          if (newsSectorCode === "all") {
            await fetchAllSectorsNews();
          } else {
            await fetchRSSNews(newsUrlMap[newsSectorCode]);
          }
        } catch (err) {
          console.error("뉴스 로딩 실패:", err);
          showNewsErrorMessage("뉴스 로딩 중 오류가 발생했습니다.");
        }

      } else {
        // 뉴스 모드가 아닐 때
        isNewsMode = false;
        currentNewsSector = null;
        currentMode = preferences.typingMode;

        if (currentLang === "kor") loadKoreanModeData(preferences.typingMode);
        else loadEnglishModeData(preferences.typingMode);
      }
    }

    console.log("사용자 설정이 성공적으로 로드되었습니다.");

  } catch (error) {
    console.error("사용자 설정 로드 실패:", error);
    applyBackground("default");
    loadKoreanModeData("short");
  }
}


// ====================================================================
// DOMContentLoaded 이벤트 리스너 시작
// ====================================================================

document.addEventListener("DOMContentLoaded", () => {
    let clickCount = 0;
    const siteTitle = document.getElementById("site-title");
    const inputEl = document.getElementById("input");
    const meowSound = new Audio("keyboard-click.wav");
    meowSound.volume = 0.3;

    // 🔥 maxCPMElement 할당
    maxCPMElement = document.getElementById("max-cpm");

    // 버튼/드롭다운 변수 선언
    const ignoreEnglishBtn = document.getElementById("toggle-english");
    const engModeBtn = document.getElementById("engModeBtn");
    const korModeBtn = document.getElementById("korModeBtn");
    const engModeDropdown = document.querySelector(".eng-mode-dropdown-content");
    const korModeDropdown = document.querySelector(".kor-mode-dropdown-content");

    // ================================
    // 영어 모드 선택 이벤트 핸들러
    // ================================
    engModeDropdown.querySelectorAll("div").forEach(item => {
        item.addEventListener("click", () => {
            const selectedMode = item.getAttribute("data-mode");

            currentEngMode = selectedMode;
            currentMode = selectedMode;
            currentLang = "eng";

            engModeBtn.textContent = `English(${item.textContent}) ▼`;

            ignoreEnglishBtn.disabled = true;
            ignoreEnglishBtn.classList.remove("active");
            ignoreEnglish = false;

            updateMemeButtonState();
            loadEnglishModeData(selectedMode);
            saveUserPreferences();
        });
    });

    // 영어 뉴스 모드
    document.getElementById("langNews").addEventListener("click", async () => {
        try {
            switchMode("news");
            currentLang = "eng";

            ignoreEnglishBtn.disabled = true;
            ignoreEnglishBtn.classList.remove("active");
            ignoreEnglish = false;

            updateMemeButtonState();
            await fetchRSSNews("http://feeds.bbci.co.uk/news/world/rss.xml");
            saveUserPreferences();
        } catch (err) {
            console.error("영어 뉴스 로딩 실패:", err);
            showNewsErrorMessage("뉴스를 불러오는 중 오류가 발생했습니다.");
            switchMode("short");
            loadEnglishModeData("word"); // fallback
        }
    });

    // ================================
    // 한국어 모드 선택 이벤트 핸들러
    // ================================
    korModeDropdown.querySelectorAll("div").forEach(item => {
        item.addEventListener("click", () => {
            const selectedMode = item.getAttribute("data-mode");

            currentMode = selectedMode;
            currentLang = "kor";

            korModeBtn.textContent = `한국어(${item.textContent}) ▼`;

            ignoreEnglishBtn.disabled = false;

            loadKoreanModeData(selectedMode);
            saveUserPreferences();
        });
    });

    // 한국어 뉴스 모드
    document.querySelector(".dropdown-content").querySelectorAll("div").forEach(item => {
        item.addEventListener("click", () => {
            currentLang = "kor";
            ignoreEnglishBtn.disabled = false;
            updateMemeButtonState();

            const sector = item.getAttribute("data-sector");
            fetchRSSNewsForSector(sector);
            saveUserPreferences();
        });
    });




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

    const toggleBtn = document.getElementById("bg-toggle-btn");
    const optionsBox = document.getElementById("bg-options");

    document.getElementById("custom-solid-picker").addEventListener("input", (e) => {
  localStorage.setItem("customSolidColor", e.target.value);
  applyBackground("custom-solid");
  saveUserPreferences();
});

["grad-color-1", "grad-color-2", "grad-color-3"].forEach((id, index) => {
  document.getElementById(id).addEventListener("input", () => {
    const c1 = document.getElementById("grad-color-1").value;
    const c2 = document.getElementById("grad-color-2").value;
    const c3 = document.getElementById("grad-color-3").value;

    localStorage.setItem("gradColor1", c1);
    localStorage.setItem("gradColor2", c2);
    localStorage.setItem("gradColor3", c3);

    applyBackground("custom-gradient");
    saveUserPreferences();
  });
});

    



    // 드롭다운 토글 (기존과 동일)
    toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        optionsBox.classList.toggle("show");
    });

    // 배경 선택 (기존과 동일)
    optionsBox.addEventListener("click", (e) => {
        const bg = e.target.getAttribute("data-bg");
        if (bg) {
            applyBackground(bg);
            saveUserPreferences(); // ✅ 배경 변경 시 저장
        }
        optionsBox.classList.remove("show");
    });

    // 외부 클릭 시 드롭다운 닫기 (기존과 동일)
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".background-selector")) {
            optionsBox.classList.remove("show");
        }
    });

    // ✅ 이곳의 applyBackground("default")는 삭제합니다.
    // 초기 배경 설정은 auth.onAuthStateChanged에서 사용자의 로그인 상태에 따라 처리됩니다.
    // applyBackground("default"); // 이 줄은 이제 필요 없습니다.
});

async function saveUserPreferences() {
  const user = auth.currentUser;
  if (!user) {
    console.warn("로그인 안 됨, 저장 불가");
    return;
  }

  let background;
  const bgClass = [...document.body.classList].find(c => c.startsWith("bg-") || c === "dark-mode");

  if (!bgClass && document.body.style.background) {
    background = "custom-solid";
  } else if (bgClass === "dark-mode") {
    background = "dark";
  } else {
    background = bgClass ? bgClass.replace("bg-", "") : "default";
  }

  const customSolidColor = localStorage.getItem("customSolidColor") || null;
  const gradColor1 = localStorage.getItem("gradColor1") || null;
  const gradColor2 = localStorage.getItem("gradColor2") || null;
  const gradColor3 = localStorage.getItem("gradColor3") || null;

  const customTextColor = localStorage.getItem("customTextColor") || "#000000";
  const gradientTextColor = localStorage.getItem("gradientTextColor") || "#000000";

  // ✅ 누락된 버튼 배경색도 추가
  const customButtonBgColor = localStorage.getItem("customButtonBgColor") || "#007bff";
  const gradientButtonBgColor = localStorage.getItem("gradientButtonBgColor") || "#007bff";

  try {
    await db.collection("users").doc(user.uid).set({
      preferences: {
        background,
        languageMode: currentLang,
        typingMode: currentMode,
        newsSector: currentMode === "news" ? currentNewsSector || "all" : null,
        customSolidColor,
        gradColor1,
        gradColor2,
        gradColor3,
        customTextColor,
        gradientTextColor,
        customButtonBgColor,         // ✅ 추가됨
        gradientButtonBgColor        // ✅ 추가됨
      }
    }, { merge: true });

    // console.log("✅ 사용자 설정 저장 성공:", background);
  } catch (err) {
    console.error("❌ 사용자 설정 저장 실패:", err);
  }
}



document.getElementById("prev-sentence").addEventListener("click", goToPreviousSentence);
document.getElementById("skip-sentence").addEventListener("click", skipCurrentSentence);

function skipCurrentSentence() {
  getCurrentHistory().push(previousSentence);  // body가 아니라 전체 문장 저장
  pickAndRenderNewSentence();
}

function goToPreviousSentence() {
  const history = getCurrentHistory();
  if (history.length === 0) return;

  const lastSentence = history.pop();
  renderCurrentSentence(lastSentence);
  if (!isNewsMode) {
    renderSentenceThumbnail(lastSentence);
  }
}



document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === ",") {
    goToPreviousSentence();
    resetVirtualCursor();
  }
  if (e.ctrlKey && e.key === ".") {
    skipCurrentSentence();
    resetVirtualCursor();
  }
  if (e.key === "Tab") {
    e.preventDefault(); // 기본 포커스 이동 방지
    skipCurrentSentence();
    resetVirtualCursor();
  }
});

function getCurrentHistory() {
  if (currentMode === "news") return newsHistory;
  if (currentLang === "eng") return engHistory;
  return korHistory;
}


function loadKoreanModeData(mode) {
  currentMode = mode;
  korHistory = [];

  if (mode === "word") {
    // 기존 코드 그대로
    fetch("kor_words.json")
      .then(res => res.json())
      .then(data => {
        const randomSentences = [];
        for (let i = 0; i < 10; i++) {
          const randomWords = getRandomWords(data, 10);
          randomSentences.push(randomWords.join(" "));
        }
        sentences = randomSentences;
        pickAndRenderNewSentence();
        saveUserPreferences();
      });

  } else if (mode === "long") {
    fetch(korLongFile)
      .then(res => res.json())
      .then(data => {
        sentences = data;
        pickAndRenderNewSentence();
        saveUserPreferences();
      });

  } else {
    // short / kor
    fetch(korFile)
      .then(res => res.json())
      .then(data => {
        sentences = data;
        pickAndRenderNewSentence();
        saveUserPreferences();
      });
  }
}


function loadEnglishModeData(mode) {
  engHistory = []; // ✅ 히스토리 초기화
  if (mode === "word") {
    fetch("eng_words.json")
      .then(res => res.json())
      .then(data => {
        const randomSentences = [];
        for (let i = 0; i < 10; i++) {
          const randomWords = getRandomWords(data, 10);
          randomSentences.push(randomWords.join(" "));
        }
        sentences = randomSentences;
        pickAndRenderNewSentence();
      });
  } else if (mode === "short") {
    fetchSentences("eng");
  } else if (mode === "long") {
    fetch("eng_long.json")
      .then(res => res.json())
      .then(data => {
        sentences = data;
        pickAndRenderNewSentence();
      });
  }
}


tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const selectedTab = btn.dataset.tab;

    tabSections.forEach(section => {
      const isMatch = section.id === `${selectedTab}-tab`;
      section.classList.toggle("active", isMatch);
    });

    if (selectedTab === "typing") {
      document.getElementById("input").focus();
    }
  });
});

document.querySelectorAll(".custom-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".custom-tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".custom-tab-section").forEach((s) => s.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}-tab`).classList.add("active");
  });
});


// ✅ 초기 실행
const isDark = localStorage.getItem("darkMode") === "true";
if (isDark) document.body.classList.add("dark");

initializeFontSizeFromStorage();

// 초기 로딩 시 기본 모드로 실행
loadKoreanModeData(currentMode);