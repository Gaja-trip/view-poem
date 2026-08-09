import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/1THA5WVItE6BFJKsOX3It7dHZQErrqc8s";

export const metadata: Metadata = {
  title: "풍경시 — 오늘 본 풍경을, 나만의 방식으로",
  description:
    "풍경 사진과 마음으로 시를 만들거나 ChatGPT 이미지를 Google Drive에 보관하세요.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="풍경시 홈">
          <span className="brand-mark" aria-hidden="true">風</span>
          <span>
            <strong>풍경시</strong>
            <small>VIEW · FEEL · VERSE</small>
          </span>
        </Link>
        <Link className="header-action" href="/create">
          작품 만들기 <span aria-hidden="true">↘</span>
        </Link>
      </header>

      <main id="top">
        <section className="hero landing-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span aria-hidden="true">✦</span> 산책자의 작은 시집</p>
            <h1 id="hero-title">
              오늘 본 풍경을,
              <br />
              <em>나만의 방식으로.</em>
            </h1>
            <p className="hero-description">
              사진과 마음으로 새로운 풍경시를 만들거나, 이미 만든 ChatGPT 이미지를
              Google Drive에 보관하세요. 두 작업은 각각 독립된 페이지에서 열립니다.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary button-large" href="/create">
                새 풍경시 만들기 <span aria-hidden="true">↘</span>
              </Link>
              <Link className="button button-quiet button-large" href="/archive">
                ChatGPT 이미지 보관하기
              </Link>
            </div>
            <ul className="hero-notes" aria-label="주요 기능">
              <li>서로 다른 전용 페이지</li>
              <li>JPG · PNG · WEBP</li>
              <li>Google Drive 보관</li>
            </ul>
          </div>

          <div className="hero-visual" aria-label="풍경시 스케치북 표지 예시">
            <div className="hero-image-wrap">
              <Image
                src="/og.png"
                alt="산길과 억새가 연필과 수채로 그려진 풍경시 스케치북"
                fill
                priority
                sizes="(max-width: 900px) 92vw, 48vw"
              />
            </div>
            <p className="cover-caption"><span>01</span> 원하는 작업을 고르면<br />전용 페이지가 새로 열립니다.</p>
          </div>
        </section>

        <section className="route-choice-section" aria-labelledby="route-choice-title">
          <div className="section-intro">
            <p className="eyebrow"><span aria-hidden="true">✦</span> 무엇을 남겨볼까요?</p>
            <h2 id="route-choice-title">오늘의 작업을 골라주세요.</h2>
            <p>언제든 풍경시 홈으로 돌아와 다른 작업을 선택할 수 있어요.</p>
          </div>
          <div className="route-choice-grid">
            <Link className="route-choice-card" href="/create">
              <span className="route-choice-number">01</span>
              <div>
                <p>VIEW · FEEL · VERSE</p>
                <h2>새 풍경시 만들기</h2>
                <span>풍경 사진과 느낌으로 시와 스케치를 만들어요.</span>
              </div>
              <strong>만들기 페이지 열기 <span aria-hidden="true">→</span></strong>
            </Link>
            <Link className="route-choice-card archive" href="/archive">
              <span className="route-choice-number">02</span>
              <div>
                <p>KEEP AN IMAGE</p>
                <h2>ChatGPT 이미지 보관하기</h2>
                <span>내려받은 이미지를 지정한 Google Drive 폴더에 보관해요.</span>
              </div>
              <strong>보관 페이지 열기 <span aria-hidden="true">→</span></strong>
            </Link>
          </div>
        </section>

        <section className="process-section" aria-labelledby="process-title">
          <div className="process-heading">
            <p className="eyebrow"><span aria-hidden="true">✦</span> 두 개의 기록 방식</p>
            <h2 id="process-title">만들 때도,<br />간직할 때도.</h2>
          </div>
          <ol className="process-list">
            <li><span>01</span><strong>풍경을 담고</strong><p>새 풍경시 페이지에서 사진과 그 순간의 느낌을 기록해요.</p></li>
            <li><span>02</span><strong>시와 그림으로</strong><p>풍경은 스케치가 되고 마음은 한 편의 시가 됩니다.</p></li>
            <li><span>03</span><strong>이미지를 보관해요</strong><p>완성 작품이나 ChatGPT 이미지를 Google Drive에 간직하세요.</p></li>
          </ol>
        </section>
      </main>

      <footer>
        <Link className="brand footer-brand" href="/"><span className="brand-mark" aria-hidden="true">風</span><span><strong>풍경시</strong><small>VIEW · FEEL · VERSE</small></span></Link>
        <p>오늘 만난 장면을 내일의 문장으로.</p>
        <a href={DRIVE_FOLDER_URL} target="_blank" rel="noreferrer">Google Drive 폴더 ↗</a>
      </footer>
    </>
  );
}
