import type { Metadata } from "next";
import { ShowcaseGallery } from "@/components/showcase/showcase-gallery";

export const metadata: Metadata = {
  title: "아카이브 | Type News",
  description: "타입뉴스 사용자들의 키보드, 빌드 정보와 타건음을 모은 아카이브입니다.",
};

export default async function ShowcasePage({ searchParams }: { searchParams: Promise<{ profile?: string | string[] }> }) {
  const params = await searchParams;
  const profile = typeof params.profile === "string" && /^[0-9a-f-]{36}$/i.test(params.profile) ? params.profile : null;
  return <ShowcaseGallery profileId={profile} />;
}
