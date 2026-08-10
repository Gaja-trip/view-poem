import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "풍경시 — 산책자의 작은 시집";
const description =
  "산책에서 만난 풍경을 시로 만들고, 오래 간직하고 싶은 이미지를 보관하는 두 가지 기록 방식.";

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestedHost = forwardedHost || headerStore.get("host") || "localhost";
  const host = /^(?:localhost|127\.0\.0\.1|\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(
    requestedHost,
  )
    ? requestedHost
    : "localhost";
  const forwardedProtocol = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "http" || host.startsWith("localhost") ? "http" : "https";
  let origin = "http://localhost";
  try {
    origin = new URL(`${protocol}://${host}`).origin;
  } catch {
    // Keep a safe local metadata origin when an intermediary sends a malformed host.
  }
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title,
    description,
    applicationName: "풍경시",
    keywords: ["풍경", "시", "스케치", "사진", "산책 기록"],
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: "풍경시",
      title,
      description,
      images: [
        {
          url: socialImage,
          width: 1731,
          height: 909,
          alt: "연필과 수채로 그린 산길 위 풍경시 스케치북",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
    icons: {
      icon: "/og.png",
      apple: "/og.png",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2eee3",
  colorScheme: "light",
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
