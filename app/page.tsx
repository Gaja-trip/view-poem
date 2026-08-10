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
      <div className="landing-shade" aria-hidden="true" />

      <header className="site-header landing-header">
        <Link className="brand" href="/" aria-label="풍경시 홈">
          <span className="brand-mark" aria-hidden="true">風</span>
          <span>
            <strong>풍경시</strong>
            <small>VIEW · FEEL · VERSE</small>
          </span>
        </Link>

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
            aria-label="ChatGPT 이미지 보관하기"
          >
            <span className="menu-label-full">ChatGPT 이미지 보관하기</span>
            <span className="menu-label-short" aria-hidden="true">이미지 보관</span>
            <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>

      <main className="landing-main">
        <div className="landing-content">
          <p className="landing-kicker">VIEW · FEEL · VERSE</p>
          <h1>산책자의 작은 시집</h1>
          <p className="landing-intro">
            오늘 만난 장면을 한 편의 시로 만들고,
            <br />
            오래 간직하고 싶은 이미지는 차곡차곡 모아보세요.
          </p>

          <section className="recording-section" aria-labelledby="recording-title">
            <h2 id="recording-title">두 개의 기록 방식</h2>
            <ol className="recording-methods">
              <li>
                <span>01</span>
                <div>
                  <h3>풍경을 시로</h3>
                  <p>사진과 그 순간의 마음을 시와 스케치로 남겨요.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>이미지를 보관함에</h3>
                  <p>ChatGPT 이미지를 Google Drive에 오래 간직해요.</p>
                </div>
              </li>
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}
