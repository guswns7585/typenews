const sbsSections = new Set(["01", "02", "03", "07", "08", "09", "14"]);

export function approvedNewsFeed(source: string) {
  let target: URL;
  try {
    target = new URL(source);
  } catch {
    return null;
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") return null;
  target.protocol = "https:";
  target.hash = "";

  if (target.hostname === "news.sbs.co.kr") {
    if (target.pathname === "/news/headlineRssFeed.do" && !target.search) return target;
    if (target.pathname !== "/news/SectionRssFeed.do") return null;
    const sectionId = target.searchParams.get("sectionId");
    if (!sectionId || !sbsSections.has(sectionId) || [...target.searchParams.keys()].some((key) => key !== "sectionId")) {
      return null;
    }
    target.search = `?sectionId=${sectionId}`;
    return target;
  }

  if (target.hostname === "feeds.bbci.co.uk") {
    if (!/^\/news\/[\w/-]*rss\.xml$/.test(target.pathname) || target.search) return null;
    return target;
  }

  return null;
}
