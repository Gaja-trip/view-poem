import type { Metadata } from "next";
import PoemStudio from "../PoemStudio";

export const metadata: Metadata = {
  title: "ChatGPT 이미지 보관하기 | 풍경시",
  description: "ChatGPT에서 내려받은 이미지를 지정한 Google Drive 폴더에 보관합니다.",
  alternates: { canonical: "/archive" },
};

export default function ArchiveImagePage() {
  return <PoemStudio mode="import" />;
}
