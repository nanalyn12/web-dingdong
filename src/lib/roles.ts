// 콘텐츠 편집 권한 판정. 클라이언트(버튼을 보일지)와 서버(요청을 받아줄지)가
// 반드시 같은 규칙을 써야 하므로 한 곳에 둔다. 화면과 서버가 각자 조건을 적으면
// 한쪽만 고쳐졌을 때 "버튼은 보이는데 저장이 안 되는" 상태가 된다.
//
// 화면 노출은 편의일 뿐 보안 경계가 아니다 — 실제 차단은 서버가 한다.

const EDITOR_ROLES = ["admin", "teacher"] as const;

/** 강의·드라마·학습송 같은 공용 콘텐츠를 고칠 수 있는 역할인가. */
export function isEditorRole(role: string | null | undefined): boolean {
  return EDITOR_ROLES.includes(role as (typeof EDITOR_ROLES)[number]);
}
