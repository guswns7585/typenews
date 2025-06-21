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
const newsLinkEl = document.getElementById("news-link");

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
  const decoded = decodeHTMLEntities(text);
  return decoded
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\r\n]/g, " ")
    .replace(/[^\p{L}\p{N} .,!?]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ✅ 문장 또는 뉴스 불러오기
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
      const items = [...doc.querySelectorAll("item")].slice(0, 10);

      newsList = items.map(item => {
        const title = cleanText(item.querySelector("title")?.textContent || "");
        const descRaw = item.querySelector("description")?.textContent || "";
        const desc = cleanText(descRaw);
        const sentenceArray = desc.split(/(?<=[.?!])\s+/);
        let summary = sentenceArray.find(s => s.length <= 100) || sentenceArray[0].slice(0, 100);

        return {
          sentence: `${title}\n\n${summary}`,
          link: item.querySelector("link")?.textContent || ""
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
  previousSentence = currentSentence;
  const index = Math.floor(Math.random() * sentences.length);
  const sentenceData = sentences[index];

  if (sentenceData.includes("\n\n")) {
    const [title, body] = sentenceData.split("\n\n");
    currentSentence = body;
    const bodySpans = [...body].map(ch => `<span>${ch}</span>`).join('');
    sentenceEl.innerHTML = `<div class="news-title">${title}</div><div class="news-body">${bodySpans}</div>`;
  } else {
    currentSentence = sentenceData;
    sentenceEl.innerHTML = [...currentSentence].map(ch => `<span>${ch}</span>`).join('');
  }

  newsLinkEl.innerHTML = newsList[index]?.link
    ? `<a href="${newsList[index].link}" target="_blank">👉 기사 원문 보기</a>`
    : "";

  inputEl.value = "";
  startTime = null;
  currentAccuracy = 0;
  speedEl.textContent = currentLang === "kor" ? "0 CPM" : "0 WPM";
  accuracyEl.textContent = "0";
  autoResizeInput();
}

// ✅ 입력 감지
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
  const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
  currentAccuracy = acc;
  accuracyEl.textContent = acc;

  if (minutes > 0) {
    const speed = currentLang === "kor"
      ? `${Math.round(total / minutes)} CPM`
      : `${Math.round((total / 5) / minutes)} WPM`;
    speedEl.textContent = speed;
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
      alert("정확도 80% 이상일 때만 다음 문장으로 넘어갑니다.");
    }
  }
  if (e.key === "Escape") {
    inputEl.value = "";
    updateHighlight();
    autoResizeInput();
  }
});

// ✅ 기본 모드 버튼
document.getElementById("langKor").addEventListener("click", () => {
  currentLang = "kor";
  count = 0;
  countEl.textContent = "0";
  fetchSentences("kor");
});
document.getElementById("langEng").addEventListener("click", () => {
  currentLang = "eng";
  count = 0;
  countEl.textContent = "0";
  fetchSentences("eng");
});



// ✅ 섹터별 버튼 처리
const sectorMap = {
  "politics": "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01",
  "economy": "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07",
  "society": "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03",
  "culture": "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14",
  "sports": "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08"
};



// ✅ 다크모드
const toggleBtn = document.getElementById("toggle-theme");
const isDark = localStorage.getItem("darkMode") === "true";
if (isDark) document.body.classList.add("dark");

toggleBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("darkMode", document.body.classList.contains("dark"));
  toggleBtn.textContent = document.body.classList.contains("dark")
    ? "☀️ 라이트모드 전환"
    : "🌙 다크모드 전환";
});

document.addEventListener("click", () => {
  inputEl.focus();
});
document.querySelectorAll(".dropdown-content div").forEach(item => {
  item.addEventListener("click", () => {
    const sector = item.getAttribute("data-sector");
    currentLang = "kor";
    count = 0;
    countEl.textContent = "0";

    if (sector === "all") {
      fetchRSSNews("https://news.sbs.co.kr/news/headlineRssFeed.do");
    } else {
      const sectorMap = {
        politics: "01",
        economy: "07",
        society: "03",
        culture: "14",
        sports: "08"
      };
      const url = `https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=${sectorMap[sector]}`;
      fetchRSSNews(url);
    }
  });
});
document.getElementById("langKor").addEventListener("click", () => {
  currentLang = "kor";
  count = 0;
  countEl.textContent = "0";
  fetchSentences("kor");
});

document.getElementById("langEng").addEventListener("click", () => {
  currentLang = "eng";
  count = 0;
  countEl.textContent = "0";
  fetchSentences("eng");
});

document.getElementById("langNews").addEventListener("click", () => {
  currentLang = "eng";
  count = 0;
  countEl.textContent = "0";
  fetchRSSNews("http://feeds.bbci.co.uk/news/world/rss.xml");
});
const dropdownBtn = document.getElementById("newsDropdownBtn");
const dropdown = dropdownBtn.closest(".dropdown");

dropdownBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdown.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (!dropdown.contains(e.target)) {
    dropdown.classList.remove("open");
  }
});

fetchSentences(currentLang);
