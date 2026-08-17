// 볼륨에 남은 고아 미디어 파일을 가려내는 규칙. 순수 모듈 — 파일시스템·DB에
// 손대지 않으므로 그대로 테스트할 수 있다. 실제 삭제는 media-cleanup.server.ts.
//
// 이 판정은 **파일을 지우는 결정**이라 틀리면 사용자 콘텐츠가 사라진다.
// 그래서 규칙을 좁게 잡는다: 우리가 그 형식으로 직접 만든 파일
// (`<uuid>.mp4`, `<uuid>-thumb.jpg`)만 후보이고, 이름이 조금이라도 다르면
// 무조건 남긴다. 모르는 파일을 지우느니 쌓이게 두는 편이 낫다.

/** 파이프라인이 만드는 파일 이름 형식. 그 외에는 관리 대상이 아니다. */
const MANAGED_FILE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(-thumb\.jpg|\.mp4)$/i;

/** 파일 이름에서 소유 행의 id를 뽑는다. 관리 대상이 아니면 null. */
export function parseManagedMediaId(filename: string): string | null {
  const match = MANAGED_FILE.exec(filename);
  return match ? match[1].toLowerCase() : null;
}

/**
 * 이 파일을 지워도 되는가. 관리 대상 형식이면서 그 id의 DB 행이 사라졌을 때만 true.
 *
 * `liveIds`의 대소문자는 신경 쓰지 않아도 된다 — 여기서 맞춰 본다.
 */
export function isOrphanMediaFile(filename: string, liveIds: Iterable<string>): boolean {
  const id = parseManagedMediaId(filename);
  if (!id) return false; // 모르는 파일은 건드리지 않는다
  for (const live of liveIds) {
    if (live.toLowerCase() === id) return false;
  }
  return true;
}

/** 디렉터리 목록에서 지워도 되는 파일만 골라낸다. */
export function orphanFilesIn(filenames: string[], liveIds: Iterable<string>): string[] {
  const live = new Set<string>();
  for (const id of liveIds) live.add(id.toLowerCase());
  return filenames.filter((name) => isOrphanMediaFile(name, live));
}
