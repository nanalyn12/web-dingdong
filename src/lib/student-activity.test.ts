import { describe, it, expect } from "vitest";

import { idleLabel, idleTone, STALE_AFTER_DAYS } from "./student-activity";

describe("how long since a student showed up", () => {
  it("words the recent cases the way a teacher would say them", () => {
    expect(idleLabel(0)).toBe("오늘");
    expect(idleLabel(1)).toBe("어제");
    expect(idleLabel(2)).toBe("2일 전");
    expect(idleLabel(30)).toBe("30일 전");
  });

  it("says nothing rather than zero when there is no activity on record", () => {
    expect(idleLabel(null)).toBe("—");
    expect(idleLabel(undefined)).toBe("—");
  });

  it("flags a student the day the threshold is reached, not after", () => {
    expect(idleTone(STALE_AFTER_DAYS - 1)).toBe("normal");
    expect(idleTone(STALE_AFTER_DAYS)).toBe("stale");
    expect(idleTone(STALE_AFTER_DAYS + 1)).toBe("stale");
  });

  it("separates today from merely recent", () => {
    expect(idleTone(0)).toBe("today");
    expect(idleTone(1)).toBe("normal");
  });

  it("does not flag a student it has no data for", () => {
    expect(idleTone(null)).toBe("unknown");
    expect(idleTone(Number.NaN)).toBe("unknown");
  });
});
