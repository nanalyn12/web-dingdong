import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/*
 * 학습송 상세는 직접 들어갈 때마다 하이드레이션이 깨졌다(React #418). 로더가
 * ensureQueryData로 **서버의** 쿼리 캐시를 채워 서버는 본문을 그렸지만, 쿼리
 * 캐시는 브라우저로 넘어가지 않아(router.tsx에 SSR 쿼리 연결이 없다) 브라우저의
 * 첫 렌더는 `if (!song) return null`이었다. 로더의 반환값은 넘어오므로, 그것을
 * initialData로 주면 양쪽이 같은 데이터로 첫 렌더를 한다.
 *
 * 한국어 앱의 문서 언어가 "en"으로 선언돼 있었다.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("a route that primes the query cache on the server hydrates with the same data", () => {
  // F-1
  it("every route loader that fills the query cache seeds its useQuery from the loader", () => {
    const primed = readdirSync(join(SRC, "routes"))
      .filter((n) => n.endsWith(".tsx"))
      .filter((n) => /ensureQueryData\(/.test(read(join("routes", n))));
    expect(primed.length).toBeGreaterThan(0);
    const unseeded = primed.filter((n) => {
      const src = read(join("routes", n));
      return !/Route\.useLoaderData\(\)/.test(src) || !/initialData\s*:/.test(src);
    });
    expect(unseeded).toEqual([]);
  });

  // F-2
  it("the song page's song query starts from the loader's song", () => {
    const src = read("routes/_app.songs.$id.tsx");
    const start = src.indexOf('queryKey: ["song", id]');
    expect(start).toBeGreaterThanOrEqual(0);
    const call = src.slice(src.lastIndexOf("useQuery({", start), src.indexOf("});", start));
    expect(call).toMatch(/initialData\s*:/);
  });
});

describe("documents declare the language they are written in", () => {
  // LANG-1
  it("the app document is Korean", () => {
    const src = read("routes/__root.tsx");
    expect(src).toMatch(/<html lang="ko"/);
    expect(src).not.toMatch(/lang="en"/);
  });

  // LANG-2
  it("the printable curriculum sheet is Korean", () => {
    expect(read("components/curriculum-pdf-button.tsx")).toMatch(
      /`<!doctype html><html lang="ko">/,
    );
  });
});
