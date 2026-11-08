import type { Metadata } from "next";
import { ShowcaseDetail } from "@/components/showcase/showcase-detail";

export const metadata: Metadata = {
  title: "아카이브 | Type News",
};

export default async function ShowcaseItemPage({ params }: PageProps<"/showcase/[itemId]">) {
  const { itemId } = await params;
  return <ShowcaseDetail itemId={itemId} />;
}
