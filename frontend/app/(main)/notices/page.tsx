import type { Metadata } from "next";
import { NoticesBoard } from "@/components/notices/notices-board";

export const metadata: Metadata = {
  title: "새소식 | Type News",
  description: "타입뉴스의 업데이트, 이벤트와 점검 소식입니다.",
};

export default function NoticesPage() {
  return <NoticesBoard />;
}
