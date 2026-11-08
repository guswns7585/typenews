import type { Metadata } from "next";
import { TypingWorkshop } from "@/components/game/typing-workshop";

export const metadata: Metadata = {
  title: "활자 공방 | Type News",
  description: "타이핑으로 잉크를 모으고 공방의 수집품을 늘려 보세요.",
};

export default function WorkshopPage() {
  return <TypingWorkshop />;
}
