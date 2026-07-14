import * as functions from "firebase-functions";
import express from "express";
import fetch from "node-fetch";

const app = express();

// 섹터별 캐시
const rssCache = {}; // <- 여기서 타입 제거
const CACHE_DURATION = 5 * 60 * 1000; // 5분

app.get("/rss", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/xml; charset=UTF-8");

  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "url 쿼리 필요" });

    const now = Date.now();

    // 캐시 확인
    if (rssCache[url] && now - rssCache[url].timestamp < CACHE_DURATION) {
      return res.send(rssCache[url].data);
    }

    let text = "";

    try {
      const response = await fetch(url, { timeout: 5000 });
      if (response.ok) {
        text = await response.text();
      } else {
        console.warn(`RSS 요청 실패 (${url}): ${response.status}`);
        if (rssCache[url]) text = rssCache[url].data;
      }
    } catch (err) {
      console.warn(`RSS fetch 예외 (${url}):`, err);
      if (rssCache[url]) text = rssCache[url].data;
    }

    if (!text) {
      text = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>RSS 로드 실패</title></channel></rss>`;
    }

    rssCache[url] = { data: text, timestamp: now };
    res.send(text);

  } catch (err) {
    console.error("RSS 처리 예외:", err);
    res.send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>RSS 처리 실패</title></channel></rss>`);
  }
});

export const api = functions.https.onRequest(app);
