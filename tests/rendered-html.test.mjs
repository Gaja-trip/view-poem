import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function renderHomePage() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Korean landscape poem studio", async () => {
  const response = await renderHomePage();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*\blang=["']ko["'][^>]*>/i);
  assert.match(
    html,
    /<title>풍경시(?:<!-- -->)? — 오늘 본 풍경을,(?:<!-- -->)? 한 편의 시로<\/title>/i,
  );
  assert.match(html, /오늘 본 풍경을,/);
  assert.match(html, /한 편의 시로\./);
  assert.match(html, /사진과 그 순간의 마음을 남기면 풍경을 스케치하고,/);

  assert.match(html, /사진 찍기 또는 선택하기/);
  assert.match(html, /한 단어의 감정도 충분해요/);
  assert.match(html, /ChatGPT 이미지 보관하기/);
  assert.match(html, /Google Drive 보관/);
  assert.match(
    html,
    /https:\/\/drive\.google\.com\/drive\/folders\/1THA5WVItE6BFJKsOX3It7dHZQErrqc8s/,
  );

  assert.doesNotMatch(html, /codex-preview/i);
  assert.doesNotMatch(
    html,
    /Building your site|Your site is taking shape|sites-skeleton|SkeletonPreview/i,
  );
  assert.doesNotMatch(html, /react-loading-skeleton/i);
});

test("keeps starter preview code out and includes the product integration files", async () => {
  const [pageSource, layoutSource, packageSource] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("package.json", projectRoot), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.doesNotMatch(pageSource, /_sites-preview|codex-preview|SkeletonPreview/);
  assert.doesNotMatch(layoutSource, /_sites-preview|codex-preview|SkeletonPreview/);
  assert.equal(packageJson.dependencies?.["react-loading-skeleton"], undefined);
  assert.equal(packageJson.devDependencies?.["react-loading-skeleton"], undefined);

  await Promise.all([
    assert.rejects(access(new URL("app/_sites-preview", projectRoot))),
    assert.rejects(access(new URL("public/_sites-preview", projectRoot))),
    access(new URL("app/api/config/route.ts", projectRoot)),
    access(new URL("app/api/poem/route.ts", projectRoot)),
    access(new URL("app/api/sketch/route.ts", projectRoot)),
    access(new URL(".env.example", projectRoot)),
  ]);
});
