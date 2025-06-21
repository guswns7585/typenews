let sentences = [];
let newsList = [];
let currentSentence = "";
let previousSentence = "";
let count = 0;
let currentLang = "kor";
let startTime = null;
let currentAccuracy = 0;

const sentenceEl = document.getElementById("sentence");
const inputEl = document.getElementById("input");
const speedEl = document.getElementById("speed");
const accuracyEl = document.getElementById("accuracy");
const countEl = document.getElementById("count");
const langKorBtn = document.getElementById("langKor");
const langEngBtn = document.getElementById("langEng");
const langNewsBtn = document.getElementById("langNews");
const langNewsKorBtn = document.getElementById("langNewsKor");
const newsLinkEl = document.getElementById("news-link");

// ✅ 자동 높이 조절 함수
function autoResizeInput() {
  inputEl.style.height = "auto";
  inputEl.style.height = inputEl.scrollHeight + "px";
}
function decodeHTMLEntities(text) {
  const txt = document.createElement("textarea");
  txt.innerHTML = text;
  return txt.value;
}

// ✅ 텍스트 정제 함수
function cleanText(text) {
  const decoded = decodeHTMLEntities(text); // 숫자형 엔티티 디코딩

  return decoded
    .replace(/<[^>]*>/g, " ")              // HTML 태그 제거
    .replace(/&[a-z]+;/gi, " ")            // 일반 엔티티 제거
    .replace(/https?:\/\/\S+/g, " ")       // 링크 제거
    .replace(/[\r\n]/g, " ")               // 줄바꿈 제거
    .replace(/[^\p{L}\p{N} .,!?]/gu, "")   // 문자/숫자/공백/기본 문장부호만 허용
    .replace(/\s+/g, " ")                  // 다중 공백 제거
    .trim();
}

function fetchSentences(lang) {
  fetch(`${lang}.json`)
    .then(res => res.json())
    .then(data => {
      sentences = data;
      newsList = [];
      pickAndRenderNewSentence();
    })
    .catch(err => {
      console.error("문장 로딩 실패:", err);
    });
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
      const items = [...doc.querySelectorAll("item")].slice(0, 10);

      newsList = items.map(item => {
        const title = cleanText(item.querySelector("title")?.textContent || "");
        const rawDesc = item.querySelector("description")?.textContent || "";
        const desc = cleanText(rawDesc);

        // ✅ 한국어 문장 경계 기준으로 자르기
        const sentenceArray = desc.split(/(?<=[.?!])\s+/); // 마침표/물음표/느낌표 뒤 공백 기준

        // ✅ 100자 이하 문장 찾기
        let summary = sentenceArray.find(s => s.length <= 100)?.trim() || "";
        if (!summary && sentenceArray.length > 0) {
          summary = sentenceArray[0].slice(0, 100).trim();
        }

        return {
          sentence: `${title}\n\n${summary}`,
          link: item.querySelector("link")?.textContent || ""
        };
      });

      sentences = newsList.map(n => n.sentence);
      pickAndRenderNewSentence();
    })
    .catch(err => {
      console.error("RSS 불러오기 실패:", err);
      alert("뉴스 로딩 중 오류 발생");
    });
}

function pickAndRenderNewSentence() {
  previousSentence = currentSentence;
  const index = Math.floor(Math.random() * sentences.length);
  const sentenceData = sentences[index];

  if (sentenceData.includes("\n\n")) {
    const [title, body] = sentenceData.split("\n\n");

    currentSentence = body;  // ✅ 타이핑 대상은 본문만
    const bodySpans = [...body].map(ch => `<span>${ch}</span>`).join('');
    sentenceEl.innerHTML = `
      <div class="news-title">${title}</div>
      <div class="news-body">${bodySpans}</div>
    `;
  } else {
    currentSentence = sentenceData;
    const textForHighlight = currentSentence.replace(/\n\n/, " ");
    sentenceEl.innerHTML = [...textForHighlight]
      .map(ch => `<span>${ch}</span>`)
      .join('');
  }

  if (newsList.length > 0 && newsList[index]?.link) {
    newsLinkEl.innerHTML = `<a href="${newsList[index].link}" target="_blank" style="color:#4a90e2; font-size:18px;">👉 기사 원문 보기</a>`;
  } else {
    newsLinkEl.innerHTML = "";
  }

  inputEl.value = "";
  startTime = null;
  currentAccuracy = 0;
  speedEl.textContent = currentLang === "kor" ? "0 CPM" : "0 WPM";
  accuracyEl.textContent = "0";
  autoResizeInput(); // ✅ 입력창 높이 초기화
}

function updateHighlight() {
  const input = inputEl.value;
  const target = currentSentence;
  const spans = sentenceEl.querySelectorAll(".news-body span, #sentence span");

  let correct = 0;

  for (let i = 0; i < spans.length; i++) {
    const typedChar = input[i];
    const actualChar = target[i];

    if (typedChar == null) {
      spans[i].className = "";
    } else if (i === input.length - 1 && typedChar !== actualChar) {
      spans[i].className = "";
    } else if (typedChar === actualChar) {
      spans[i].className = "correct";
      correct++;
    } else {
      spans[i].className = "incorrect";
    }
  }

  const totalTyped = input.length;
  const minutes = (Date.now() - startTime) / 1000 / 60;
  const accuracy = totalTyped > 0 ? Math.round((correct / totalTyped) * 100) : 0;
  currentAccuracy = accuracy;
  accuracyEl.textContent = accuracy;

  if (minutes > 0) {
    if (currentLang === "kor") {
      const cpm = Math.round(totalTyped / minutes);
      speedEl.textContent = `${cpm} CPM`;
    } else {
      const wpm = Math.round((totalTyped / 5) / minutes);
      speedEl.textContent = `${wpm} WPM`;
    }
  } else {
    speedEl.textContent = currentLang === "kor" ? "0 CPM" : "0 WPM";
  }
}

inputEl.addEventListener("input", () => {
  if (!startTime) startTime = Date.now();
  updateHighlight();
  autoResizeInput();
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (currentAccuracy >= 80) {
      count++;
      countEl.textContent = count;
      pickAndRenderNewSentence();
    } else {
      alert("정확도 80% 이상일 때만 다음 문장으로 넘어갈 수 있습니다.");
    }
  }

  if (e.key === "Escape") {
    inputEl.value = "";
    updateHighlight();
    autoResizeInput();
  }
});

langKorBtn.addEventListener("click", () => {
  currentLang = "kor";
  count = 0;
  countEl.textContent = "0";
  fetchSentences("kor");
});

langEngBtn.addEventListener("click", () => {
  currentLang = "eng";
  count = 0;
  countEl.textContent = "0";
  fetchSentences("eng");
});

langNewsBtn.addEventListener("click", () => {
  currentLang = "eng";
  count = 0;
  countEl.textContent = "0";
  fetchRSSNews("http://feeds.bbci.co.uk/news/world/rss.xml");
});

langNewsKorBtn.addEventListener("click", () => {
  currentLang = "kor";
  count = 0;
  countEl.textContent = "0";
  fetchRSSNews("https://news.sbs.co.kr/news/headlineRssFeed.do");
});

document.addEventListener("click", () => {
  inputEl.focus();
});

fetchSentences(currentLang);