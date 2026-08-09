import type { Metadata } from "next";
import PoemStudio from "../PoemStudio";

export const metadata: Metadata = {
  title: "새 풍경시 만들기 | 풍경시",
  description: "풍경 사진과 그 순간의 마음을 시와 스케치로 만듭니다.",
  alternates: { canonical: "/create" },
};

export default function CreatePoemPage() {
  return <PoemStudio mode="create" />;
}
