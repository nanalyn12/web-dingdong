import { describe, expect, it } from "vitest";

import { isEditorRole } from "./roles";

describe("isEditorRole", () => {
  it("관리자와 교사는 콘텐츠를 고칠 수 있다", () => {
    expect(isEditorRole("admin")).toBe(true);
    expect(isEditorRole("teacher")).toBe(true);
  });

  it("학생은 고칠 수 없다", () => {
    expect(isEditorRole("student")).toBe(false);
  });

  it("역할이 없으면 고칠 수 없다", () => {
    expect(isEditorRole(null)).toBe(false);
    expect(isEditorRole(undefined)).toBe(false);
    expect(isEditorRole("")).toBe(false);
  });

  it("모르는 역할은 거부한다 — 기본값은 허용이 아니라 거부다", () => {
    // 나중에 역할이 하나 늘었을 때 조용히 편집 권한이 새는 일이 없어야 한다.
    expect(isEditorRole("moderator")).toBe(false);
    expect(isEditorRole("Admin")).toBe(false); // 대소문자가 다르면 다른 값이다
    expect(isEditorRole(" admin")).toBe(false);
  });
});
