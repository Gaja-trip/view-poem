import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "풍경시 — 산책자의 작은 시집",
  description:
    "산책에서 만난 풍경을 시로 만들고, 오래 간직하고 싶은 이미지를 보관하는 두 가지 기록 방식.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div className="landing-page">
      <Image
        className="landing-background"
        src="/og.png"
        alt="산과 들길이 연필과 수채로 그려진 풍경시 표지"
        fill
        priority
        sizes="100vw"
      />

      <header className="site-header landing-header">
        <nav className="landing-menu" aria-label="주요 메뉴">
          <Link
            className="landing-menu-link"
            href="/create"
            aria-label="새 풍경시 만들기"
          >
            <span className="menu-label-full">새 풍경시 만들기</span>
            <span className="menu-label-short" aria-hidden="true">새 풍경시</span>
            <span aria-hidden="true">↗</span>
          </Link>
          <Link
            className="landing-menu-link"
            href="/archive"
            aria-label="이미지 보관하기"
          >
            <span className="menu-label-full">이미지 보관하기</span>
            <span className="menu-label-short" aria-hidden="true">이미지 보관</span>
            <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>
    </div>
  );
}
