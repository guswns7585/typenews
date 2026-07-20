import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Type News",
  description: "매일 새로운 뉴스로 타이핑을 즐겨보세요.",
  icons: { icon: "none" },
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
      <body>{children}</body>
    </html>
  );
}
