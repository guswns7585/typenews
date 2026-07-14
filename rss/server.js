import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;

// 로컬용 RSS 프록시
app.get("/rss", async (req, res) => {
  const rssUrl = "https://news.sbs.co.kr/news/headlineRssFeed.do";

  try {
    const response = await fetch(rssUrl);
    if (!response.ok) throw new Error(`RSS 요청 실패: ${response.status}`);

    const text = await response.text();
    res.set("Content-Type", "application/xml");
    res.send(text);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`로컬 RSS 서버 실행 중 → http://localhost:${PORT}/rss`));

