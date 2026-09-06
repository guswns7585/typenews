import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "pretendard-jp/dist/web/variable/pretendardvariable-jp-dynamic-subset.css";
import "@fontsource/gowun-batang/400.css";
import "@fontsource/gowun-batang/700.css";
import "@fontsource-variable/noto-sans-kr/wght.css";
import "@fontsource-variable/noto-serif-kr/wght.css";
import "@fontsource/nanum-gothic/400.css";
import "@fontsource/nanum-gothic/700.css";
import "@fontsource/nanum-myeongjo/400.css";
import "@fontsource/nanum-myeongjo/700.css";
import "./globals.css";
import "./agent-themes.css";

export const metadata: Metadata = {
  /* OG 이미지의 상대 경로를 절대 URL로 만들 기준. 없으면 Next가 개발에서는
     localhost:3000, 배포에서는 Vercel이 준 도메인을 쓴다. 그대로 두면 카카오톡·
     트위터에 typenews.kr 링크를 붙였을 때 이미지 주소만 vercel.app으로 나간다.
     openGraph.url을 이미 typenews.kr로 박아두었으므로 기준도 같은 곳으로 맞춘다. */
  metadataBase: new URL("https://typenews.kr"),
  title: "Type News",
  description: "매일 새로운 뉴스로 타이핑을 즐겨보세요.",
  /* ⚠️ icons를 여기서 정하지 않는다. 예전에 `icons: { icon: "none" }`이 들어 있었는데,
     이건 아이콘을 끄는 뜻이 아니라 **`/none`을 아이콘 주소로 쓰라는 뜻**이다.
     브라우저가 /none을 받아오지 못하면 /favicon.ico로 되돌아가고, 거기에는
     create-next-app이 넣어둔 Vercel 기본 아이콘이 남아 있어서 그게 떴다.
     지금은 app/icon.png · app/apple-icon.png 파일 규약을 쓴다. Next가 크기와
     타입을 읽어 link 태그를 알아서 만들어 준다. */
  openGraph: {
    title: "Typenews – 뉴스 타자 연습",
    description: "매일 새로운 뉴스로 타이핑을 즐겨보세요.",
    url: "https://typenews.kr/",
    type: "website",
    images: [{ url: "/typenewslogo/typenews-01.png", width: 1200, height: 630 }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
